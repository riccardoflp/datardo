/**
 * The commands of the tree area as Go to runs them (`tree.refresh`, `tree.filter`): **Refresh the tree** reads the
 * whole current connection again, and **Filter the tree** opens the field of the filter of the island shown.
 */
import type { AppState } from '../../shared/state';
import { refreshTree } from './tree-reads';

let filterOpener: (() => void) | undefined;

/** The opener of the filter of the tree island shown, which the island gives while it is drawn. */
export function setFilterOpener(open: (() => void) | undefined): void {
  filterOpener = open;
}

/** Runs a command of the tree area on the current connection; with none current it does nothing. */
export function runTreeCommand(id: 'tree.refresh' | 'tree.filter', state: AppState): void {
  const connection = state.nav.current;
  if (connection === undefined) {
    return;
  }
  if (id === 'tree.refresh') {
    void refreshTree(state, connection, { kind: 'connection' });
  } else {
    filterOpener?.();
  }
}
