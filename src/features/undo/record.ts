/**
 * Feature: undo.record — before a write to documents or to keys, Datardo keeps what the write is about to change as it
 * is, so that the write can be undone later, also after Datardo is closed and started again.
 *
 * The runner calls {@link plan} for every plan whose `undo` names what to keep, with `answers.args` as
 * {@link RecordArgs}. Before the first step: it reads (`undo.keep`), may ask whether to go on without undo, and ends
 * with a plan of no step whose `undo` is `{ keeps }` (recording) or `{ cannot }` (not recording). After the last step,
 * called again with the same answers and `answers.wrote`: it reads the fingerprints after, and returns the plan that
 * saves the operation, or a plan of no step when nothing is kept.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Plan } from '../../shared/feature';
import { ask, needRead, noDanger, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Field } from '../../shared/question';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { characters } from '../../shared/text-units';
import { runnerText } from '../runner/text';
import { recordsJson } from './files/records';
import type { Candidates, Kept } from './kept';
import { isNothingKept, keptRecords } from './kept';
import type { AfterRead, BeforeRead, DocumentImage, KeepArgs, KeyImageRead } from './reads/keep';
import { afterReadOf, beforeReadOf, keepRead } from './reads/keep';
import { undoNote } from './note';
import { recordText } from './text';
import type { Keeps, OperationId, UndoEntry, UndoSettings } from './types';
import {
  appStep,
  argumentsOf,
  base64Bytes,
  keepsJson,
  keepsOf,
  megabyte,
  operationId,
  sameValueKey,
  undoSettings,
} from './types';

/** The title of an operation is cut to 300 characters. */
export const longestTitle = 300;

/** What the runner gives as `answers.args`: the plan being recorded. */
export interface RecordArgs {
  readonly title: string;
  readonly keeps: Keeps;
  /** The documents or keys the plan announces. */
  readonly count: number;
  /** The button of the plan's confirmation (**Update**, **Delete**); **Continue** for a plan not confirmed. */
  readonly action?: string;
  /** The operation this plan undoes. */
  readonly undoOf?: OperationId;
  /** The identifier of the operation, made by the main process; the time in base 36 otherwise. */
  readonly id?: OperationId;
}

/** The arguments of the plan being recorded; none when they are missing. */
export function recordArgsOf(answers: Answers): RecordArgs | undefined {
  const fields = argumentsOf(answers);
  const keeps = keepsOf(fields['keeps']);
  if (keeps === undefined || typeof fields['title'] !== 'string') {
    return undefined;
  }
  const { action, undoOf, id } = fields;
  return {
    title: fields['title'],
    keeps,
    count: typeof fields['count'] === 'number' ? fields['count'] : 0,
    ...(typeof action === 'string' ? { action } : {}),
    ...(typeof undoOf === 'string' ? { undoOf: operationId(undoOf) } : {}),
    ...(typeof id === 'string' ? { id: operationId(id) } : {}),
  };
}

/** The saved connection the write goes through. */
export function writeConnection(context: Context): ConnectionView | undefined {
  const id = targetConnection(context.target);
  return id === undefined ? undefined : savedConnection(context.state.connections, id);
}

/** The title as the history lists it: 300 characters at most, 299 and `…` when cut. */
export function operationTitle(title: string): string {
  const units = characters(title);
  return units.length <= longestTitle ? title : `${units.slice(0, longestTitle - 1).join('')}…`;
}

/** The name of an operation's file in the folder of the undo history. */
export function entryFileName(id: OperationId): string {
  return `${id}.json.gz`;
}

/** The images of what was already read: the documents or keys an undo read as they are now. */
function givenImages(keeps: Keeps): BeforeRead | undefined {
  if (keeps.kind === 'images') {
    return beforeReadOf(keeps.images);
  }
  if (keeps.kind === 'inserted') {
    const docs = keeps.ids.map((id): DocumentImage => ({
      id,
      before: null,
      beforeFingerprint: null,
      size: sameValueKey({ _id: id }).length,
    }));
    return { kind: 'documents', docs };
  }
  return undefined;
}

/** The first image wins: a document or a key read twice in one operation keeps the value it had before the first step. */
export function withImages(kept: BeforeRead, more: BeforeRead): BeforeRead {
  if (kept.kind === 'failed' || more.kind === 'failed') {
    return kept.kind === 'failed' ? kept : more;
  }
  if (kept.kind === 'documents' && more.kind === 'documents') {
    const known = new Set(kept.docs.map((each) => sameValueKey(each.id)));
    return {
      kind: 'documents',
      docs: [...kept.docs, ...more.docs.filter((each) => !known.has(sameValueKey(each.id)))],
    };
  }
  if (kept.kind === 'keys' && more.kind === 'keys') {
    const known = new Set<string>(kept.keys.map((each) => each.key));
    return { kind: 'keys', keys: [...kept.keys, ...more.keys.filter((each) => !known.has(each.key))] };
  }
  return kept;
}

/** An insert that fails takes its `_id` out of what is kept: kept, undoing it would delete a document already there. */
export function withoutIds(kept: BeforeRead, ids: readonly Json[]): BeforeRead {
  if (kept.kind !== 'documents' || ids.length === 0) {
    return kept;
  }
  const failed = new Set(ids.map(sameValueKey));
  return { kind: 'documents', docs: kept.docs.filter((each) => !failed.has(sameValueKey(each.id))) };
}

function bytesOf(read: Exclude<BeforeRead, { kind: 'failed' }>): number {
  return read.kind === 'documents'
    ? read.docs.reduce((sum, each) => sum + each.size, 0)
    : read.keys.reduce((sum, each) => sum + base64Bytes(each.key) + base64Bytes(each.before?.dump ?? ''), 0);
}

/** Why what was read is too large for the undo history: `more than 10,000 documents`, `more than 20 MB`. */
export function overLimitReason(read: BeforeRead, settings: UndoSettings): string | undefined {
  if (read.kind === 'failed') {
    return undefined;
  }
  const count = read.kind === 'documents' ? read.docs.length : read.keys.length;
  const unit = read.kind === 'documents' ? 'document' : 'key';
  if (count > settings.maxDocumentsPerOperation) {
    return recordText.moreThanCount(settings.maxDocumentsPerOperation, unit);
  }
  return bytesOf(read) > settings.maxOperationBytes
    ? recordText.moreThanSize(Math.round(settings.maxOperationBytes / megabyte))
    : undefined;
}

/** Whether a filter, as the user wrote it, is a document with no field. */
function isEmptyFilter(keeps: Keeps): boolean {
  if (keeps.kind !== 'filter') {
    return false;
  }
  const filter = keeps.written ?? keeps.filter;
  return typeof filter === 'object' && filter !== null && !Array.isArray(filter) && Object.keys(filter).length === 0;
}

/** The question asked when what is kept turns out too large or cannot be read: go on without undo, or close. */
export function withoutUndoQuestion(args: RecordArgs, read: BeforeRead, reason: string | undefined): Outcome {
  const action = args.action ?? recordText.continue;
  const text =
    read.kind === 'failed'
      ? recordText.keysNotKept(read.error)
      : read.kind === 'keys'
        ? recordText.tooManyKeys(reason ?? '')
        : recordText.tooManyDocuments(reason ?? '');
  const name = args.keeps.kind === 'filter' ? args.keeps.collection : '';
  const fields: Field[] = isEmptyFilter(args.keeps)
    ? [
        {
          kind: 'text',
          key: 'confirmName',
          label: runnerText.typeToConfirm(name),
          rules: [{ kind: 'equals', value: name, message: runnerText.typeToConfirm(name) }],
        },
      ]
    : [];
  return ask({ title: recordText.question(action), text, button: recordText.withoutUndo(action), fields });
}

/** A plan of no step: the runner learns from its `undo` whether the write is recorded. */
function decided(title: string, undo: Plan['undo']): Outcome {
  return run({ title, steps: [], danger: noDanger, undo, publishes: false, after: [] });
}

function keepArgs(context: Context, keeps: Keeps, settings: UndoSettings): Json {
  const connection = targetConnection(context.target) ?? '';
  const args: KeepArgs = {
    phase: 'before',
    connection: connection as KeepArgs['connection'],
    keeps,
    limit: settings.maxDocumentsPerOperation + 1,
  };
  return args;
}

/** Before the steps: read what `keeps` names, ask when it is too large, and say whether the write is recorded. */
function before(context: Context, answers: Answers, args: RecordArgs, settings: UndoSettings): Outcome | BeforeRead {
  const given = givenImages(args.keeps);
  const read = given ?? beforeReadOf(answers['before']);
  if (read === undefined) {
    return needRead('before', keepRead, keepArgs(context, args.keeps, settings));
  }
  const reason = overLimitReason(read, settings);
  if (read.kind === 'failed' || reason !== undefined) {
    if (answers['withoutUndo'] !== true) {
      return withoutUndoQuestion(args, read, reason);
    }
    return decided(args.title, {
      cannot: read.kind === 'failed' ? recordText.keysNotKept(read.error) : (reason ?? ''),
    });
  }
  return read;
}

function isOutcome(value: Outcome | BeforeRead): value is Outcome {
  return value.kind === 'ask' || value.kind === 'read' || value.kind === 'refuse' || value.kind === 'run';
}

/** The ids or keys to read again after the write. */
function afterArgs(context: Context, args: RecordArgs, read: Exclude<BeforeRead, { kind: 'failed' }>): Json {
  const connection = targetConnection(context.target) ?? '';
  const target = context.target;
  const after: KeepArgs =
    read.kind === 'documents'
      ? {
          phase: 'after',
          connection: connection as KeepArgs['connection'],
          database: target.kind === 'collection' ? target.database : keepsDatabase(args.keeps),
          collection: target.kind === 'collection' ? target.collection : keepsCollection(args.keeps),
          ids: read.docs.map((each) => each.id),
        }
      : {
          phase: 'after',
          connection: connection as KeepArgs['connection'],
          database: target.kind === 'redis-database' || target.kind === 'key' ? target.database : 0,
          keys: read.keys.map((each) => each.key),
        };
  return after;
}

function keepsDatabase(keeps: Keeps): string {
  return keeps.kind === 'filter' || keeps.kind === 'ids' || keeps.kind === 'inserted' ? keeps.database : '';
}

function keepsCollection(keeps: Keeps): string {
  return keeps.kind === 'filter' || keeps.kind === 'ids' || keeps.kind === 'inserted' ? keeps.collection : '';
}

/** The records of the write: what was read before, with the fingerprints read after. */
export function candidatesOf(read: Exclude<BeforeRead, { kind: 'failed' }>, after: AfterRead): Candidates {
  if (read.kind === 'documents') {
    const now = new Map(
      after.kind === 'documents' ? after.docs.map((each) => [sameValueKey(each.id), each.after]) : [],
    );
    return {
      kind: 'documents',
      docs: read.docs.map((each) => ({
        id: each.id,
        before: each.before,
        beforeFingerprint: each.beforeFingerprint,
        after: now.get(sameValueKey(each.id)) ?? null,
      })),
    };
  }
  const now = new Map(after.kind === 'keys' ? after.keys.map((each) => [each.key as string, each.after]) : []);
  return {
    kind: 'keys',
    keys: read.keys.map((each: KeyImageRead) => ({ ...each, after: now.get(each.key) ?? null })),
  };
}

/** The operation as the index lists it; its size is filled once its file is written. */
export function entryOf(context: Context, args: RecordArgs, kept: Kept): UndoEntry | undefined {
  const target = context.target;
  const connection = writeConnection(context);
  if (connection === undefined) {
    return undefined;
  }
  const base = {
    id: args.id ?? operationId(context.now.toString(36)),
    time: context.now,
    connection: connection.id,
    connectionName: connection.name,
    title: operationTitle(args.title),
    inserted: kept.inserted,
    updated: kept.updated,
    deleted: kept.deleted,
    size: 0,
    ...(args.undoOf === undefined ? {} : { undoOf: args.undoOf }),
  };
  if (target.kind === 'redis-database' || target.kind === 'key') {
    return { ...base, engine: 'redis', database: target.database };
  }
  return {
    ...base,
    engine: 'mongodb',
    database: target.kind === 'collection' ? target.database : keepsDatabase(args.keeps),
    collection: target.kind === 'collection' ? target.collection : keepsCollection(args.keeps),
  };
}

/** `<data folder>/undo/<id>.json.gz`, with the separator of the system. */
export function operationPath(context: Context, id: OperationId): string {
  const separator = context.platform === 'windows' ? '\\' : '/';
  return [context.state.app.dataFolder, 'undo', entryFileName(id)].join(separator);
}

/** After the steps: the plan that writes the operation's file, then adds it to the index; none when nothing is kept. */
function save(
  context: Context,
  answers: Answers,
  args: RecordArgs,
  read: Exclude<BeforeRead, { kind: 'failed' }>,
): Outcome {
  const after = afterReadOf(answers['after']);
  if (after === undefined) {
    return needRead('after', keepRead, afterArgs(context, args, read));
  }
  const kept = keptRecords(candidatesOf(read, after));
  const entry = isNothingKept(kept) ? undefined : entryOf(context, args, kept);
  if (entry === undefined) {
    return decided(args.title, { cannot: recordText.recordCannotUndo });
  }
  return run({
    title: entry.title,
    steps: [
      appStep(
        'undo.write-operation',
        { operation: entry.id, records: recordsJson(kept.records) },
        recordText.writeFile(operationPath(context, entry.id)),
      ),
      appStep('undo.add-operation', { entry: entry as unknown as Json }, recordText.addOperation(entry.title)),
    ],
    danger: noDanger,
    undo: { cannot: recordText.recordCannotUndo },
    publishes: false,
    after: [{ kind: 'start', feature: featureId('undo.limits'), target: { kind: 'app' } }],
  });
}

/** Feature: undo.record. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = recordArgsOf(answers);
  if (args === undefined) {
    return decided('', { cannot: recordText.off });
  }
  const settings = undoSettings(context.state.settings);
  const connection = writeConnection(context);
  if (connection === undefined) {
    return decided(args.title, { cannot: recordText.off });
  }
  const note = undoNote(connection, { keeps: keepsJson(args.keeps) }, args.count, settings);
  if (!note.recorded) {
    return decided(args.title, { cannot: note.line });
  }
  const read = before(context, answers, args, settings);
  if (isOutcome(read)) {
    return read;
  }
  if (read.kind === 'failed') {
    return decided(args.title, { cannot: recordText.keysNotKept(read.error) });
  }
  if (answers['wrote'] === undefined) {
    return decided(args.title, { keeps: read as unknown as Json });
  }
  const failed = fieldsOfWrote(answers['wrote']);
  const kept = withoutIds(read, failed);
  return save(context, answers, args, kept as Exclude<BeforeRead, { kind: 'failed' }>);
}

function fieldsOfWrote(value: unknown): readonly Json[] {
  const failed = (value as { readonly failedIds?: unknown } | null)?.failedIds;
  return Array.isArray(failed) ? (failed as readonly Json[]) : [];
}
