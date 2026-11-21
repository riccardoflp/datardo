/**
 * The commands of the saved-query area that act on the active collection tab, carried out by the window the same way
 * for their keys and their rows in Go to (`palette.run-command`): **Queries** opens the queries list of the tab;
 * **Save query…** and **Save query in the folder…** save what the tab holds now, typed or run; **Clear recent
 * queries** clears those of its collection. **Choose the queries folder…** acts on the current connection, through
 * the runner.
 */
import type { AppState } from '../../../shared/state';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf } from '../../query/collection-reads';
import { queryOfTab, setOpenList, startOnCollection, whereOf } from './queries-store';

/** The commands this module carries out. */
const ids: ReadonlySet<string> = new Set([
  'saved-query.show',
  'saved-query.save',
  'saved-query.save:folder',
  'saved-query.clear-recent',
]);

/** Whether a command is one this module carries out. */
export function isSavedQueryCommand(id: string): boolean {
  return ids.has(id);
}

/** Carries out a command on the active collection tab; with none, it does nothing. */
export function runSavedQueryCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return;
  }
  switch (id) {
    case 'saved-query.show':
      setOpenList(ref.tab);
      return;
    case 'saved-query.save':
      void startOnCollection(ref, 'saved-query.save', { ...whereOf(ref), ...queryOfTab(ref) });
      return;
    case 'saved-query.save:folder':
      void startOnCollection(ref, 'saved-query.save', { ...whereOf(ref), ...queryOfTab(ref), place: 'folder' });
      return;
    case 'saved-query.clear-recent':
      void startOnCollection(ref, 'saved-query.clear-recent', whereOf(ref));
      return;
    default:
      return;
  }
}
