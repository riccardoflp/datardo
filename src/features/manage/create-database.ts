/**
 * Feature: manage.create-database
 *
 * Creates a database with its first collection, since MongoDB creates a database only together with a collection, and
 * opens that collection. Started with `{ connection }`, or on the current connection from Go to.
 */
import {
  ask,
  refuse,
  run,
  noDanger,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { nameError, nameRules } from './name-rules';
import { text } from './text';
import {
  connectionTarget,
  databaseNames,
  databasesNeed,
  mongoRequest,
  placeOf,
  trimmedAnswer,
  writeStep,
  type ManagePlace,
} from './types';

/** The keys of the two fields of the form. */
export const keys = { database: 'name', collection: 'first' } as const;

/** Feature: manage.create-database — the form **Create database**; `problem` is shown above it when asked again. */
export function createQuestion(
  place: ManagePlace,
  existing: readonly string[],
  answers: Answers,
  problem?: string,
): Outcome {
  return ask({
    title: text.createDatabase.title,
    ...(problem === undefined ? {} : { text: problem }),
    button: text.createDatabase.button,
    fields: [
      {
        kind: 'text',
        key: keys.database,
        label: text.createDatabase.databaseField(place.connection.name),
        ...defaultOf(answers, keys.database),
        rules: [...nameRules('database'), { kind: 'not-one-of', values: existing, message: text.names.databaseExists }],
      },
      {
        kind: 'text',
        key: keys.collection,
        label: text.createDatabase.collectionField,
        ...defaultOf(answers, keys.collection),
        rules: nameRules('collection'),
      },
    ],
  });
}

function defaultOf(answers: Answers, key: string): { readonly default?: string } {
  const answer = answers[key];
  return typeof answer === 'string' ? { default: answer } : {};
}

/** The message of the first name of the form that cannot be accepted, trimmed. */
export function formProblem(database: string, collection: string, existing: readonly string[]): string | undefined {
  return (
    nameError('database', database) ??
    (existing.includes(database) ? text.names.databaseExists : undefined) ??
    nameError('collection', collection)
  );
}

/** Feature: manage.create-database — `db.getSiblingDB("shop").createCollection("orders")`, then its tab opens. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('manage.create-database needs a connection.');
  }
  if (place.connection.readOnly) {
    return refuse('manage.create-database/read-only', text.readOnly(place.connection.name));
  }
  if (answers['databases'] === undefined) {
    return databasesNeed(place);
  }
  const existing = databaseNames(answers, 'databases');
  const database = trimmedAnswer(answers, keys.database);
  const collection = trimmedAnswer(answers, keys.collection);
  if (database === undefined || collection === undefined) {
    return createQuestion(place, existing, answers);
  }
  const problem = formProblem(database, collection, existing);
  if (problem !== undefined) {
    return createQuestion(place, existing, answers, problem);
  }
  const request = mongoRequest({ database }, 'createCollection', [collection]);
  const shows = { kind: 'collection', connection: place.connection.id, database, collection };
  return run({
    title: text.createDatabase.title,
    steps: [writeStep(place, request, connectionTarget(place))],
    danger: noDanger,
    undo: { cannot: text.notADocumentWrite },
    publishes: false,
    after: [
      { kind: 'refresh', connection: place.connection.id },
      { kind: 'start', feature: featureId('tab.open'), target: connectionTarget(place), args: { shows } },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.create-database'), plan };
