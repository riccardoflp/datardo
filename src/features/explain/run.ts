/**
 * Feature: explain.run
 *
 * Asks the server for the explain of the query of the bar or of the pipeline, with the verbosity `executionStats`, so
 * that the server runs it to count what it examines. It is sent as the `explain` command, which is what
 * `db.orders.find(…).explain("executionStats")` and `db.orders.explain("executionStats").aggregate(…)` send:
 *
 * - in **Find**: `{ explain: { find: "orders", filter, sort, projection }, verbosity: "executionStats", maxTimeMS:
 *   60000 }`, with the texts of the query bar as typed, run or not, without the skip and the limit;
 * - in **Aggregate**: `{ explain: { aggregate: "orders", pipeline, cursor: {}, allowDiskUse: true }, verbosity:
 *   "executionStats", maxTimeMS: 60000 }`, with the enabled stages up to the stage shown (`aggregate.build`).
 *
 * The time limit is on the `explain` command itself: MongoDB 8.2 ignores a `maxTimeMS` inside the command explained.
 * A query stopped by it is not an error of the command: the server answers with `executionSuccess: false` and its
 * message in the statistics, which {@link ExplainResult.failure} carries.
 *
 * It writes nothing: a pipeline that ends with `$out` or `$merge` is refused before anything is sent. Started with
 * `{ tab?, mode, query?, pipeline? }`: the collection tab (the active one when absent), **Find** or **Aggregate**, the
 * texts of the bar `{ filter, sort, projection }`, and the pipeline as the window sends it (the tab's memory when
 * absent; the index suggestion of a pipeline needs it sent).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { builtPipeline } from '../aggregate/build';
import { stagesOfEditor } from '../aggregate/edit-as-text';
import type { Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { wholeJson } from '../aggregate/run';
import { editorOf, makersOf, placeOf, readEditor, startArgs, upToIndex, type PipelinePlace } from '../aggregate/types';
import { suggestedIndex } from './suggest-index';
import { explainSummary, statisticsOf } from './summary';
import { text } from './text';
import { isJsonDocument, type ExplainKind, type ExplainSummary, type IndexKey, type JsonDocument } from './types';

/** How long the server may work on the explain, in milliseconds: it is given up after 60 seconds. */
export const explainTimeLimitMs = 60_000;

/** The texts of the query bar, as typed. */
export interface QueryTexts {
  readonly filter: string;
  readonly sort: string;
  readonly projection: string;
}

/** A field of the query bar that a refusal marks. */
export type QueryField = keyof QueryTexts;

/** The query read from the texts of the bar, or the field that is not valid and why. */
export type ReadQuery =
  | {
      readonly ok: true;
      readonly filter: JsonDocument;
      readonly sort?: JsonDocument;
      readonly projection?: JsonDocument;
    }
  | { readonly ok: false; readonly field: QueryField; readonly message: string };

/** What the Explain section shows of an explain: its kind, the output kept for **Raw**, the summary, the suggestion. */
export interface ExplainResult {
  readonly kind: ExplainKind;
  /** The output as the server returned it, with its types (`explain.raw`). */
  readonly output: Json;
  readonly summary: ExplainSummary;
  /** Given only when the explain has a COLLSCAN or an in-memory sort and the query has something an index serves. */
  readonly suggestion?: readonly IndexKey[];
  /** The server's message when the query explained failed, as when it took longer than the time limit. */
  readonly failure?: string;
}

type ReadText = { readonly ok: true; readonly value?: JsonDocument } | { readonly ok: false; readonly message: string };

function readText(typed: string | undefined, makers: Makers): ReadText {
  if (typed === undefined || typed.trim() === '') {
    return { ok: true };
  }
  const parsed = valueOf(typed, makers);
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  return isJsonDocument(parsed.value)
    ? { ok: true, value: parsed.value }
    : { ok: false, message: text.refusals.mustBeObject };
}

/** The filter, the sort and the projection of the texts of the bar; an empty filter is `{}`. */
export function readQuery(texts: Partial<QueryTexts>, makers: Makers): ReadQuery {
  const fields: readonly QueryField[] = ['filter', 'sort', 'projection'];
  const read: Partial<Record<QueryField, JsonDocument>> = {};
  for (const field of fields) {
    const result = readText(texts[field], makers);
    if (!result.ok) {
      return { ok: false, field, message: result.message };
    }
    if (result.value !== undefined) {
      read[field] = result.value;
    }
  }
  const { filter = {}, sort, projection } = read;
  return {
    ok: true,
    filter,
    ...(sort === undefined ? {} : { sort }),
    ...(projection === undefined ? {} : { projection }),
  };
}

/** The filter and the sort a pipeline gives `explain.suggest-index`: of a first `$match` and a `$sort` after it. */
export function indexQueryOfPipeline(pipeline: readonly Json[]): { readonly filter?: Json; readonly sort?: Json } {
  const [first, second] = pipeline.filter(isJsonDocument);
  if (first !== undefined && '$match' in first) {
    const sort = second !== undefined && '$sort' in second ? second['$sort'] : undefined;
    return { filter: first['$match'], ...(sort === undefined ? {} : { sort }) };
  }
  return first !== undefined && '$sort' in first ? { sort: first['$sort'] } : {};
}

function explainRequest(place: PipelinePlace, explained: JsonDocument): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    method: 'runCommand',
    arguments: [{ explain: explained, verbosity: 'executionStats', maxTimeMS: wholeJson(explainTimeLimitMs) }],
    timeLimitMs: explainTimeLimitMs,
  };
}

function texts(args: Readonly<Record<string, unknown>>): Partial<QueryTexts> {
  const query = args['query'];
  const given = startArgs({ args: query });
  const textOf = (field: QueryField): string => {
    const typed = given[field];
    return typeof typed === 'string' ? typed : '';
  };
  return { filter: textOf('filter'), sort: textOf('sort'), projection: textOf('projection') };
}

/** The command that is explained, or the refusal that sends nothing. */
type Explained = { readonly command: JsonDocument } | { readonly refused: Outcome };

function findCommand(place: PipelinePlace, args: Readonly<Record<string, unknown>>, makers: Makers): Explained {
  const query = readQuery(texts(args), makers);
  if (!query.ok) {
    return { refused: refuse('explain.run/invalid-query', text.refusals.invalidQuery) };
  }
  const command: JsonDocument = {
    find: place.collection,
    filter: query.filter,
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    ...(query.projection === undefined ? {} : { projection: query.projection }),
  };
  return { command };
}

function aggregateCommand(place: PipelinePlace, context: Context, args: Json): Explained {
  const makers = makersOf(context);
  const editor = editorOf(context, { args });
  const read = stagesOfEditor(editor, makers);
  if (!read.ok) {
    return { refused: refuse('explain.run/invalid-stage', read.message) };
  }
  const upTo = editor.text === undefined ? upToIndex(editor) : read.stages.length - 1;
  const built = builtPipeline(read.stages, upTo, makers);
  if (!built.ok) {
    return { refused: refuse('explain.run/invalid-stage', built.message) };
  }
  if (built.writes !== undefined) {
    return { refused: refuse('explain.run/writes', text.refusals.writes(built.writes.name)) };
  }
  const command: JsonDocument = {
    aggregate: place.collection,
    pipeline: built.pipeline,
    cursor: {},
    allowDiskUse: true,
  };
  return { command };
}

function kindOf(args: Readonly<Record<string, unknown>>): ExplainKind {
  return args['mode'] === 'aggregate' ? 'pipeline' : 'find';
}

/** Feature: explain.run — the explain command of the query or of the pipeline, or why it is not sent. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const place = placeOf(context, { args });
  if (place === undefined) {
    return { kind: 'engine', requests: [] };
  }
  const given = startArgs({ args });
  const explained =
    kindOf(given) === 'pipeline'
      ? aggregateCommand(place, context, args)
      : findCommand(place, given, makersOf(context));
  if ('refused' in explained) {
    return explained.refused;
  }
  const sent = explainRequest(place, explained.command);
  return { kind: 'engine', requests: [{ connection: place.connection, request: sent }] };
}

/**
 * Makers with a fixed time and id, for reading the query again in `parse`: the suggestion needs the names of the
 * fields and the kind of each condition, never the values `ISODate()` or `ObjectId()` would make.
 */
const fixedMakers: Makers = { now: 0, newId: () => '000000000000000000000000' };

/** The filter and the sort of what was explained, for `explain.suggest-index`. */
function indexQuery(args: Json): { readonly filter?: Json; readonly sort?: Json } {
  const given = startArgs({ args });
  if (kindOf(given) === 'find') {
    const query = readQuery(texts(given), fixedMakers);
    return query.ok ? { filter: query.filter, ...(query.sort === undefined ? {} : { sort: query.sort }) } : {};
  }
  const editor = readEditor(given['pipeline']);
  const read = editor === undefined ? undefined : stagesOfEditor(editor, fixedMakers);
  if (editor === undefined || read?.ok !== true) {
    return {};
  }
  const built = builtPipeline(
    read.stages,
    editor.text === undefined ? upToIndex(editor) : read.stages.length - 1,
    fixedMakers,
  );
  return built.ok ? indexQueryOfPipeline(built.pipeline) : {};
}

/** The message of a query that failed while it was explained: `executionSuccess: false` in its statistics. */
export function failureOf(output: Json): string | undefined {
  const statistics = statisticsOf(output);
  if (statistics?.['executionSuccess'] !== false) {
    return undefined;
  }
  const message = statistics['errorMessage'];
  return typeof message === 'string' ? message : text.failed;
}

/** Feature: explain.run — the output kept with its types, its summary, and the suggested index when one is offered. */
export function parse(replies: readonly unknown[], args: Json): ExplainResult {
  const [reply] = replies;
  const output = (reply ?? null) as Json;
  const summary = explainSummary(output);
  const failure = failureOf(output);
  const result: ExplainResult = {
    kind: kindOf(startArgs({ args })),
    output,
    summary,
    ...(failure === undefined ? {} : { failure }),
  };
  if (!summary.collscan && !summary.inMemorySort) {
    return result;
  }
  const { filter, sort } = indexQuery(args);
  const suggestion = suggestedIndex(filter, sort);
  return suggestion === undefined ? result : { ...result, suggestion };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('explain.run'), request, parse };
