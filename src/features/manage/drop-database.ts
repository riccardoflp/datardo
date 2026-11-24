/**
 * Feature: manage.drop-database
 *
 * Drops a database with all its collections, after the user types its name; then, only when the connection keeps a
 * color for the database or one of its collections, the step that forgets them (`tree.color-of`). Started with
 * `{ connection, database }`; from Go to, for the database of the active tab, or after picking one.
 */
import {
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import { forgetStep } from '../tree/parts/forget-step';
import { text } from './text';
import {
  bucketTabs,
  collectionEntries,
  collectionTabs,
  collectionsNeed,
  connectionTarget,
  mongoRequest,
  pickDatabase,
  placeOf,
  wasListed,
  writeStep,
  type ManagePlace,
} from './types';

/**
 * Feature: manage.drop-database — the number of collections and views `tree.list-collections` read under
 * `collections`, without `system.*`; `undefined` when they could not be listed.
 */
export function collectionCount(answers: Answers): number | undefined {
  return wasListed(answers, 'collections') ? collectionEntries(answers, 'collections').length : undefined;
}

/** What follows a drop: the tree is read again, every collection and GridFS tab of the database closes. */
export function afterDrop(context: Context, place: ManagePlace & { readonly database: string }): readonly After[] {
  const tabs = [...collectionTabs(context, place), ...bucketTabs(context, place)];
  return [
    { kind: 'refresh', connection: place.connection.id },
    ...tabs.map((tab): After => ({
      kind: 'start',
      feature: featureId('tab.close'),
      target: appTarget,
      args: { tab: tab.id },
    })),
    { kind: 'notify', level: 'success', text: text.dropDatabase.dropped(place.database) },
  ];
}

/** Feature: manage.drop-database — `db.getSiblingDB("shop").dropDatabase()`, after typing `shop`. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.drop-database needs a connection.');
  }
  if (started.connection.readOnly) {
    return refuse('manage.drop-database/read-only', text.readOnly(started.connection.name));
  }
  const picking = pickDatabase(started, answers, text.dropDatabase.pickTitle);
  if (picking !== undefined) {
    return picking;
  }
  const place = { ...started, database: started.database ?? '' };
  if (answers['collections'] === undefined) {
    return collectionsNeed(place);
  }
  return run({
    title: text.dropDatabase.title(place.database),
    steps: [
      writeStep(place, mongoRequest({ database: place.database }, 'dropDatabase', []), connectionTarget(place)),
      ...forgetStep(place.connection, { kind: 'database', database: place.database }, context.state.table.formatting),
    ],
    danger: {
      kind: 'destructive',
      text: text.dropDatabase.deletes(collectionCount(answers)),
      button: text.dropDatabase.button,
      name: place.database,
    },
    undo: { cannot: text.dropDatabase.cannotUndo },
    publishes: false,
    after: afterDrop(context, place),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.drop-database'), plan };
