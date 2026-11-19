/**
 * Feature: manage.rename-collection
 *
 * Renames a collection within its database; what Datardo keeps for it (its recent and saved queries *for me*, its
 * column layout, its pin) and its open tab follow the new name. Started with `{ connection, database, collection }`;
 * from Go to, for the collection of the active tab.
 */
import {
  ask,
  refuse,
  run,
  noDanger,
  type Answers,
  type AppStep,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan } from '../nav/types';
import { nameError, nameRules } from './name-rules';
import { text } from './text';
import {
  collectionEntries,
  collectionsNeed,
  databaseTarget,
  mongoRequest,
  namespaceOf,
  pickCollection,
  placeOf,
  trimmedAnswer,
  writeStep,
  knownPlace,
  type KnownPlace,
} from './types';

/** The key of the new name. */
export const nameKey = 'name';

/** Feature: manage.rename-collection — the question **Rename collection shop.orders**, filled with the current name. */
export function renameQuestion(
  place: KnownPlace,
  others: readonly string[],
  typed?: string,
  problem?: string,
): Outcome {
  return ask({
    title: text.renameCollection.title(namespaceOf(place.database, place.collection)),
    ...(problem === undefined ? {} : { text: problem }),
    button: text.renameCollection.button,
    fields: [
      {
        kind: 'text',
        key: nameKey,
        label: text.renameCollection.field,
        default: typed ?? place.collection,
        rules: [...nameRules('collection'), { kind: 'not-one-of', values: others, message: text.names.renameExists }],
      },
    ],
  });
}

/** The app step that moves what Datardo keeps for the collection, and its open tab, to the new name. */
export function moveStep(place: KnownPlace, to: string): AppStep {
  return {
    kind: 'app',
    text: text.renameCollection.moveStep(
      namespaceOf(place.database, place.collection),
      namespaceOf(place.database, to),
    ),
    action: 'manage.rename-collection',
    args: {
      connection: place.connection.id,
      database: place.database,
      from: place.collection,
      to,
      ...(place.tab === undefined ? {} : { tab: place.tab.id }),
    },
  };
}

/** Feature: manage.rename-collection — `db.orders.renameCollection("orders_2024")`, then what Datardo keeps moves. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = placeOf(context, answers);
  if (started === undefined) {
    throw new Error('manage.rename-collection needs a connection.');
  }
  if (started.connection.readOnly) {
    return refuse('manage.rename-collection/read-only', text.readOnly(started.connection.name));
  }
  if (started.view === true) {
    return refuse('manage.rename-collection/view', text.renameCollection.view);
  }
  const picking = pickCollection(started, answers, text.renameCollection.pickTitle, ['collection']);
  if (picking !== undefined) {
    return picking;
  }
  const place = knownPlace(started);
  if (answers['collections'] === undefined) {
    return collectionsNeed(place);
  }
  const others = collectionEntries(answers, 'collections')
    .map((entry) => entry.name)
    .filter((name) => name !== place.collection);
  return renamed(place, others, trimmedAnswer(answers, nameKey));
}

function renamed(place: KnownPlace, others: readonly string[], to: string | undefined): Outcome {
  if (to === undefined) {
    return renameQuestion(place, others);
  }
  if (to === place.collection) {
    return run(appPlan(text.renameCollection.title(namespaceOf(place.database, place.collection)), []));
  }
  const problem = nameError('collection', to) ?? (others.includes(to) ? text.names.renameExists : undefined);
  if (problem !== undefined) {
    return renameQuestion(place, others, to, problem);
  }
  const request = mongoRequest(place, 'renameCollection', [to]);
  return run({
    title: text.renameCollection.title(namespaceOf(place.database, place.collection)),
    steps: [writeStep(place, request, databaseTarget(place, place.database)), moveStep(place, to)],
    danger: noDanger,
    undo: { cannot: text.nothingWritten },
    publishes: false,
    after: [
      { kind: 'refresh', connection: place.connection.id },
      {
        kind: 'notify',
        level: 'success',
        text: text.renameCollection.renamed(
          namespaceOf(place.database, place.collection),
          namespaceOf(place.database, to),
        ),
      },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('manage.rename-collection'), plan };
