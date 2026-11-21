/**
 * What the shell shows of the active collection tab: the count of its page on the status line (`table.show`,
 * `50 of 1,204 documents · 38 ms`), and the selection of its table in the inspector island (`document.inspect`). The window forgets what it kept of a collection tab once the tab is closed.
 */
import { useEffect } from 'react';
import type { NavInput } from '../../features/nav/types';
import { view as showView } from '../../features/table/show';
import type { AppState } from '../../shared/state';
import { inspectionOf } from '../pages/document/inspect-state';
import { collectionRefOf } from './collection-reads';
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
  const ref = collectionRefOf(tab);
  return {
    ...input,
    activeTab: {
      ...shown,
      ...(status === undefined ? {} : { count: status }),
      ...(ref === undefined ? {} : { inspection: inspectionOf(ref, collection) }),
    },
  };
}
