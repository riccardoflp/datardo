/**
 * Feature: search.open-in-collection
 *
 * Opens the collection tab of a group filtered on the documents the search found in it: `open shop.orders with the
 * filter { _id: { $in: [ObjectId("…"), ObjectId("…")] } }`, with the `_id`s kept (the first 1,000, in the order they
 * were found), or `{ _id: ObjectId("…") }` for one document; the sort and the projection are empty, and the query runs.
 * Nothing is written, so it works on a read-only connection, where the tab opens read-only.
 *
 * Started with `{ connection, database, collection, ids, found }` from a group (the `_id`s kept and the number of
 * documents found), or `{ connection, database, collection, id }` from an item.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import type { Target } from '../../shared/target';
import { formattedValue } from '../query/format';
import { appPlan, appStep, startArgs } from '../nav/types';
import { text } from './text';

/** The app action that opens a collection tab (or makes it active) on its Documents section with a filter. */
export const openFilteredAction = 'query.open-filtered';

/** The `_id`s a step's text shows; the others are counted (`runner.step-text` cuts lists the same way). */
export const idsShown = 10;

interface OpenArgs {
  readonly target: Extract<Target, { readonly kind: 'collection' }>;
  readonly ids: readonly Json[];
  readonly found: number;
}

function openArgs(answers: Answers): OpenArgs | undefined {
  const args = startArgs(answers);
  const { connection, database, collection, id, ids, found } = args;
  if (typeof connection !== 'string' || typeof database !== 'string' || typeof collection !== 'string') {
    return undefined;
  }
  const target = { kind: 'collection', connection: connectionId(connection), database, collection } as const;
  if (id !== undefined) {
    return { target, ids: [id as Json], found: 1 };
  }
  const kept = Array.isArray(ids) ? (ids as readonly Json[]) : [];
  return { target, ids: kept, found: typeof found === 'number' ? Math.max(found, kept.length) : kept.length };
}

/** The filter of the documents found: `{ _id: <id> }` for one, `{ _id: { $in: [<ids>] } }` for several. */
export function foundFilter(ids: readonly Json[]): Json {
  const [only] = ids;
  return ids.length === 1 && only !== undefined ? { _id: only } : { _id: { $in: ids } };
}

/** The filter as the step shows it: the first 10 `_id`s, and how many more. */
function shownFilter(ids: readonly Json[]): string {
  if (ids.length <= idsShown) {
    return formattedValue(foundFilter(ids), 'one-line');
  }
  const shown = ids.slice(0, idsShown).map((id) => formattedValue(id, 'one-line'));
  return `{ _id: { $in: [${shown.join(', ')}, … and ${String(ids.length - idsShown)} more] } }`;
}

/** Feature: search.open-in-collection — the collection tab with the filter of the documents found. */
export function plan(_context: Context, answers: Answers): Outcome {
  const asked = openArgs(answers);
  if (asked === undefined || asked.ids.length === 0) {
    return run({ ...appPlan(text.title, []), undo: { cannot: text.open.nothingWritten } });
  }
  const { target, ids, found } = asked;
  const namespace = `${target.database}.${target.collection}`;
  const filter = foundFilter(ids);
  const step = appStep(text.open.step(namespace, shownFilter(ids)), openFilteredAction, {
    connection: target.connection,
    database: target.database,
    collection: target.collection,
    filter: formattedValue(filter, 'filter'),
    filterJson: filter,
    sort: '',
    projection: '',
  });
  const more: readonly After[] =
    found > ids.length
      ? [{ kind: 'notify', level: 'info', text: text.open.more(target.collection, ids.length, found) }]
      : [];
  return run({
    ...appPlan(text.open.title(namespace), [step]),
    danger: noDanger,
    undo: { cannot: text.open.nothingWritten },
    after: [{ kind: 'start', feature: featureId('query.run'), target }, ...more],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('search.open-in-collection'), plan };
