/**
 * Feature: query.count
 *
 * Says how many documents the query matches, so that the paging and the status line can show *1–50 of 1,204*: the
 * count the collection keeps of itself for an empty filter on a collection, an exact count otherwise or on a click.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { formattedValue } from './format';
import { isJsonObject, numberOf, type JsonObject } from './mongosh/ejson';
import { checkedQuery, collectionText, failureOf, queryTimeLimitMs } from './run';
import { emptyTexts } from './types';

/** How long a count started with a query may take, in ms (Mongoster's 10 seconds). */
export const countTimeLimitMs = 10_000;

/** What the query runs on: a collection keeps a count of itself, a view and a time series collection do not. */
export type CountedKind = 'collection' | 'view' | 'timeseries';

/** The arguments `query.count` is started with. */
export interface CountArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  /** The text of **Filter** as `query.run` read it. */
  readonly filter: string;
  /** The time the query was run, which `ISODate()` stands for. */
  readonly at: number;
  readonly kind: CountedKind;
  /** A count asked for with a click: exact, with the time limit of `query.run`. */
  readonly exact: boolean;
}

/** A total: how many documents, and whether it is the estimate a collection keeps of itself; or why it is not known. */
export type Count = { readonly count: number; readonly estimated: boolean } | { readonly failure: string };

function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** The arguments of `query.count`, read from JSON. */
export function countArgs(args: Json, context?: Context): CountArgs {
  const fields = isJsonObject(args) ? args : {};
  const target = context?.target.kind === 'collection' ? context.target : undefined;
  const at = fields['at'];
  const kind = fields['kind'];
  return {
    connection: textOf(fields['connection']) || (target?.connection ?? ''),
    database: textOf(fields['database']) || (target?.database ?? ''),
    collection: textOf(fields['collection']) || (target?.collection ?? ''),
    filter: textOf(fields['filter']),
    at: typeof at === 'number' ? at : (context?.now ?? 0),
    kind: kind === 'view' || kind === 'timeseries' ? kind : 'collection',
    exact: fields['exact'] === true,
  };
}

/** Whether the count is the estimate a collection keeps of itself: an empty filter on a collection, not on a click. */
export function isEstimate(asked: CountArgs, filter: JsonObject): boolean {
  return Object.keys(filter).length === 0 && asked.kind === 'collection' && !asked.exact;
}

/** The request of a count: `estimatedDocumentCount` for an empty filter on a collection, `countDocuments` otherwise. */
export function countRequest(asked: CountArgs, filter: JsonObject, queryLimitMs: number): MongoRequest {
  const timeLimitMs = asked.exact ? queryLimitMs : countTimeLimitMs;
  const where = { engine: 'mongodb', database: asked.database, collection: asked.collection, timeLimitMs } as const;
  if (isEstimate(asked, filter)) {
    return { ...where, method: 'estimatedDocumentCount', arguments: [{ maxTimeMS: timeLimitMs }] };
  }
  return { ...where, method: 'countDocuments', arguments: [filter, { maxTimeMS: timeLimitMs }] };
}

/** What the Log records of a count: `db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 10000 })`. */
export function countText(request: MongoRequest): string {
  return `${collectionText(request.collection ?? '')}.${request.method}(${request.arguments.map((each) => formattedValue(each)).join(', ')})`;
}

/**
 * Feature: query.count
 *
 * The count of the filter last run: the estimate of the collection for an empty filter on a collection, the exact
 * `countDocuments` with any filter, on a view or a time series collection, or on a click with the query's time limit.
 */
export function request(context: Context, args: Json): ReadRequest {
  const asked = countArgs(args, context);
  const checked = checkedQuery({ ...emptyTexts, filter: asked.filter }, asked.at);
  if (!checked.ok) {
    throw new Error('query.count is started only with a filter query.run has read.');
  }
  const count = countRequest(asked, checked.query.filter, queryTimeLimitMs(context));
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(asked.connection), request: count }],
    // A count that fails shows the total as `?`, with no message: the documents stay.
    failedRequests: 'are-replies',
  };
}

/** Feature: query.count — the total of the reply, and whether it is an estimate. */
export function parse(replies: readonly unknown[], args: Json): Count {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    return { failure };
  }
  const count = numberOf(reply as Json);
  const asked = countArgs(args);
  const checked = checkedQuery({ ...emptyTexts, filter: asked.filter }, asked.at);
  const estimated = checked.ok && isEstimate(asked, checked.query.filter);
  if (count === undefined) {
    throw new Error('The server answered the count with something that is not a number.');
  }
  return { count, estimated };
}

/** A count as the paging writes it: `1,204`. */
export function countWritten(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
