/**
 * What each tab of a bucket keeps in the window alone (`gridfs.show`): the filter as it is typed and as it was last
 * read, the sort, the page, what `gridfs.list` read, the file selected, and the previews read of the files selected
 * (`gridfs.inspect`), kept until **Refresh** or a change of the bucket. A tab's state lives while the tab is open.
 */
import { useSyncExternalStore } from 'react';
import { startingSort, type FilesPage, type FilesSort } from '../../../features/gridfs/list';
import type { Preview } from '../../../features/gridfs/preview';
import type { BucketRef } from '../../../features/gridfs/types';

/** What one tab of a bucket keeps. */
export interface GridFsTab {
  readonly place: BucketRef;
  /** The filter as it is typed. */
  readonly typed: string;
  /** The filter of the last read: the typed one, 300 ms after it was last typed in. */
  readonly filter: string;
  readonly sort: FilesSort;
  /** The page, counting from 0. */
  readonly page: number;
  readonly read?: FilesPage;
  readonly loading: boolean;
  readonly error?: string;
  /** The number of the last read sent: a reply to an older one is dropped. */
  readonly asked: number;
  /** The `_id` of the file selected, in mongosh syntax. */
  readonly selected?: string;
  /** The previews read, by the `_id` of their file in mongosh syntax. */
  readonly previews: ReadonlyMap<string, Preview>;
  /** The refresh of the connection last followed (`state.runner.refreshed.times`). */
  readonly refreshes: number;
}

const tabs = new Map<string, GridFsTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** A tab never shown: no filter, the newest first, the first page. */
export function freshTab(place: BucketRef, refreshes: number): GridFsTab {
  return {
    place,
    typed: '',
    filter: '',
    sort: startingSort,
    page: 0,
    loading: false,
    asked: 0,
    previews: new Map(),
    refreshes,
  };
}

/** The state of a tab, when it was shown once. */
export function gridFsTabOf(tab: string): GridFsTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepTab(tab: string, state: GridFsTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeTab(tab: string, change: (state: GridFsTab) => GridFsTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosed(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useGridFsTab(tab: string | undefined): GridFsTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
