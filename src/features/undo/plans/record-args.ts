/**
 * What the runner needs to record a plan in the undo history (`undo.record`, `runner.run`): the arguments it gives
 * `undo.record` from the plan, the target of the write, the operation the plan undoes, the `_id`s of inserts that
 * failed, and the operation that was added once the plan's record was saved. Pure, so that the runner only carries it
 * out.
 */
import type { Json } from '../../../shared/engine-request';
import type { AppStep, EngineStep, Plan, Step } from '../../../shared/feature';
import type { RecordArgs } from '../record';
import { beforeReadOf } from '../reads/keep';
import type { Keeps, OperationId, OperationTarget, UndoEntry } from '../types';
import { fieldsOf, keepsOf, operationId } from '../types';

/** The app step of `undo.revert` that marks the operation it undoes as undone. */
export const markUndoneAction = 'undo.mark-undone';

/** The app step of `undo.record` that writes an operation's file. */
export const writeOperationAction = 'undo.write-operation';

/** The app step of `undo.record` that adds the operation to the index. */
export const addOperationAction = 'undo.add-operation';

function appSteps(steps: readonly Step[], action: string): readonly AppStep[] {
  return steps.filter((step): step is AppStep => step.kind === 'app' && step.action === action);
}

/** The operation a plan undoes: the `operation` of its step that marks it undone; none for any other plan. */
export function undoneOperation(plan: Plan): OperationId | undefined {
  const [mark] = appSteps(plan.steps, markUndoneAction);
  const operation = mark === undefined ? undefined : fieldsOf(mark.args)['operation'];
  return typeof operation === 'string' ? operationId(operation) : undefined;
}

/** How many documents or keys a plan announces from what it keeps; 0 for a filter, which is counted while read. */
export function announced(keeps: Keeps): number {
  switch (keeps.kind) {
    case 'ids':
    case 'inserted':
      return keeps.ids.length;
    case 'keys':
      return keeps.keys.length;
    case 'images': {
      const read = beforeReadOf(keeps.images);
      return read?.kind === 'documents' ? read.docs.length : read?.kind === 'keys' ? read.keys.length : 0;
    }
    case 'filter':
      return 0;
  }
}

/**
 * The arguments of `undo.record` for a plan whose `undo` names what to keep: its title, what it keeps, how many it
 * announces, the button of its confirmation (none for a plan not confirmed: **Continue**), the operation it undoes,
 * and the identifier the main process made. None for a plan that keeps nothing.
 */
export function recordArgsFor(plan: Plan, id: OperationId): RecordArgs | undefined {
  const keeps = 'keeps' in plan.undo ? keepsOf(plan.undo.keeps) : undefined;
  if (keeps === undefined) {
    return undefined;
  }
  const undoOf = undoneOperation(plan);
  return {
    title: plan.title,
    keeps,
    count: announced(keeps),
    ...(plan.danger.kind === 'none' ? {} : { action: plan.danger.button }),
    ...(undoOf === undefined ? {} : { undoOf }),
    id,
  };
}

/** The arguments as JSON, as the runner starts `undo.record` with them. */
export function recordArgsJson(args: RecordArgs): Json {
  return args as unknown as Json;
}

/** Whether an engine step writes to MongoDB documents or to Redis keys. */
function isWrite(step: Step): step is EngineStep {
  return step.kind === 'engine' && step.writes;
}

/** The target of a plan's write, from its first step that writes: a collection, or a Redis database. */
export function writeTarget(plan: Plan): OperationTarget | undefined {
  const step = plan.steps.find(isWrite);
  if (step === undefined) {
    return undefined;
  }
  const request = step.request;
  if (request.engine === 'redis') {
    return { kind: 'redis-database', connection: step.connection, database: request.database };
  }
  return request.collection === undefined
    ? undefined
    : {
        kind: 'collection',
        connection: step.connection,
        database: request.database,
        collection: request.collection,
      };
}

/** How a step of the plan ended, as far as the `_id`s it inserted go. */
export type InsertOutcome = { readonly kind: 'done' } | { readonly kind: 'not-run' } | FailedInsert;

/** A step that failed, with the indexes of its operations the server refused (`insertMany`, `bulkWrite`). */
export interface FailedInsert {
  readonly kind: 'failed';
  readonly failedOperations: readonly number[];
}

function insertedDocuments(step: EngineStep): readonly Json[] {
  const request = step.request;
  if (request.engine !== 'mongodb') {
    return [];
  }
  const [first] = request.arguments;
  if (request.method === 'insertOne') {
    return first === undefined ? [] : [first];
  }
  return request.method === 'insertMany' && Array.isArray(first) ? (first as readonly Json[]) : [];
}

function isOrdered(step: EngineStep): boolean {
  const options = step.request.engine === 'mongodb' ? step.request.arguments[1] : undefined;
  return fieldsOf(options)['ordered'] !== false;
}

/**
 * The `_id`s of the documents an insert step did not insert: all of them when it did not run or failed as a whole;
 * for an `insertMany`, those the server refused, and in order every one from the first refused.
 */
export function failedInsertIds(step: Step, outcome: InsertOutcome): readonly Json[] {
  if (step.kind !== 'engine' || outcome.kind === 'done') {
    return [];
  }
  const documents = insertedDocuments(step);
  const notInserted =
    outcome.kind === 'not-run' || outcome.failedOperations.length === 0
      ? documents
      : isOrdered(step)
        ? documents.slice(Math.min(...outcome.failedOperations))
        : documents.filter((_document, index) => outcome.failedOperations.includes(index));
  return notInserted.flatMap((document) => {
    const id = fieldsOf(document)['_id'];
    return id === undefined ? [] : [id as Json];
  });
}

/**
 * The `_id`s an insert step gave to the documents that had none, from its reply: `insertedId` of an `insertOne`,
 * `insertedIds` of an `insertMany` (by the position of each document). The documents that carried an `_id` are kept
 * by it already.
 */
export function generatedInsertIds(step: Step, reply: unknown): readonly Json[] {
  if (step.kind !== 'engine') {
    return [];
  }
  const documents = insertedDocuments(step);
  const fields = fieldsOf(reply);
  const given =
    step.request.engine === 'mongodb' && step.request.method === 'insertOne'
      ? { '0': fields['insertedId'] ?? null }
      : fieldsOf(fields['insertedIds'] ?? null);
  return documents.flatMap((document, index) => {
    const id = given[String(index)];
    return fieldsOf(document)['_id'] === undefined && id !== undefined && id !== null ? [id as Json] : [];
  });
}

/** The operation `undo.record` adds to the index, from the steps of its saving plan, with the size of its file. */
export function recordedEntry(plan: Plan, size: number): UndoEntry | undefined {
  const [add] = appSteps(plan.steps, addOperationAction);
  const entry = add === undefined ? undefined : fieldsOf(add.args)['entry'];
  return entry === undefined ? undefined : ({ ...(entry as object), size } as UndoEntry);
}
