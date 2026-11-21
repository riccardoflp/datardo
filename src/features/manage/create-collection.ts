/**
 * Feature: manage.create-collection
 *
 * Creates a collection in a database, with the options of `createCollection` typed in mongosh syntax: capped, time
 * series, a view. Started with `{ connection, database }`; from Go to, in the database of the active tab, or after
 * picking one.
 */
import {
  ask,
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { noMakers, type Makers } from '../aggregate/mongosh/helpers';
import { makersOf } from '../aggregate/types';
import { nameError, nameRules } from './name-rules';
import { text } from './text';
import {
  collectionEntries,
  collectionsNeed,
  databaseTarget,
  isObjectValue,
  mongoRequest,
  namespaceOf,
  parsedAnswer,
  pickDatabase,
  placeOf,
  trimmedAnswer,
  writeStep,
  type JsonDocument,
  type ManagePlace,
} from './types';

/** The keys of the two fields of the form. */
export const keys = { name: 'name', options: 'options' } as const;

/** Feature: manage.create-collection — the options typed: none, a document, or the message shown under the field. */
export function optionsOf(
  answer: unknown,
  makers: Makers = noMakers,
): { readonly options?: JsonDocument } | { readonly problem: string } {
  const parsed = parsedAnswer(answer, makers);
  switch (parsed.kind) {
    case 'empty':
      return {};
    case 'invalid':
      return { problem: text.createCollection.invalidOptions(parsed.message) };
    case 'value':
      if (!isObjectValue(parsed.value)) {
        return { problem: text.createCollection.notAnObject };
      }
      return Object.keys(parsed.value).length === 0 ? {} : { options: parsed.value };
  }
}

function defaultOf(answers: Answers, key: string): { readonly default?: string } {
  const answer = answers[key];
  return typeof answer === 'string' ? { default: answer } : {};
}

/** Feature: manage.create-collection — the form **Create collection in shop**. */
export function createQuestion(
  place: ManagePlace,
  existing: readonly string[],
  answers: Answers,
  problem?: string,
): Outcome {
  return ask({
    title: text.createCollection.title(place.database ?? ''),
    ...(problem === undefined ? {} : { text: problem }),
    button: text.createCollection.button,
    fields: [
      {
        kind: 'text',
        key: keys.name,
        label: text.createCollection.nameField,
        ...defaultOf(answers, keys.name),
        rules: [
          ...nameRules('collection'),
          { kind: 'not-one-of', values: existing, message: text.names.collectionExists },
        ],
      },
      {
        kind: 'text',
        key: keys.options,
        label: text.createCollection.optionsField,
        placeholder: text.createCollection.placeholder,
        ...defaultOf(answers, keys.options),
      },
    ],
  });
}

/**
 * Feature: manage.create-collection — `db.createCollection("orders")`, or `db.createCollection("log", { capped: true,
 * size: 1048576 })` with options, sent with their BSON types.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.create-collection needs a connection.');
  }
  if (started.connection.readOnly) {
    return refuse('manage.create-collection/read-only', text.readOnly(started.connection.name));
  }
  const picking = pickDatabase(started, answers, text.createCollection.pickTitle);
  if (picking !== undefined) {
    return picking;
  }
  const place = { ...started, database: started.database ?? '' };
  if (answers['collections'] === undefined) {
    return collectionsNeed(place);
  }
  const existing = collectionEntries(answers, 'collections').map((entry) => entry.name);
  const name = trimmedAnswer(answers, keys.name);
  if (name === undefined) {
    return createQuestion(place, existing, answers);
  }
  const typed = optionsOf(answers[keys.options], makersOf(context));
  const problem =
    nameError('collection', name) ??
    (existing.includes(name) ? text.names.collectionExists : undefined) ??
    ('problem' in typed ? typed.problem : undefined);
  if (problem !== undefined || 'problem' in typed) {
    return createQuestion(place, existing, answers, problem);
  }
  const args = typed.options === undefined ? [name] : [name, typed.options];
  return run({
    title: text.createCollection.title(place.database),
    steps: [
      writeStep(
        place,
        mongoRequest({ database: place.database }, 'createCollection', args),
        databaseTarget(place, place.database),
      ),
    ],
    danger: noDanger,
    undo: { cannot: text.notADocumentWrite },
    publishes: false,
    after: [
      { kind: 'refresh', connection: place.connection.id },
      { kind: 'notify', level: 'success', text: text.createCollection.created(namespaceOf(place.database, name)) },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.create-collection'), plan };
