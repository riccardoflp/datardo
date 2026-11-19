/**
 * Feature: undo.revert — puts the documents or the keys of an operation back as they were: deletes what it created,
 * restores what it changed, creates again what it deleted, with the same BSON types and the same bytes. The undo is an
 * operation too, so it can be undone (redo).
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { After, Answers, Context, Outcome, Step, Undo } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { savedConnection } from '../../shared/state/connections';
import type { ChangedSince, UndoChoice } from './changed-since';
import { changedLine, changedSince, recordKey, undoButton } from './changed-since';
import { undoNote } from './note';
import { operationArgs, operationRead, operationReadOf } from './reads/operation';
import { revertSteps } from './revert-plan';
import { entryById, undoOf } from './state/history';
import { counted, revertText } from './text';
import type { OperationId, OperationRecords, UndoEntry } from './types';
import { appStep, argumentsOf, entryTarget, keepsJson, operationId, undoSettings, unitOf, whereText } from './types';

/** The operation an undo was started on: `args.operation`. */
export function argumentOperation(answers: Answers): OperationId | undefined {
  const id = argumentsOf(answers)['operation'];
  return typeof id === 'string' ? operationId(id) : undefined;
}

/** Why an operation cannot be undone now, as a refusal; none when it can. */
export function revertRefusal(context: Context, operation: OperationId | undefined): Outcome | ConnectionView {
  const entry = operation === undefined ? undefined : entryById(undoOf(context.state), operation);
  if (entry === undefined) {
    return refuse('undo.revert/gone', revertText.gone);
  }
  if (entry.undone !== undefined) {
    return refuse('undo.revert/already-undone', revertText.alreadyUndone);
  }
  const connection = savedConnection(context.state.connections, entry.connection);
  if (connection === undefined) {
    return refuse('undo.revert/no-connection', revertText.noConnection(entry.connectionName));
  }
  if (connection.readOnly) {
    return refuse('undo.revert/read-only', revertText.readOnly(connection.name));
  }
  return connection;
}

function isRefusal(value: Outcome | ConnectionView): value is Outcome {
  return 'kind' in value && value.kind === 'refuse';
}

/** *The undo deletes 2 inserted documents, restores 3 updated documents, inserts again 1 deleted document.* */
export function whatTheUndoDoes(records: OperationRecords, taken: ReadonlySet<string>): string {
  const chosen: readonly { readonly before: unknown; readonly after: unknown }[] =
    records.kind === 'documents'
      ? records.docs.filter((each) => taken.has(recordKey(each)))
      : records.keys.filter((each) => taken.has(recordKey(each)));
  const inserted = chosen.filter((each) => each.before === null).length;
  const deleted = chosen.filter((each) => each.before !== null && each.after === null).length;
  const updated = chosen.length - inserted - deleted;
  const parts =
    records.kind === 'documents'
      ? [
          inserted > 0 ? revertText.deletesInserted(inserted) : '',
          updated > 0 ? revertText.restoresUpdated(updated) : '',
          deleted > 0 ? revertText.insertsDeleted(deleted) : '',
        ]
      : [
          inserted > 0 ? revertText.deletesCreated(inserted) : '',
          updated > 0 ? revertText.restoresChanged(updated) : '',
          deleted > 0 ? revertText.createsDeleted(deleted) : '',
        ];
  return revertText.documentsWhat(parts.filter((part) => part !== ''));
}

/** **Undo all** or **Undo unchanged only**, with the line of `undo.changed-since`. */
function choiceQuestion(entry: UndoEntry, found: ChangedSince): Outcome {
  return ask({
    title: revertText.question(entry.title, whereText(entry.connectionName, entry)),
    ...(found.line === undefined ? {} : { text: found.line }),
    button: revertText.undo,
    fields: [
      {
        kind: 'pick-one',
        key: 'choice',
        label: revertText.choice,
        choices: [
          { value: 'all', label: revertText.undoAll },
          { value: 'unchanged', label: revertText.undoUnchanged },
        ],
        default: 'all',
      },
    ],
  });
}

function choiceOf(answers: Answers): UndoChoice | undefined {
  const choice = answers['choice'];
  return choice === 'all' || choice === 'unchanged' ? choice : undefined;
}

/** What follows a successful undo: the message in the page when started from it, a notification otherwise. */
function afterUndo(context: Context, entry: UndoEntry, message: string): readonly After[] {
  const refresh: After = { kind: 'refresh', connection: entry.connection };
  return context.place === 'table' ? [refresh] : [{ kind: 'notify', level: 'success', text: message }, refresh];
}

/** Feature: undo.revert. `args.operation` is the operation; `answers.operation` the read of its file and records now. */
export function plan(context: Context, answers: Answers): Outcome {
  const operation = argumentOperation(answers);
  const connection = revertRefusal(context, operation);
  if (isRefusal(connection) || operation === undefined) {
    return isRefusal(connection) ? connection : refuse('undo.revert/gone', revertText.gone);
  }
  const entry = entryById(undoOf(context.state), operation) as UndoEntry;
  const read = operationReadOf(answers['operation']);
  if (read === undefined) {
    return needRead('operation', operationRead, operationArgs(operation));
  }
  if (read.kind === 'missing') {
    return refuse('undo.revert/gone', revertText.gone);
  }
  const found = changedSince(read.records, read.current);
  const choice = choiceOf(answers);
  if (found.question === 'all-or-unchanged' && choice === undefined) {
    return choiceQuestion(entry, found);
  }
  const target = entryTarget(entry);
  const reverted = revertSteps({ target, records: read.records, current: read.current }, found, choice, entry.title);
  const where = whereText(connection.name, entry);
  const note = undoNote(connection, { keeps: null }, reverted.taken, undoSettings(context.state.settings));
  const undo: Undo = note.recorded
    ? { keeps: keepsJson({ kind: 'images', images: reverted.keeps as unknown as Json }) }
    : { cannot: note.line };
  const message = revertText.undid(entry.title, reverted.taken, unitOf(entry.engine), where);
  const takenKeys = new Set(takenOf(read.records, found, choice));
  const lines = [whatTheUndoDoes(read.records, takenKeys), changedLine(found, choice)];
  const steps: Step[] = [
    ...reverted.steps,
    appStep('undo.mark-undone', markArgs(context, operation, message), revertText.markUndone(entry.title)),
  ];
  return run({
    title: reverted.title,
    steps,
    danger: {
      kind: 'confirm',
      text: lines.filter((line) => line !== undefined).join('\n'),
      button: undoButton(found, choice),
    },
    touches: counted(reverted.taken, unitOf(entry.engine)),
    undo,
    publishes: entry.engine === 'mongodb',
    after: afterUndo(context, entry, message),
  });
}

function markArgs(context: Context, operation: OperationId, message: string): Json {
  return context.place === 'table' ? { operation, pageMessage: message } : { operation };
}

function takenOf(records: OperationRecords, found: ChangedSince, choice: UndoChoice | undefined): readonly string[] {
  const all = records.kind === 'documents' ? records.docs.map(recordKey) : records.keys.map(recordKey);
  if (choice !== 'unchanged') {
    return all;
  }
  const changed = new Set(found.changed);
  return all.filter((key) => !changed.has(key));
}

/** The result of an undo as its card says it, for the runner: *Undid …*, or *Undo of … incomplete: …* when some failed. */
export function revertReport(
  entry: UndoEntry,
  connectionName: string,
  outcome: { readonly taken: number; readonly failed: number; readonly error?: string },
): { readonly text: string; readonly failed: boolean } {
  const unit = unitOf(entry.engine);
  if (outcome.failed > 0) {
    return {
      text: revertText.incomplete(
        entry.title,
        { failed: outcome.failed, total: outcome.taken },
        unit,
        outcome.error ?? '',
      ),
      failed: true,
    };
  }
  return { text: revertText.undid(entry.title, outcome.taken, unit, whereText(connectionName, entry)), failed: false };
}
