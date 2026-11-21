/**
 * What the window keeps of the inspector of each collection tab (`document.inspect`): **Tree** or **Text**, how the
 * tree is folded, the lines opened or folded by hand, and the line selected. It is forgotten with the tab.
 */
import { useSyncExternalStore } from 'react';
import type { Folding } from '../../../features/document/inspect';
import type { TabId } from '../../../shared/ids';

/** The inspector of one tab. */
export interface InspectMemory {
  readonly mode: 'tree' | 'text';
  readonly folding: Folding;
  readonly toggled: readonly string[];
  /** The field path of the selected line. */
  readonly line?: string;
  /** Asks the island for the focus: a new number each time. */
  readonly focus: number;
}

const fresh: InspectMemory = { mode: 'tree', folding: 'levels', toggled: [], focus: 0 };
const memories = new Map<TabId, InspectMemory>();
const listeners = new Set<() => void>();

/** The inspector of a tab. */
export function inspectOf(tab: TabId): InspectMemory {
  return memories.get(tab) ?? fresh;
}

/** Changes the inspector of a tab. */
export function changeInspect(tab: TabId, change: (before: InspectMemory) => InspectMemory): void {
  memories.set(tab, change(inspectOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** Opens or folds one line of the tree. */
export function toggleLine(tab: TabId, path: string): void {
  changeInspect(tab, (before) => ({
    ...before,
    toggled: before.toggled.includes(path) ? before.toggled.filter((each) => each !== path) : [...before.toggled, path],
  }));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The inspector of a tab, drawn again whenever it changes. */
export function useInspect(tab: TabId | undefined): InspectMemory {
  return useSyncExternalStore(subscribe, () => (tab === undefined ? fresh : inspectOf(tab)));
}
