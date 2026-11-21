/**
 * What the window keeps of the Schema section of each collection tab (`schema.show`): the size chosen in **Sample**,
 * the fields expanded, and whether the filter of the last request was refused. It lasts as long as the window. The
 * sample itself, its state and its result, is the tab's in the app's state (`state.schema`), where the main process
 * puts it.
 */
import { useSyncExternalStore } from 'react';
import { firstSampleSize } from '../../../features/schema/sample';
import type { TabId } from '../../../shared/ids';

/** The Schema section of one tab. */
export interface SchemaMemory {
  readonly size: number;
  readonly expanded: readonly string[];
  readonly invalidFilter: boolean;
}

const memories = new Map<TabId, SchemaMemory>();
const listeners = new Set<() => void>();

/** A section never shown: **Sample** at 1,000, nothing expanded. */
export const unshownSchema: SchemaMemory = { size: firstSampleSize, expanded: [], invalidFilter: false };

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** What the window keeps of the Schema section of a tab. */
export function schemaMemoryOf(tab: TabId): SchemaMemory {
  return memories.get(tab) ?? unshownSchema;
}

/** Changes what the window keeps of the Schema section of a tab. */
export function changeSchemaMemory(tab: TabId, change: (before: SchemaMemory) => SchemaMemory): void {
  memories.set(tab, change(schemaMemoryOf(tab)));
  for (const listener of listeners) {
    listener();
  }
}

/** Forgets the sections of the tabs that are closed. */
export function forgetClosedSchemas(open: ReadonlySet<string>): void {
  for (const tab of [...memories.keys()]) {
    if (!open.has(tab)) {
      memories.delete(tab);
    }
  }
}

/** What the window keeps of the Schema section of a tab, drawn again when it changes. */
export function useSchemaMemory(tab: TabId): SchemaMemory {
  return useSyncExternalStore(subscribe, () => schemaMemoryOf(tab));
}
