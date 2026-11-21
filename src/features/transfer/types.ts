/**
 * What the cards of the transfer area share: a collection on a connection, the steps that create a collection, insert
 * documents and build indexes (also those of a restore, `backup.restore`), and the reading of answers.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { ConnectionView } from '../../shared/connection';
import type { Context, EngineStep, OnFailure, Undo } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import type { Target } from '../../shared/target';
import type { DocumentsFeed, FedStep, FedWork, JsonDocument } from '../backup/types';
import { stepText } from '../runner/step-text';
import { setting } from '../settings/read';
import { undoText } from './text';

export type { JsonDocument };

/** A collection on a connection. */
export interface Namespace {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

/** The options of a collection that a copy and a restore create it with (Mongoster's `COPIED_OPTIONS`). */
export const copiedOptionNames: readonly string[] = [
  'validator',
  'validationLevel',
  'validationAction',
  'capped',
  'size',
  'max',
  'collation',
  'timeseries',
  'expireAfterSeconds',
  'clusteredIndex',
  'changeStreamPreAndPostImages',
];

/** The documents an insert step writes at once. */
export const batchSize = 1000;

/** Of a collection's options, only those a copy keeps, in their order. */
export function copiedOptions(options: JsonDocument | undefined): JsonDocument {
  return Object.fromEntries(Object.entries(options ?? {}).filter(([name]) => copiedOptionNames.includes(name)));
}

/** A write to a collection, its text written as `runner.step-text` writes it for the plan's target. */
export function writeStep(
  on: Namespace,
  call: { readonly method: string; readonly arguments: readonly Json[]; readonly onDatabase?: boolean },
  target: Target,
  onFailure?: OnFailure,
): EngineStep {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: on.database,
    ...(call.onDatabase === true ? {} : { collection: on.collection }),
    method: call.method,
    arguments: call.arguments,
  };
  const step = { kind: 'engine' as const, connection: on.connection, request, writes: true };
  return { ...step, text: stepText(step, target), ...(onFailure === undefined ? {} : { onFailure }) };
}

/** `db.<collection>.drop()`. */
export function dropStep(on: Namespace, target: Target): EngineStep {
  return writeStep(on, { method: 'drop', arguments: [] }, target);
}

/** `db.createCollection("<collection>", <options>)`. */
export function createCollectionStep(on: Namespace, options: JsonDocument, target: Target): EngineStep {
  return writeStep(on, { method: 'createCollection', arguments: [on.collection, options], onDatabase: true }, target);
}

/** The options a view is created with: `viewOn`, `pipeline`, and its `collation` when it has one. */
export function viewOptions(options: JsonDocument | undefined): JsonDocument {
  const collation = options?.['collation'];
  return {
    viewOn: options?.['viewOn'] ?? '',
    pipeline: options?.['pipeline'] ?? [],
    ...(collation === undefined ? {} : { collation }),
  };
}

/**
 * An insert whose documents come from a feed, batch by batch: `insertMany` with the options given, or for
 * `bulkWrite` a `replaceOne` by `_id` with `upsert` for each document (an `insertOne` for one without `_id`). The text
 * says where the documents come from: `db.orders.insertMany([<documents of orders.bson>], { ordered: false })`.
 */
export function fedStep(
  on: Namespace,
  fed: {
    readonly method: 'insertMany' | 'bulkWrite';
    readonly options: JsonDocument;
    readonly from: string;
    readonly feed: DocumentsFeed;
  },
  target: Target,
  work?: FedWork,
): FedStep {
  const step = writeStep(on, { method: fed.method, arguments: [[], fed.options] }, target);
  const text = step.text.replace(`.${fed.method}([]`, `.${fed.method}([<${fed.from}>]`);
  return { ...step, text, feed: fed.feed, batches: { documents: batchSize }, ...(work === undefined ? {} : { work }) };
}

/**
 * `db.<collection>.createIndexes([<index>])` for each index except `_id_` and a clustered one, without its `v` and
 * `ns`; an index that fails is said in the result, and the others are still created.
 */
export function indexSteps(on: Namespace, indexes: readonly JsonDocument[], target: Target): readonly EngineStep[] {
  return indexes
    .filter((index) => index['name'] !== '_id_' && index['clustered'] === undefined)
    .map(({ v: _v, ns: _ns, ...index }) =>
      writeStep(on, { method: 'createIndexes', arguments: [[index]] }, target, { kind: 'go-on' }),
    );
}

/** The number of indexes besides `_id_` (and a clustered one). */
export function indexCount(indexes: readonly JsonDocument[]): number {
  return indexes.filter((index) => index['name'] !== '_id_' && index['clustered'] === undefined).length;
}

/**
 * What the undo history keeps of a write that inserts or replaces documents in batches (`undo.record`): the
 * collection, and the operation's title. `inserted`: the `_id`s the steps insert, each kept as *did not exist*;
 * `replaced`: also the documents each batch replaces, as they were, read before the batch by their `_id`s.
 */
export interface BatchKeeps extends Namespace {
  readonly kind: 'inserted' | 'replaced';
  readonly title: string;
}

/**
 * The undo of a write of `count` documents, as `undo.note` decides it: kept when the undo history is on, the
 * connection keeps it, and `count` is within `datardo.undo.maxDocumentsPerOperation`; otherwise why it is not.
 */
export function insertUndo(
  context: Context,
  connection: ConnectionView,
  count: number,
  keeps: Omit<BatchKeeps, 'kind'> & { readonly kind?: BatchKeeps['kind'] },
): Undo {
  if (!setting(context.state.settings, 'datardo.undo.enabled') || !connection.keepsUndo || connection.readOnly) {
    return { cannot: undoText.off };
  }
  const most = setting(context.state.settings, 'datardo.undo.maxDocumentsPerOperation');
  if (count > most) {
    return { cannot: undoText.overLimit(most) };
  }
  const kept: BatchKeeps = { kind: 'inserted', ...keeps };
  return { keeps: { ...kept } };
}

/** A text answer, trimmed; empty when there is none. */
export function answerText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A value of relaxed Extended JSON, as `JSON.parse` gives it: an exported or imported document's values. */
export type RelaxedValue = unknown;

/** The keys of Extended JSON's type wrappers, `{ $oid: … }` and the others. */
export const wrapperKeys: ReadonlySet<string> = new Set([
  '$oid',
  '$date',
  '$numberLong',
  '$numberDecimal',
  '$numberInt',
  '$numberDouble',
  '$binary',
  '$uuid',
  '$regularExpression',
  '$timestamp',
  '$minKey',
  '$maxKey',
  '$symbol',
  '$code',
  '$undefined',
  '$dbPointer',
]);

/** An object that is not an array. */
export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A type wrapper of Extended JSON, `{ $oid: "…" }`, as opposed to a sub-document or an operator. */
export function isWrapper(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  const first = keys[0];
  return first !== undefined && wrapperKeys.has(first) && (keys.length === 1 || first === '$code');
}

/** A sub-document: an object that is not a type wrapper. */
export function isSubdocument(value: unknown): value is Readonly<Record<string, unknown>> {
  return isPlainObject(value) && !isWrapper(value);
}
