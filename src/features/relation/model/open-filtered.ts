/**
 * The plan that opens a collection of the database filtered on the documents a reference names: one app step, `open
 * shop.users with the filter { _id: ObjectId("…") }`, with an empty sort and projection; then the query runs
 * (`query.run`). Nothing is written, so it works on a read-only connection, where the tab opens read-only.
 */
import { noDanger, run, type Outcome } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import type { Target } from '../../../shared/target';
import { appPlan, appStep } from '../../nav/types';
import { text } from '../text';
import type { ReferenceTarget } from '../types';
import type { DatabasePlace } from './args';

/** The app action that opens the collection tab (or makes it active) on its Documents section with a filter. */
export const openFilteredAction = 'query.open-filtered';

/** The plan that opens the collection of `target` with its filter, under `title`. */
export function openFilteredPlan(place: DatabasePlace, target: ReferenceTarget, title: string): Outcome {
  const collection: Target = {
    kind: 'collection',
    connection: place.connection,
    database: place.database,
    collection: target.collection,
  };
  const step = appStep(text.open.step(place.database, target.collection, target.filterText), openFilteredAction, {
    connection: place.connection,
    database: place.database,
    collection: target.collection,
    filter: target.filterText,
    filterJson: target.filter,
    sort: '',
    projection: '',
  });
  return run({
    ...appPlan(title, [step]),
    danger: noDanger,
    undo: { cannot: text.open.nothingWritten },
    after: [{ kind: 'start', feature: featureId('query.run'), target: collection }],
  });
}
