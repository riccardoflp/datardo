/**
 * Whether the **Columns** panel is open, and on which tab (`table.columns`): its button, **Columns…** of a header's
 * menu and the command of Go to open it; `Esc` and a click outside close it.
 */
import { useSyncExternalStore } from 'react';
import type { TabId } from '../../shared/ids';

let open: TabId | undefined;
const listeners = new Set<() => void>();

function changed(next: TabId | undefined): void {
  open = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens the panel of a tab. */
export function openColumnsPanel(tab: TabId): void {
  changed(tab);
}

/** Closes the panel. */
export function closeColumnsPanel(): void {
  if (open !== undefined) {
    changed(undefined);
  }
}

/** Opens the panel of a tab, or closes it when it is open. */
export function toggleColumnsPanel(tab: TabId): void {
  changed(open === tab ? undefined : tab);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the panel of a tab is open, drawn again when it changes. */
export function useColumnsPanel(tab: TabId): boolean {
  return useSyncExternalStore(subscribe, () => open === tab);
}
