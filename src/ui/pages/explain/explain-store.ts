/**
 * What the window keeps of the Explain section of each collection tab (`explain.show`): the last explain asked for,
 * whether it runs, what it gave or why it failed, and the choices of **Raw** and of the rows folded in it
 * (`explain.raw`). It lasts as long as the window, so the section shows the last explain at once when shown again.
 */
import { useSyncExternalStore } from 'react';
import type { ExplainResult } from '../../../features/explain/run';
import type { TabId } from '../../../shared/ids';

/** The Explain section of one tab. */
export interface ExplainMemory {
  /** The number of the last explain asked for: an earlier one that ends later is not shown. */
  readonly number: number;
  readonly running: boolean;
  readonly result?: ExplainResult;
  readonly error?: string;
  readonly cancelled: boolean;
  readonly raw: boolean;
  readonly toggled: readonly string[];
}

const memories = new Map<TabId, ExplainMemory>();
const listeners = new Set<() => void>();

/** A section never shown. */
export const unshownExplain: ExplainMemory = { number: 0, running: false, cancelled: false, raw: false, toggled: [] };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the window keeps of the Explain section of a tab. */
export function explainMemoryOf(tab: TabId): ExplainMemory {
  return memories.get(tab) ?? unshownExplain;
}

/** Changes what the window keeps of the Explain section of a tab. */
export function changeExplainMemory(tab: TabId, change: (before: ExplainMemory) => ExplainMemory): void {
  memories.set(tab, change(explainMemoryOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets the sections of the tabs that are closed. */
export function forgetClosedExplains(open: ReadonlySet<string>): void {
  for (const tab of [...memories.keys()]) {
    if (!open.has(tab)) {
      memories.delete(tab);
    }
  }
}

/** What the window keeps of the Explain section of a tab, drawn again when it changes. */
export function useExplainMemory(tab: TabId): ExplainMemory {
  return useSyncExternalStore(subscribe, () => explainMemoryOf(tab));
}
