/**
 * The commands of the index area from Go to and their keys (`palette.run-command`), on the collection of the active
 * tab: **Indexes** shows its section; **Create index…** and **Create search index…** open their dialog; the others act
 * on the row selected in the Indexes section, as its menu does. Nothing when no row of the right kind is selected.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { startFeature } from '../../shell/intent';
import type { IndexPlace } from './index-actions';
import { inspectedOf } from './index-inspector';
import { indexMemoryOf } from './index-store';
import { createIndex, createSearchIndex, startRowAction } from './row-actions';

/** The controls the commands on a row act as. */
const rowElements: Readonly<Record<string, string>> = {
  'index.edit': 'index.edit@row-menu',
  'index.hide': 'index.hide@row-menu',
  'index.drop': 'index.drop@row-menu',
  'index.edit-search': 'index.edit-search@row-menu',
  'index.drop-search': 'index.drop-search@row-menu',
};

/** Whether a command is one of the index area's. */
export function isIndexCommand(id: string): boolean {
  return id === 'index.show' || id === 'index.create' || id === 'index.create-search' || id in rowElements;
}

/** Runs a command of the index area on the active tab. */
export function runIndexCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  if (active?.shows.kind !== 'collection' || active.shows.view === true) {
    return;
  }
  const shows = active.shows;
  const place: IndexPlace = {
    tab: active.id,
    connection: shows.connection,
    database: shows.database,
    collection: shows.collection,
  };
  switch (id) {
    case 'index.show':
      startFeature('tab.open', {
        args: {
          shows: {
            kind: 'collection',
            connection: place.connection,
            database: place.database,
            collection: place.collection,
          },
          section: 'indexes',
        },
      });
      return;
    case 'index.create':
      createIndex(place);
      return;
    case 'index.create-search':
      createSearchIndex(place);
      return;
  }
  const element = rowElements[id];
  const inspected = inspectedOf(indexMemoryOf(active.id));
  const search = id.endsWith('-search');
  if (element !== undefined && inspected !== undefined && (inspected.kind === 'search') === search) {
    startRowAction(place, element, inspected);
  }
}
