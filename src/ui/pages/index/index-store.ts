/**
 * What the window keeps of the Indexes section of each collection tab (`index.show`): the indexes and the search
 * indexes last read, whether a read or a change is running, the order of the table, the row selected, and when a
 * search index was last changed from here. It lasts as long as the window, so the section is drawn at once when it is
 * shown again; the lists are read again then.
 */
import { useSyncExternalStore } from 'react';
import type { IndexSectionState, IndexSort } from '../../../features/index/show';
import type { SearchIndexList } from '../../../features/index/types';
import type { TabId } from '../../../shared/ids';

/** The Indexes section of one tab. */
export interface IndexMemory {
  readonly indexes?: IndexSectionState['indexes'];
  readonly searchIndexes?: SearchIndexList;
  /** The indexes are being read. */
  readonly loading: boolean;
  /** How many changes started here are running. */
  readonly changing: number;
  readonly searchChangedAt?: number;
  readonly sort?: IndexSort;
  readonly selected?: IndexSectionState['selected'];
  /** Whether the lists were asked for since the section was last shown. */
  readonly asked: boolean;
}

const memories = new Map<TabId, IndexMemory>();
const listeners = new Set<() => void>();

/** Nothing read yet. */
export const unreadIndexes: IndexMemory = { loading: false, changing: 0, asked: false };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the window keeps of the Indexes section of a tab. */
export function indexMemoryOf(tab: TabId): IndexMemory {
  return memories.get(tab) ?? unreadIndexes;
}

/** Changes what the window keeps of the Indexes section of a tab. */
export function changeIndexMemory(tab: TabId, change: (before: IndexMemory) => IndexMemory): void {
  memories.set(tab, change(indexMemoryOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets the sections of the tabs that are closed. */
export function forgetClosedIndexes(open: ReadonlySet<string>): void {
  for (const tab of [...memories.keys()]) {
    if (!open.has(tab)) {
      memories.delete(tab);
    }
  }
}

/** What the window keeps of the Indexes section of a tab, drawn again when it changes; nothing for no tab. */
export function useIndexMemory(tab: TabId | undefined): IndexMemory {
  return useSyncExternalStore(subscribe, () => (tab === undefined ? unreadIndexes : indexMemoryOf(tab)));
}
