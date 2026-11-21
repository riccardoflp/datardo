/**
 * Feature: index.create
 *
 * Creates an index on the collection from the index dialog, empty or filled with keys suggested elsewhere (`keys` in
 * the arguments, from the Explain section, the Index advisor or the Monitor page). The dialog answers with `keys` and
 * `options`, each read from mongosh syntax (`ParsedText`).
 */
import type { Json } from '../../shared/engine-request';
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { editableDefinition, indexName, normalized, stable } from './change-plan';
import { dialogQuestion } from './parts/dialog-question';
import { text } from './text';
import {
  isDocument,
  mongoRequest,
  parsedAnswer,
  readArgs,
  readTarget,
  subjectOf,
  writeStep,
  type IndexDefinition,
  type IndexList,
  type IndexSubject,
  type JsonDocument,
} from './types';

/** The `createIndexes` command of one index, its name given or generated, `commitQuorum` moved to the command. */
export function createIndexesCommand(collection: string, definition: IndexDefinition): JsonDocument {
  const { name: _name, commitQuorum, ...options } = definition.options;
  return {
    createIndexes: collection,
    indexes: [{ key: definition.keys, name: indexName(definition), ...options }],
    ...(commitQuorum === undefined ? {} : { commitQuorum }),
  };
}

/** `db.runCommand({ createIndexes: "orders", indexes: [{ key, name, … }] })`. */
export function createStep(subject: IndexSubject, definition: IndexDefinition): ReturnType<typeof writeStep> {
  return writeStep(
    subject,
    mongoRequest(subject, 'runCommand', [createIndexesCommand(subject.collection, definition)], 'database'),
  );
}

/** Whether the collection already has this very index, under the same name: MongoDB then creates nothing. */
export function hasIdentical(list: IndexList, definition: IndexDefinition): boolean {
  const named = (keys: JsonDocument, options: JsonDocument, name: string): string => {
    const each = normalized({ keys, options: { ...options, name } });
    return stable({ keys: each.keys, options: each.options });
  };
  const wanted = named(definition.keys, definition.options, indexName(definition));
  return list.indexes.some((index) => {
    const existing = editableDefinition(index.name, index.key, index.options);
    return named(existing.keys, existing.options, index.name) === wanted;
  });
}

/** What the dialog answered: a definition, or what is wrong with it. */
export type AnsweredDefinition = IndexDefinition | 'no-keys' | 'keys-not-an-object' | 'options-not-an-object';

/** The definition the dialog answered with, `keys` and `options` each read from mongosh syntax. */
export function answeredDefinition(answers: Answers): AnsweredDefinition {
  const keys = parsedAnswer(answers['keys']);
  const options = parsedAnswer(answers['options']);
  if (
    keys.kind === 'empty' ||
    (keys.kind === 'value' && isDocument(keys.value) && Object.keys(keys.value).length === 0)
  ) {
    return 'no-keys';
  }
  if (keys.kind === 'invalid' || !isDocument(keys.value)) {
    return 'keys-not-an-object';
  }
  if (options.kind === 'invalid' || (options.kind === 'value' && !isDocument(options.value))) {
    return 'options-not-an-object';
  }
  return { keys: keys.value, options: options.kind === 'value' && isDocument(options.value) ? options.value : {} };
}

function refusal(wrong: Exclude<AnsweredDefinition, IndexDefinition>): Outcome {
  if (wrong === 'no-keys') {
    return refuse('index.create/no-keys', text.create.noKeys);
  }
  return refuse(
    'index.create/not-an-object',
    wrong === 'keys-not-an-object' ? text.create.keysNotObject : text.create.optionsNotObject,
  );
}

/** The keys the dialog opens with, and the options of a copy (`index.duplicate`): `{ keys, options }` of the arguments. */
function startingKeys(subject: IndexSubject): IndexDefinition | undefined {
  const { keys, options } = subject.args;
  return isDocument(keys) ? { keys, options: isDocument(options) ? options : {} } : undefined;
}

/**
 * Feature: index.create — reads the indexes (for the dialog's note), asks the dialog, then runs `createIndexes`; an
 * index identical to one the collection has, under the same name, creates nothing and says so.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  if (subject === undefined) {
    throw new Error('index.create needs { connection, database, collection }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.create/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.create/view', text.viewNoIndexes);
  }
  const list = answers['indexes'] as IndexList | undefined;
  if (list === undefined) {
    return needRead('indexes', 'index.list', readArgs(subject));
  }
  if (answers['keys'] === undefined) {
    const start = startingKeys(subject);
    const about = { ...readTarget(readArgs(subject)), ...(start === undefined ? {} : { definition: start }), list };
    return ask(dialogQuestion(text.create.title(subject.collection), text.create.button, start, about));
  }
  const definition = answeredDefinition(answers);
  if (typeof definition === 'string') {
    return refusal(definition);
  }
  const name = indexName(definition);
  const identical = hasIdentical(list, definition);
  const after = [
    { kind: 'refresh', connection: subject.connection.id } as const,
    { kind: 'notify', level: 'success', text: identical ? text.create.identical : text.create.created(name) } as const,
  ];
  return run({
    title: text.create.plan(name),
    steps: identical ? [] : [createStep(subject, definition)],
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after,
  });
}

/** The arguments a feature passes to open the dialog filled with suggested keys: `{ …, keys }`. */
export function suggestedArgs(subject: IndexSubject, keys: Json): JsonDocument {
  return { ...readArgs(subject), keys };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.create'), plan };
