/**
 * The commands of the query bar, carried out by the window on the active collection tab, the same way for their keys
 * and for their rows in Go to (`palette.run-command`): **Focus filter** (`Ctrl+F`, `query.bar`), **Run query**
 * (`Ctrl+Enter`, `query.run`), **Reset query**, **Find** and **Builder**.
 */
import type { AppState } from '../../shared/state';
import { activeTabOf } from '../../shared/state/tabs';
import { resetBar, runFromBar, switchMode, toggleBuilder } from './bar-actions';
import { collectionRefOf } from './collection-reads';
import { changeCollection } from './collection-store';

/** The commands this module carries out. */
export const queryCommandIds: ReadonlySet<string> = new Set([
  'query.bar',
  'query.run',
  'query.reset',
  'query.mode:find',
  'query.mode:aggregate',
  'query.builder',
]);

/** Carries out a command of the query bar on the active collection tab; with none, it does nothing. */
export function runQueryCommand(id: string, state: AppState): void {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (active === undefined || active.shows.kind !== 'collection' || ref === undefined) {
    return;
  }
  switch (id) {
    case 'query.bar':
      changeCollection(ref.tab, (before) => ({ ...before, focusFilter: before.focusFilter + 1 }));
      return;
    case 'query.run':
      runFromBar(ref);
      return;
    case 'query.reset':
      resetBar(ref);
      return;
    case 'query.mode:find':
      switchMode(ref, 'find');
      return;
    case 'query.mode:aggregate':
      switchMode(ref, 'aggregate');
      return;
    case 'query.builder':
      toggleBuilder(ref);
      return;
    default:
      return;
  }
}
