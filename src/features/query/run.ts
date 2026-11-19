/**
 * Feature: query.run
 *
 * Sends the filter, the sort and the projection of the bar to the server with `find` and gives one page of the
 * result, every value with its BSON type (canonical Extended JSON, D32).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { setting } from '../settings/read';
import { pageWindow, type PageWindow } from '../table/page-window';
import type { Document } from '../table/types';
import { formattedValue, keyText } from './format';
import { isJsonObject, isSubdocument, type JsonObject } from './mongosh/ejson';
import { idOfTime, parsedValue } from './parse';
import { restoredQuery } from './restore';
import { text } from './text';
import { defaultPageSize, isPageSize, type ErrorLine, type QueryField, type QueryTexts } from './types';

/** A query read from the bar: the values to send. */
export interface CheckedQuery {
  readonly filter: JsonObject;
  readonly sort?: JsonObject;
  readonly projection?: JsonObject;
  readonly skip: number;
  readonly limit?: number;
}

/** The query of the bar, or why it is refused and which fields are outlined. */
export type QueryCheck =
  | { readonly ok: true; readonly query: CheckedQuery }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly invalid: readonly QueryField[] };

/** Where the query runs and what is asked: the arguments `query.run` is started with. */
export interface RunArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly texts: QueryTexts;
  readonly page: number;
  readonly pageSize: number;
  /** The time the query is run, which `ISODate()` and `ObjectId()` stand for; the count uses the same. */
  readonly at?: number;
}

/** What a page of the result gives: its documents, or the failure of the server, for the error line. */
export interface RunResult {
  readonly documents: readonly Document[];
  /** The server's message when the `find` failed: the error line shows it, and the table keeps what it showed. */
  readonly failure?: string;
}

function objectOf(written: string, now: number): JsonObject | undefined | 'invalid' {
  if (written.trim() === '') {
    return undefined;
  }
  const parsed = parsedValue(written, now, () => idOfTime(now));
  return parsed.ok && isSubdocument(parsed.value) ? parsed.value : 'invalid';
}

function wholeNumber(written: string): number | undefined {
  const trimmed = written.trim();
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(Number(trimmed)) ? Number(trimmed) : undefined;
}

/**
 * The query of the bar's texts as `query.run` sends it, or its refusal: a field that is not mongosh syntax or not an
 * object (`/syntax`), a **Skip** that is not a whole number, 0 or more (`/skip`), a **Limit** that is not a whole
 * number, 1 or more (`/limit`). Every field at fault is outlined; the message is the first refusal's.
 */
export function checkedQuery(texts: QueryTexts, now: number): QueryCheck {
  const filter = objectOf(texts.filter, now);
  const sort = objectOf(texts.sort, now);
  const projection = objectOf(texts.project, now);
  const skip = texts.skip.trim() === '' ? 0 : wholeNumber(texts.skip);
  const limit = texts.limit.trim() === '' ? undefined : wholeNumber(texts.limit);
  const limitBad = texts.limit.trim() !== '' && (limit === undefined || limit < 1);
  const syntax: QueryField[] = [
    ...(filter === 'invalid' ? (['filter'] as const) : []),
    ...(sort === 'invalid' ? (['sort'] as const) : []),
    ...(projection === 'invalid' ? (['project'] as const) : []),
  ];
  const invalid: QueryField[] = [
    ...syntax,
    ...(skip === undefined ? (['skip'] as const) : []),
    ...(limitBad ? (['limit'] as const) : []),
  ];
  if (syntax.length > 0 || filter === 'invalid' || sort === 'invalid' || projection === 'invalid') {
    return { ok: false, code: 'query.run/syntax', message: text.run.syntax, invalid };
  }
  if (skip === undefined) {
    return { ok: false, code: 'query.run/skip', message: text.run.skip, invalid };
  }
  if (limitBad) {
    return { ok: false, code: 'query.run/limit', message: text.run.limit, invalid };
  }
  return {
    ok: true,
    query: {
      filter: filter ?? {},
      ...(sort === undefined ? {} : { sort }),
      ...(projection === undefined ? {} : { projection }),
      skip,
      ...(limit === undefined ? {} : { limit }),
    },
  };
}

function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** The arguments of `query.run`, read from JSON; a missing part takes its default. */
export function runArgs(args: Json, context?: Context): RunArgs {
  const fields = isJsonObject(args) ? args : {};
  const target = context?.target.kind === 'collection' ? context.target : undefined;
  const kept = restoredQuery({ texts: fields['texts'] });
  const page = fields['page'];
  const at = fields['at'];
  return {
    connection: textOf(fields['connection']) || (target?.connection ?? ''),
    database: textOf(fields['database']) || (target?.database ?? ''),
    collection: textOf(fields['collection']) || (target?.collection ?? ''),
    texts: kept.texts,
    page: typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: isPageSize(fields['pageSize']) ? fields['pageSize'] : defaultPageSize,
    ...(typeof at === 'number' ? { at } : {}),
  };
}

/** The time limit of a query, in ms, from `datardo.query.timeLimitSeconds`. */
export function queryTimeLimitMs(context: Context): number {
  return setting(context.state.settings, 'datardo.query.timeLimitSeconds') * 1000;
}

/** The window of the page asked for, with the **Skip** and **Limit** of the query. */
export function runWindow(query: CheckedQuery, page: number, pageSize: number): PageWindow {
  return pageWindow({ page, pageSize, skip: query.skip, ...(query.limit === undefined ? {} : { limit: query.limit }) });
}

/** The `find` of one page: the filter, then the projection, the sort, the page's `skip` and `limit`, and `maxTimeMS`. */
export function findRequest(
  where: { readonly database: string; readonly collection: string },
  query: CheckedQuery,
  window: PageWindow,
  timeLimitMs: number,
): MongoRequest {
  const options: JsonObject = {
    ...(query.projection === undefined ? {} : { projection: query.projection }),
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    skip: window.skip,
    limit: window.limit,
    maxTimeMS: timeLimitMs,
  };
  return {
    engine: 'mongodb',
    database: where.database,
    collection: where.collection,
    method: 'find',
    arguments: [query.filter, options],
    limit: window.limit,
    timeLimitMs,
  };
}

/** How a collection is written in mongosh: `db.orders`, or `db.getCollection("2024 orders")`. */
export function collectionText(collection: string): string {
  return keyText(collection) === collection && !collection.includes('.')
    ? `db.${collection}`
    : `db.getCollection(${JSON.stringify(collection)})`;
}

/** What the Log records of a `find`: `db.orders.find({ status: "paid" }, { total: 1 }).sort({ createdAt: -1 }).skip(50).limit(50).maxTimeMS(60000)`. */
export function findText(collection: string, query: CheckedQuery, window: PageWindow, timeLimitMs: number): string {
  const projection = query.projection === undefined ? '' : `, ${formattedValue(query.projection)}`;
  const sort = query.sort === undefined ? '' : `.sort(${formattedValue(query.sort)})`;
  return `${collectionText(collection)}.find(${formattedValue(query.filter)}${projection})${sort}.skip(${String(window.skip)}).limit(${String(window.limit)}).maxTimeMS(${String(timeLimitMs)})`;
}

/**
 * Feature: query.run
 *
 * The `find` of the page asked for, with the time limit of `datardo.query.timeLimitSeconds`; or the refusal of a
 * field at fault. `ISODate()` and `ObjectId()` stand for `args.at`, the time the query is run.
 */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = runArgs(args, context);
  const checked = checkedQuery(asked.texts, asked.at ?? context.now);
  if (!checked.ok) {
    switch (checked.code) {
      case 'query.run/skip':
        return refuse('query.run/skip', checked.message);
      case 'query.run/limit':
        return refuse('query.run/limit', checked.message);
      default:
        return refuse('query.run/syntax', checked.message);
    }
  }
  const window = runWindow(checked.query, asked.page, asked.pageSize);
  const find = findRequest(asked, checked.query, window, queryTimeLimitMs(context));
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(asked.connection), request: find }],
    // A failure of the server is shown on the error line of the bar, in the server's words, not as a notification.
    failedRequests: 'are-replies',
  };
}

/** Feature: query.run — the documents of the page, as the server gave them, every type kept. */
export function parse(replies: readonly unknown[]): RunResult {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    return { documents: [], failure };
  }
  const documents = Array.isArray(reply) ? reply.filter((each): each is Document => isJsonObject(each as Json)) : [];
  return { documents };
}

/** The message of a request that failed, as the runner gives it to a Read that takes failures as replies. */
export function failureOf(reply: unknown): string | undefined {
  if (typeof reply !== 'object' || reply === null || Array.isArray(reply)) {
    return undefined;
  }
  const fields = reply as Readonly<Record<string, unknown>>;
  return fields['kind'] === 'error' && typeof fields['message'] === 'string' ? fields['message'] : undefined;
}

/** Whether a failure of the server is the time limit: `MaxTimeMSExpired` (code 50) or the driver's timeout. */
export function isTimeLimit(code: string | number | undefined, message: string): boolean {
  return code === 50 || code === 'MaxTimeMSExpired' || /MaxTimeMSExpired|exceeded time limit|timed out/i.test(message);
}

/** The error line of a failure: the time limit with the seconds of the setting, or the server's own words. */
export function failureLine(
  failure: { readonly code?: string | number; readonly message: string },
  timeLimitMs: number,
): ErrorLine {
  if (isTimeLimit(failure.code, failure.message)) {
    return { message: text.run.timeLimit(Math.round(timeLimitMs / 1000)), details: failure.message, runAgain: true };
  }
  return { message: failure.message, details: failure.message, runAgain: true };
}

/** The error line of a query cancelled by the user. */
export const cancelledLine: ErrorLine = { message: text.run.cancelled, runAgain: true };
