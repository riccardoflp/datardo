/**
 * Feature: index.edit
 *
 * Changes an existing index: hiding it and changing its TTL in place; anything else by dropping it and building it
 * again, after a confirmation, never leaving the collection without the index when that can be avoided. Started with
 * `{ connection, database, collection, index }`; the dialog answers with `keys` and `options`.
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
  type Step,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { editableDefinition, indexChange, indexName, ttlParts, type IndexChange } from './change-plan';
import { answeredDefinition, createIndexesCommand, createStep } from './create';
import { dialogQuestion } from './dialog';
import { hideStep, idIndex } from './hide';
import { text } from './text';
import {
  mongoRequest,
  subjectOf,
  writeStep,
  type IndexDefinition,
  type IndexInfo,
  type IndexList,
  type IndexSubject,
  type JsonDocument,
} from './types';

/** The codes of the server's refusal of two indexes side by side: the same keys (85) or the same name (86). */
export const sideBySideCodes = [85, 86] as const;

/** `db.runCommand({ collMod: "orders", index: { name: "created_1", expireAfterSeconds: 7200 } })`. */
function ttlStep(subject: IndexSubject, name: string, seconds: number): Step {
  const command = { collMod: subject.collection, index: { name, expireAfterSeconds: seconds } };
  return writeStep(subject, mongoRequest(subject, 'runCommand', [command], 'database'));
}

function dropStep(subject: IndexSubject, name: string): Step {
  return writeStep(subject, mongoRequest(subject, 'dropIndex', [name]));
}

/** The index as `getIndexes` reported it, without `v` and `ns`: what the recovery step creates again. */
export function reportedDefinition(index: IndexInfo): IndexDefinition {
  const { v: _v, ns: _ns, ...options } = index.options;
  return { keys: index.key, options: { ...options, name: index.name } };
}

/** A TTL in words, from the largest unit that divides it: `2 hours`, `1 day`. */
export function ttlText(seconds: number): string {
  const { value, unit } = ttlParts(seconds);
  return `${String(value)} ${value === 1 ? unit.slice(0, -1) : unit}`;
}

/** What changed, in words: `keys, name and unique`. */
export function changedText(changed: readonly string[]): string {
  if (changed.length < 2) {
    return changed.join('');
  }
  return `${changed.slice(0, -1).join(', ')} and ${changed[changed.length - 1] ?? ''}`;
}

/**
 * Feature: index.edit — the steps of a rebuild. Under another name the new index is built first and the old one
 * dropped once it is there; when the server refuses the two side by side, the old one is dropped first, as it is
 * at once when only the name changes. Under the same name the old one is dropped first, and created again as it was when the new definition is refused.
 */
export function recreateSteps(
  subject: IndexSubject,
  current: IndexInfo,
  next: IndexDefinition,
  changed: readonly string[],
): readonly Step[] {
  const recovery = createStep(subject, reportedDefinition(current));
  const dropFirst = [
    dropStep(subject, current.name),
    writeStep(
      subject,
      mongoRequest(subject, 'runCommand', [createIndexesCommand(subject.collection, next)], 'database'),
      { kind: 'instead', steps: [recovery] },
    ),
  ];
  if (indexName(next) === current.name || (changed.length === 1 && changed[0] === 'name')) {
    return dropFirst;
  }
  const build = writeStep(
    subject,
    mongoRequest(subject, 'runCommand', [createIndexesCommand(subject.collection, next)], 'database'),
    { kind: 'instead', steps: dropFirst, codes: sideBySideCodes },
  );
  return [build, dropStep(subject, current.name)];
}

function modifySteps(subject: IndexSubject, name: string, change: IndexChange & { kind: 'modify' }): readonly Step[] {
  return [
    ...(change.hidden === undefined ? [] : [hideStep(subject, name, change.hidden)]),
    ...(change.expireAfterSeconds === undefined ? [] : [ttlStep(subject, name, change.expireAfterSeconds)]),
  ];
}

/** Feature: index.edit — what a notification says once the index is changed. */
export function doneText(name: string, next: IndexDefinition, change: IndexChange): string {
  if (change.kind === 'none') {
    return text.edit.unchanged(name);
  }
  if (change.kind === 'modify') {
    const parts = [
      ...(change.hidden === undefined ? [] : [change.hidden ? text.edit.hidden : text.edit.unhidden]),
      ...(change.expireAfterSeconds === undefined ? [] : [text.edit.expires(ttlText(change.expireAfterSeconds))]),
    ];
    return text.edit.modified(name, parts);
  }
  const newName = indexName(next);
  return newName === name ? text.edit.recreated(name) : text.edit.createdAndDropped(newName, name);
}

function rebuildDanger(current: IndexInfo, changed: readonly string[]): Danger {
  return {
    kind: 'confirm',
    text: text.edit.recreateText(changedText(changed), current.options['unique'] === true),
    button: text.edit.recreateButton,
  };
}

function changePlan(subject: IndexSubject, current: IndexInfo, next: IndexDefinition): Outcome {
  const change = indexChange(editableDefinition(current.name, current.key, current.options), next);
  const after: readonly After[] = [
    { kind: 'refresh', connection: subject.connection.id },
    { kind: 'notify', level: 'success', text: doneText(current.name, next, change) },
  ];
  const steps =
    change.kind === 'none'
      ? []
      : change.kind === 'modify'
        ? modifySteps(subject, current.name, change)
        : recreateSteps(subject, current, next, change.changed);
  return run({
    title:
      change.kind === 'recreate'
        ? text.edit.recreateTitle(current.name, subject.collection)
        : text.edit.plan(current.name),
    steps,
    danger: change.kind === 'recreate' ? rebuildDanger(current, change.changed) : noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after,
  });
}

function indexNamed(list: IndexList, name: string): IndexInfo | undefined {
  return list.indexes.find((index) => index.name === name);
}

/**
 * Feature: index.edit — asks the dialog on the index as listed, then reads `getIndexes` again and decides on the
 * index as it is now (`index.change-plan`): no step, `collMod` in place, or a rebuild after a confirmation.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  const name = subject?.args['index'];
  if (subject === undefined || typeof name !== 'string') {
    throw new Error('index.edit needs { connection, database, collection, index }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.edit/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.edit/view', text.viewNoIndexes);
  }
  if (name === idIndex) {
    return refuse('index.edit/id-index', text.idIndex);
  }
  const args: JsonDocument = { connection: subject.connection.id, database: subject.database };
  const readArgs: Json = { ...args, collection: subject.collection };
  if (answers['keys'] === undefined) {
    const listed = answers['indexes'] as IndexList | undefined;
    if (listed === undefined) {
      return needRead('indexes', 'index.list', readArgs);
    }
    const index = indexNamed(listed, name);
    if (index === undefined) {
      return refuse('index.edit/gone', text.edit.gone(name));
    }
    const definition = editableDefinition(index.name, index.key, index.options);
    return ask(dialogQuestion(text.edit.title(name), text.edit.button, definition));
  }
  const next = answeredDefinition(answers);
  if (typeof next === 'string') {
    throw new Error(`index.edit was answered with a definition the dialog refuses (${next}).`);
  }
  const now = answers['current'] as IndexList | undefined;
  if (now === undefined) {
    return needRead('current', 'index.list', { ...args, collection: subject.collection, definitionsOnly: true });
  }
  const current = indexNamed(now, name);
  return current === undefined ? refuse('index.edit/gone', text.edit.gone(name)) : changePlan(subject, current, next);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.edit'), plan };
