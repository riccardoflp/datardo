/**
 * Feature: aggregate.run
 *
 * Sends the pipeline, up to the stage shown, and reads a page of its output with its count: both at once, the page
 * `db.orders.aggregate([ …stages, { $skip: 0 }, { $limit: 50 } ], { allowDiskUse: true, maxTimeMS: 60000 })` and the
 * count `db.orders.aggregate([ …stages, { $count: "n" } ], { allowDiskUse: true, maxTimeMS: 10000 })`. The documents
 * keep their BSON types (canonical Extended JSON). A pipeline that would write is not sent by this read: it starts
 * `aggregate.write-output`.
 *
 * Started with `{ tab?, pipeline?, page?, pageSize?, whole? }`: the pipeline as the window sends it (the tab's memory
 * when absent), the page from 1, the page size of the table, and `whole` for **Run**, which runs the whole pipeline.
 * While the text is shown, the whole pipeline of the text is run.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import {
  refuse,
  run,
  type After,
  type Context,
  type Outcome,
  type ReadFeature,
  type ReadRequest,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { builtPipeline } from './build';
import { stagesOfEditor } from './edit-as-text';
import { text } from './text';
import {
  collectionTarget,
  editorOf,
  editorPlan,
  editorStep,
  makersOf,
  placeOf,
  runAfter,
  startArgs,
  upToIndex,
  withStages,
  type PipelineEditor,
  type PipelinePlace,
} from './types';

/** How long the page may take on the server, in milliseconds (`maxTimeMS`). */
export const pageTimeLimitMs = 60_000;

/** How long the count may take on the server, in milliseconds (`maxTimeMS`). */
export const countTimeLimitMs = 10_000;

/** The page sizes of the table. */
export const pageSizes: readonly number[] = [10, 20, 50, 100, 200, 500];

/** The page size unless changed. */
export const defaultPageSize = 50;

/** A page of the output, and how many documents the output has; `count` is absent when it is unknown. */
export interface PipelineOutput {
  readonly documents: readonly Json[];
  readonly count?: number;
}

/** A whole number as canonical Extended JSON: an `Int32`, or an `Int64` beyond it. */
export function wholeJson(value: number): Json {
  return value <= 2147483647 ? { $numberInt: String(value) } : { $numberLong: String(value) };
}

/** The options of an aggregation that runs for at most `limitMs` on the server and may use temporary files. */
export function aggregateOptions(limitMs: number): Json {
  return { allowDiskUse: true, maxTimeMS: wholeJson(limitMs) };
}

/** `db.<collection>.aggregate(pipeline, options)` on the collection of a pipeline. */
export function aggregateRequest(place: PipelinePlace, pipeline: readonly Json[], limitMs: number): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    collection: place.collection,
    method: 'aggregate',
    arguments: [pipeline, aggregateOptions(limitMs)],
    timeLimitMs: limitMs,
  };
}

function pageOf(args: Readonly<Record<string, unknown>>): { readonly page: number; readonly size: number } {
  const page = args['page'];
  const size = args['pageSize'];
  return {
    page: typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : 1,
    size: typeof size === 'number' && pageSizes.includes(size) ? size : defaultPageSize,
  };
}

/** The two requests of a page: the page, then the count. */
export function runRequests(
  place: PipelinePlace,
  pipeline: readonly Json[],
  page: number,
  size: number,
): MongoRequest[] {
  const paged = [...pipeline, { $skip: wholeJson((page - 1) * size) }, { $limit: wholeJson(size) }];
  return [
    { ...aggregateRequest(place, paged, pageTimeLimitMs), limit: size },
    { ...aggregateRequest(place, [...pipeline, { $count: 'n' }], countTimeLimitMs), limit: 1 },
  ];
}

/**
 * **Run** (`args.whole`) while a stage is shown: the whole pipeline is shown first, then run. A read cannot change the
 * tab, so it plans the change and starts itself again on the whole pipeline.
 */
function showWholeFirst(place: PipelinePlace, editor: PipelineEditor): Outcome {
  const whole = withStages(editor, editor.stages, undefined);
  const step = editorStep(text.steps.showWhole(place.collection), place, whole);
  return run(editorPlan(text.plans.run, [step], [runAfter(place, whole)]));
}

/** Feature: aggregate.run — the page and the count, or a refusal, or the start of `aggregate.write-output`. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const answers = { args };
  const place = placeOf(context, answers);
  if (place === undefined) {
    return { kind: 'engine', requests: [] };
  }
  const makers = makersOf(context);
  const editor = editorOf(context, answers);
  const read = stagesOfEditor(editor, makers);
  if (!read.ok) {
    return refuse('aggregate.run/invalid-text', read.message);
  }
  if (startArgs(answers)['whole'] === true && editor.text === undefined && editor.shown !== undefined) {
    return showWholeFirst(place, editor);
  }
  const upTo = editor.text === undefined ? upToIndex(editor) : read.stages.length - 1;
  const built = builtPipeline(read.stages, upTo, makers);
  if (!built.ok) {
    return refuse('aggregate.run/invalid-stage', built.message);
  }
  if (built.writes !== undefined) {
    const start: After = {
      kind: 'start',
      feature: featureId('aggregate.write-output'),
      target: collectionTarget(place),
      args,
    };
    return run(editorPlan(text.plans.run, [], [start]));
  }
  const { page, size } = pageOf(startArgs(answers));
  const requests = runRequests(place, built.pipeline, page, size);
  return { kind: 'engine', requests: requests.map((each) => ({ connection: place.connection, request: each })) };
}

function countOf(reply: unknown): number | undefined {
  if (!Array.isArray(reply)) {
    return undefined;
  }
  const [first] = reply as readonly unknown[];
  if (first === undefined) {
    return 0;
  }
  const n = typeof first === 'object' && first !== null ? (first as Record<string, unknown>)['n'] : undefined;
  const inner: unknown = typeof n === 'object' && n !== null ? Object.values(n)[0] : n;
  const count = Number(inner);
  return Number.isFinite(count) ? count : undefined;
}

/** Feature: aggregate.run — the documents of the page and the count; a count that did not answer is left unknown. */
export function parse(replies: readonly unknown[]): PipelineOutput {
  const [page, count] = replies;
  const documents = Array.isArray(page) ? (page as readonly Json[]) : [];
  const total = countOf(count);
  return total === undefined ? { documents } : { documents, count: total };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('aggregate.run'), request, parse };
