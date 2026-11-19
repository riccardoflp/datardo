/**
 * Feature: oplog.playground-writes — the writes of a playground script are published like the others, and those of a
 * transaction only once it commits.
 *
 * The playground (M28) runs the script's write in the main process. Before it, it reads what {@link readBefore} says
 * (in the write's session when it has one), runs the write restricted by {@link restrictedFilter}, and gives what it
 * learned as a {@link PlaygroundWrite} to {@link plan}, whose plan is the `PUBLISH` commands of `oplog.publish`. In a
 * transaction, {@link pendingAfter} keeps the writes until the commit.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import type { WriteEffect } from './publish';
import { plan as publish } from './publish';
import { documentFields } from './updated-fields';

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

function present(id: Json | undefined): id is Json {
  return id !== undefined && id !== null;
}

/** The filter restricted to the document found: `_id: <found>`, inside `$and` when the filter already has `_id`. */
export function restrictedFilter(filter: Json, id: Json): Json {
  const fields = fieldsOf(filter);
  return '_id' in fields ? { $and: [filter, { _id: id }] } : { ...fields, _id: id };
}

/** What a write reads before it runs: the document it changes (with its sort), the `_id`s of many, or the bulk's. */
export type ReadBefore =
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly filter: Json; readonly sort?: Json; readonly whole: boolean }
  | { readonly kind: 'many'; readonly filter: Json }
  | { readonly kind: 'bulk' };

/** What to read before a write of the script; with a session in its options, the read runs in it. */
export function readBefore(method: string, args: readonly Json[]): ReadBefore {
  const [filter = {}, , options] = args;
  const sort = fieldsOf(method.startsWith('findOneAnd') ? args[2] : options)['sort'];
  switch (method) {
    case 'updateOne':
    case 'deleteOne':
    case 'findOneAndUpdate':
    case 'findOneAndDelete':
      return { kind: 'one', filter, ...(sort === undefined ? {} : { sort }), whole: false };
    case 'replaceOne':
    case 'findOneAndReplace':
      return { kind: 'one', filter, ...(sort === undefined ? {} : { sort }), whole: true };
    case 'updateMany':
    case 'deleteMany':
      return { kind: 'many', filter };
    case 'bulkWrite':
      return { kind: 'bulk' };
    default:
      return { kind: 'none' };
  }
}

/** Which operations of a failed bulk write ran: all but the failed ones, and an ordered write stops at the first. */
export function ranOperations(total: number, failed: readonly number[], ordered: boolean): readonly number[] {
  const stop = ordered ? Math.min(total, ...failed) : total;
  const failures = new Set(failed);
  return Array.from({ length: total }, (_, index) => index).filter((index) => index < stop && !failures.has(index));
}

/** What the playground learned of one write: what it found before, what the server answered, what failed. */
export interface PlaygroundWrite {
  readonly method: string;
  readonly arguments: readonly Json[];
  /** The document found before a write of one document (`{ _id }` only, but whole for a replacement); none found. */
  readonly found?: Json;
  /** The `_id`s matched before `updateMany` and `deleteMany`. */
  readonly matched?: readonly Json[];
  /** The server's reply; for `findOneAnd…`, the document it returned (`null` when none). */
  readonly result?: Json;
  /** The indexes of the operations of `insertMany` that failed. */
  readonly failed?: readonly number[];
  /** For `bulkWrite`: the documents it may touch, read before and after. */
  readonly before?: readonly Json[];
  readonly after?: readonly Json[];
}

function idOf(document: Json | undefined): Json | undefined {
  const id = fieldsOf(document)['_id'];
  return present(id) ? id : undefined;
}

function count(result: Json | undefined, field: string): number {
  const value = fieldsOf(result)[field];
  const number =
    typeof value === 'number' ? value : Number(fieldsOf(value)['$numberInt'] ?? fieldsOf(value)['$numberLong']);
  return Number.isFinite(number) ? number : 0;
}

function insertEffect(write: PlaygroundWrite): WriteEffect {
  if (write.method === 'insertOne') {
    const id = fieldsOf(write.result)['insertedId'] ?? idOf(write.arguments[0]);
    return present(id) ? { kind: 'inserted', ids: [id] } : { kind: 'none' };
  }
  const documents = Array.isArray(write.arguments[0]) ? (write.arguments[0] as readonly Json[]) : [];
  const ordered = fieldsOf(write.arguments[1])['ordered'] !== false;
  const ran = new Set(ranOperations(documents.length, write.failed ?? [], ordered));
  return {
    kind: 'inserted',
    ids: documents.flatMap((each, index) => (ran.has(index) ? [idOf(each) ?? null] : [])).filter(present),
  };
}

function oneEffect(write: PlaygroundWrite): WriteEffect {
  const found = idOf(write.found);
  const upserted = fieldsOf(write.result)['upsertedId'];
  if (present(upserted)) {
    return { kind: 'inserted', ids: [upserted] };
  }
  if (found === undefined) {
    return { kind: 'none' };
  }
  switch (write.method) {
    case 'updateOne':
      return count(write.result, 'modifiedCount') > 0
        ? { kind: 'updated', ids: [found], update: write.arguments[1] ?? null }
        : { kind: 'none' };
    case 'replaceOne':
      return count(write.result, 'modifiedCount') > 0
        ? { kind: 'replaced', ids: [found], fields: documentFields(write.found, write.arguments[1]) }
        : { kind: 'none' };
    default:
      return count(write.result, 'deletedCount') > 0 ? { kind: 'removed', ids: [found], deleted: 1 } : { kind: 'none' };
  }
}

function findAndModifyEffect(write: PlaygroundWrite): WriteEffect {
  const found = idOf(write.found);
  const returned = write.result ?? null;
  if (found === undefined) {
    // Nothing matched: an upsert inserted the document it returned, or the one now matching.
    const options = fieldsOf(write.method === 'findOneAndDelete' ? write.arguments[1] : write.arguments[2]);
    const inserted = idOf(returned) ?? idOf(write.after?.[0]);
    return options['upsert'] === true && inserted !== undefined
      ? { kind: 'inserted', ids: [inserted] }
      : { kind: 'none' };
  }
  if (returned === null) {
    return { kind: 'none' };
  }
  switch (write.method) {
    case 'findOneAndUpdate':
      return { kind: 'updated', ids: [found], update: write.arguments[1] ?? null };
    case 'findOneAndReplace':
      return { kind: 'replaced', ids: [found], fields: documentFields(write.found, write.arguments[1]) };
    default:
      return { kind: 'removed', ids: [found], deleted: 1 };
  }
}

function manyEffect(write: PlaygroundWrite): WriteEffect {
  const upserted = fieldsOf(write.result)['upsertedId'];
  if (present(upserted)) {
    return { kind: 'inserted', ids: [upserted] };
  }
  const matched = write.matched ?? [];
  if (write.method === 'deleteMany') {
    return { kind: 'removed', ids: matched, deleted: count(write.result, 'deletedCount') };
  }
  return count(write.result, 'modifiedCount') > 0
    ? { kind: 'updated', ids: matched, update: write.arguments[1] ?? null }
    : { kind: 'none' };
}

/** What a write of the script did, as `oplog.publish` publishes it. */
export function playgroundEffect(write: PlaygroundWrite): WriteEffect {
  switch (write.method) {
    case 'insertOne':
    case 'insertMany':
      return insertEffect(write);
    case 'updateOne':
    case 'replaceOne':
    case 'deleteOne':
      return oneEffect(write);
    case 'findOneAndUpdate':
    case 'findOneAndReplace':
    case 'findOneAndDelete':
      return findAndModifyEffect(write);
    case 'updateMany':
    case 'deleteMany':
      return manyEffect(write);
    case 'bulkWrite':
      return { kind: 'changes', before: write.before ?? [], after: write.after ?? [] };
    default:
      return { kind: 'none' };
  }
}

/** What happens to a transaction's session: a write in it, a new attempt, a commit, an abort, its end. */
export type SessionSignal =
  | { readonly kind: 'write'; readonly write: Json }
  | { readonly kind: 'attempt' }
  | { readonly kind: 'commit' }
  | { readonly kind: 'abort' }
  | { readonly kind: 'end' };

/**
 * The writes of a transaction kept until it commits: a commit publishes them in their order; an abort, a failed
 * commit, a session ended with its transaction open, or a new attempt of `withTransaction` drops them.
 */
export function pendingAfter(
  pending: readonly Json[],
  signal: SessionSignal,
): { readonly pending: readonly Json[]; readonly publish: readonly Json[] } {
  switch (signal.kind) {
    case 'write':
      return { pending: [...pending, signal.write], publish: [] };
    case 'commit':
      return { pending: [], publish: pending };
    case 'attempt':
    case 'abort':
    case 'end':
      return { pending: [], publish: [] };
  }
}

/**
 * Feature: oplog.playground-writes. `answers.args` holds the connection, the written database and collection, and the
 * {@link PlaygroundWrite}; the plan is that of `oplog.publish` for its effect.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = fieldsOf(answers['args']);
  const write = args['write'] as unknown as PlaygroundWrite | undefined;
  const effect: WriteEffect = write === undefined ? { kind: 'none' } : playgroundEffect(write);
  return publish(context, {
    ...answers,
    args: {
      connection: args['connection'] ?? null,
      database: args['database'] ?? null,
      collection: args['collection'] ?? null,
      effect: effect as unknown as Json,
    },
  });
}
