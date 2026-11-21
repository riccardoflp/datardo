/**
 * Feature: manage.drop-collection
 *
 * Drops a collection, with its documents and indexes, after the user types its name; or drops a view after a
 * confirmation. Started with `{ connection, database, collection, view? }`; from Go to, for the collection or view of
 * the active tab. When nothing says whether it is a view, `manage.read-options` is read first.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type Danger,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appTarget } from '../../shared/target';
import { indexNamesRead } from './reads/index-names';
import { text } from './text';
import {
  collectionTabs,
  databaseTarget,
  isDocument,
  knownPlace,
  mongoRequest,
  namespaceOf,
  pickCollection,
  placeOf,
  writeStep,
  type KnownPlace,
} from './types';

/**
 * Whether the collection is a view: from the start, its tab or the list it was picked from (`placeOf`), or from
 * `manage.read-options` read under `options`.
 */
function isView(place: KnownPlace, answers: Answers): boolean | undefined {
  if (place.view !== undefined) {
    return place.view;
  }
  const read = answers['options'];
  return isDocument(read) ? read['kind'] === 'found' && read['type'] === 'view' : undefined;
}

/** The number of documents `tree.count` read under `count`; `undefined` when it could not be read. */
export function documentsOf(answers: Answers, collection: string): number | undefined {
  const counts = answers['count'];
  const count = isDocument(counts) ? counts[collection] : undefined;
  return typeof count === 'number' ? count : undefined;
}

/** The number of indexes `manage.drop-collection:indexes` read under `indexes`; `undefined` when they could not be read. */
export function indexesOf(answers: Answers): number | undefined {
  const list = answers['indexes'];
  const indexes = isDocument(list) ? list['indexes'] : undefined;
  return Array.isArray(indexes) ? indexes.length : undefined;
}

/** Feature: manage.drop-collection — the confirmation of a collection, or of a view. */
export function dangerOf(place: KnownPlace, view: boolean, answers: Answers): Danger {
  if (view) {
    return { kind: 'confirm', text: text.dropCollection.view, button: text.dropCollection.button };
  }
  return {
    kind: 'destructive',
    text: text.dropCollection.deletes(documentsOf(answers, place.collection), indexesOf(answers)),
    button: text.dropCollection.button,
    name: place.collection,
  };
}

function countsNeed(place: KnownPlace, answers: Answers): Outcome | undefined {
  const args: Json = { connection: place.connection.id, database: place.database };
  if (answers['count'] === undefined) {
    return needRead('count', 'tree.count', { ...args, collections: [place.collection] });
  }
  return answers['indexes'] === undefined
    ? needRead('indexes', indexNamesRead, { ...args, collection: place.collection })
    : undefined;
}

/** What follows a drop: the tree is read again, the tabs of the collection close, and a notification. */
export function afterDrop(context: Context, place: KnownPlace): readonly After[] {
  return [
    { kind: 'refresh', connection: place.connection.id },
    ...collectionTabs(context, place, place.collection).map((tab): After => ({
      kind: 'start',
      feature: featureId('tab.close'),
      target: appTarget,
      args: { tab: tab.id },
    })),
    {
      kind: 'notify',
      level: 'success',
      text: text.dropCollection.dropped(namespaceOf(place.database, place.collection)),
    },
  ];
}

/** Feature: manage.drop-collection — `db.orders.drop()`, after typing `orders`, or after a confirmation for a view. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.drop-collection needs a connection.');
  }
  if (started.connection.readOnly) {
    return refuse('manage.drop-collection/read-only', text.readOnly(started.connection.name));
  }
  const picking = pickCollection(started, answers, text.dropCollection.pickTitle, ['collection', 'view', 'timeseries']);
  if (picking !== undefined) {
    return picking;
  }
  const place = knownPlace(started);
  const view = isView(place, answers);
  if (view === undefined) {
    return needRead('options', 'manage.read-options', {
      connection: place.connection.id,
      database: place.database,
      collection: place.collection,
    });
  }
  const counting = view ? undefined : countsNeed(place, answers);
  if (counting !== undefined) {
    return counting;
  }
  const namespace = namespaceOf(place.database, place.collection);
  return run({
    title: view ? text.dropCollection.viewTitle(namespace) : text.dropCollection.title(namespace),
    steps: [writeStep(place, mongoRequest(place, 'drop', []), databaseTarget(place, place.database))],
    danger: dangerOf(place, view, answers),
    undo: { cannot: text.dropCollection.cannotUndo },
    publishes: false,
    after: afterDrop(context, place),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.drop-collection'), plan };
