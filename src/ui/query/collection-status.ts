/**
 * What the shell shows of the active collection tab: the count of its page on the status line (`table.show`,
 * `50 of 1,204 documents · 38 ms`). The window forgets what it kept of a collection tab once the tab is closed.
 */
import { useEffect } from 'react';
import type { NavInput } from '../../features/nav/types';
import { view as showView } from '../../features/table/show';
import type { AppState } from '../../shared/state';
import { forgetClosed, useCollection } from './collection-store';
import { showStateOf } from './collection-view';

/** The shell's input with what the active collection tab counts. */
export function useCollectionStatus(state: AppState, input: NavInput): NavInput {
  const shown = input.activeTab;
  const tab = shown.kind === 'collection' ? shown.tab : undefined;
  const collection = useCollection(tab);
  const open = state.tabs.tabs;
  useEffect(() => {
    forgetClosed(new Set(open.map((each) => each.id)));
  }, [open]);
  if (tab === undefined) {
    return input;
  }
  const status = showView(showStateOf(collection, { view: false, readOnly: false })).statusLine;
  return status === undefined ? input : { ...input, activeTab: { ...shown, count: status } };
}
