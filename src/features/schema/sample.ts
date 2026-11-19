/**
 * Feature: schema.sample
 *
 * Reads the documents the Schema section analyzes: every document that matches the filter of the query bar when they
 * are no more than the size chosen in **Sample**, a random sample of them otherwise. Two commands, the second chosen
 * by the reply of the first:
 *
 * 1. the count: `db.orders.estimatedDocumentCount()` when the filter is empty and the tab is not of a view, otherwise
 *    `db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 60000 })`;
 * 2. the documents: `db.orders.aggregate([{ $match: … }, { $sample: { size: 1000 } }], { allowDiskUse: true, maxTimeMS:
 *    120000 })` when more documents match than the size, the same with `{ $limit: 1000 }` otherwise.
 *
 * Because the second command depends on the first, and the analysis of up to 10,000 documents runs on a worker
 * thread, the read is an app read ({@link sampleAction}): the main process sends {@link SampleWork.count}, then the
 * request {@link documentsRequest} chooses, gives the documents to `schema.analyze` on a worker
 * ({@link analysisBatch} documents at a time, checking for cancellation between batches), and answers with a
 * {@link SampleReply}. Everything that is decided is decided here. Nothing is written.
 *
 * Started with `{ tab?, filter?, size? }`: the collection tab (the active one when absent), the text of the filter as
 * typed, and the size of the sample, 1,000 unless another is chosen.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { valueOf } from '../aggregate/mongosh/parse';
import { wholeJson } from '../aggregate/run';
import { makersOf, placeOf, startArgs, type PipelinePlace } from '../aggregate/types';
import { analysisBatch } from './analyze';
import { text } from './text';
import { isJsonDocument, type JsonDocument, type SchemaSummary } from './types';

export { analysisBatch };

/** The sizes of **Sample**. */
export const sampleSizes: readonly number[] = [100, 1000, 10_000];

/** The size chosen at first. */
export const firstSampleSize = 1000;

/** How long the count may take on the server, in milliseconds. */
export const countTimeLimitMs = 60_000;

/** How long reading the documents may take on the server, in milliseconds. */
export const documentsTimeLimitMs = 120_000;

/** The app read the main process carries out for this feature. */
export const sampleAction = 'schema.read-sample';

/** What the main process is asked to do: send the count, then one of the two document requests, then analyze. */
export interface SampleWork {
  readonly connection: string;
  readonly count: MongoRequest;
  /** Sent when more documents match than the size. */
  readonly sampled: MongoRequest;
  /** Sent when they do not: every matching document. */
  readonly whole: MongoRequest;
  readonly size: number;
}

/** What the main process answers: the count, the summary the worker made of the documents, and the time it all took. */
export interface SampleReply {
  readonly count: number;
  readonly summary: SchemaSummary;
  readonly milliseconds: number;
}

/** What the Schema section shows of a sample. */
export interface SampleResult {
  readonly summary: SchemaSummary;
  /** The documents that match: the count, or the documents read when that is larger, as an estimate can be. */
  readonly outOf: number;
  readonly milliseconds: number;
}

/** The size of the sample: one of {@link sampleSizes}, 1,000 otherwise. */
export function sampleSize(value: unknown): number {
  return typeof value === 'number' && sampleSizes.includes(value) ? value : firstSampleSize;
}

/** The filter of the text as typed: empty for no text, or the reason it is not a filter. */
export function readFilter(
  typed: unknown,
  context: Context,
): { readonly ok: true; readonly filter: JsonDocument } | { readonly ok: false; readonly message: string } {
  if (typeof typed !== 'string' || typed.trim() === '') {
    return { ok: true, filter: {} };
  }
  const parsed = valueOf(typed, makersOf(context));
  if (!parsed.ok) {
    return { ok: false, message: parsed.message };
  }
  return isJsonDocument(parsed.value)
    ? { ok: true, filter: parsed.value }
    : { ok: false, message: text.refusals.mustBeObject };
}

function onCollection(place: PipelinePlace, method: string, args: readonly Json[], limitMs: number): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    collection: place.collection,
    method,
    arguments: args,
    timeLimitMs: limitMs,
  };
}

/** The count: estimated without a filter on a collection, counted with a filter or on a view. */
export function countRequest(place: PipelinePlace, filter: JsonDocument): MongoRequest {
  const empty = Object.keys(filter).length === 0;
  return empty && !place.view
    ? onCollection(place, 'estimatedDocumentCount', [], countTimeLimitMs)
    : onCollection(place, 'countDocuments', [filter, { maxTimeMS: wholeJson(countTimeLimitMs) }], countTimeLimitMs);
}

function readingRequest(place: PipelinePlace, filter: JsonDocument, stage: JsonDocument, size: number): MongoRequest {
  const match = Object.keys(filter).length === 0 ? [] : [{ $match: filter }];
  const options = { allowDiskUse: true, maxTimeMS: wholeJson(documentsTimeLimitMs) };
  return { ...onCollection(place, 'aggregate', [[...match, stage], options], documentsTimeLimitMs), limit: size };
}

/** The work of a sample: the count and the two ways of reading the documents. */
export function sampleWork(place: PipelinePlace, filter: JsonDocument, size: number): SampleWork {
  return {
    connection: place.connection,
    count: countRequest(place, filter),
    sampled: readingRequest(place, filter, { $sample: { size: wholeJson(size) } }, size),
    whole: readingRequest(place, filter, { $limit: wholeJson(size) }, size),
    size,
  };
}

/** The count from the reply of {@link SampleWork.count}: a number, or a number of canonical Extended JSON; else 0. */
export function countOfReply(reply: unknown): number {
  if (typeof reply === 'number') {
    return reply;
  }
  const inner: unknown = typeof reply === 'object' && reply !== null ? Object.values(reply)[0] : undefined;
  const count = Number(inner);
  return typeof inner === 'string' && Number.isFinite(count) ? count : 0;
}

/** The documents request to send once the count is known: a random sample when more match than the size. */
export function documentsRequest(work: SampleWork, count: number): MongoRequest {
  return count > work.size ? work.sampled : work.whole;
}

/** Feature: schema.sample — the work of the sample, or the refusal of a filter that is not valid. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const given = startArgs({ args });
  const place = placeOf(context, { args });
  if (place === undefined) {
    return { kind: 'engine', requests: [] };
  }
  const filter = readFilter(given['filter'], context);
  if (!filter.ok) {
    return refuse('schema.sample/invalid-filter', text.refusals.invalidFilter);
  }
  const work = sampleWork(place, filter.filter, sampleSize(given['size']));
  return { kind: 'app', action: sampleAction, args: work as unknown as Json };
}

function replyOf(reply: unknown): SampleReply {
  const given = (typeof reply === 'object' && reply !== null ? reply : {}) as Partial<SampleReply>;
  return {
    count: typeof given.count === 'number' ? given.count : 0,
    summary: given.summary ?? { analyzed: 0, fields: [] },
    milliseconds: typeof given.milliseconds === 'number' ? given.milliseconds : 0,
  };
}

/** Feature: schema.sample — what the section shows: the summary, out of how many documents, and the time. */
export function parse(replies: readonly unknown[]): SampleResult {
  const reply = replyOf(replies[0]);
  return {
    summary: reply.summary,
    outOf: Math.max(reply.count, reply.summary.analyzed),
    milliseconds: reply.milliseconds,
  };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('schema.sample'), request, parse };
