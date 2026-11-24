/**
 * The commands of the tree area, each on the Commands line of its card (R2.3), with the title Go to shows. `F5` and
 * `Ctrl+F` act only while the tree island has the focus (`tree.keyboard`), so they are not the commands' keys.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { command, type Command } from '../command';
import { activeTabNode } from './exclude-from-searches';
import { collectionOfShows, databaseOfShows } from './parts/color-plan';
import { isOwnExcluded } from './parts/exclusion-plan';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('tree.refresh', text.commands.refresh),
  command('tree.filter', text.commands.filter),
  command('tree.set-collection-color', text.commands.setCollectionColor),
  command('tree.set-database-color', text.commands.setDatabaseColor),
  command('tree.exclude-from-searches', text.commands.excludeFromSearches),
];

/**
 * Whether **Set collection color…** and **Set database color…** are offered now: on the collection, view or bucket
 * of the active tab (a collection tab, a document tab, the page of a bucket) of a MongoDB connection, and on the
 * database of the active tab; read-only connections included. **Exclude from searches** on the collection, view or
 * bucket of the active tab of a MongoDB connection. `undefined` for the other commands.
 */
export function isOffered(state: AppState, id: string): boolean | undefined {
  const active = activeTabOf(state.tabs);
  switch (id) {
    case 'tree.set-collection-color':
      return active !== undefined && collectionOfShows(active.shows) !== undefined;
    case 'tree.set-database-color':
      return active !== undefined && databaseOfShows(active.shows) !== undefined;
    case 'tree.exclude-from-searches':
      return activeTabNode({ state }) !== undefined;
    default:
      return undefined;
  }
}

/** The title of **Exclude from searches** now: **Include in searches** when what the active tab shows is excluded. */
export function exclusionTitle(state: AppState): string {
  const active = activeTabNode({ state });
  return active !== undefined && isOwnExcluded(active.connection, active.node)
    ? text.commands.includeInSearches
    : text.commands.excludeFromSearches;
}
