/**
 * *Copied to the clipboard* on the status line for 2 seconds after a copy of the table (`table.copy-as`,
 * `table.copy-value`, `table.copy-path`): the window's own memory of the last copy, which the status line reads.
 */
import { useSyncExternalStore } from 'react';
import { text } from '../../features/table/text';

/** How long the status line says it, in ms (the cards). */
export const copiedShownMs = 2000;

let shown: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function changed(next: string | undefined): void {
  shown = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Says *Copied to the clipboard* on the status line, for 2 seconds from now. */
export function flashCopied(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  changed(text.copied);
  timer = setTimeout(() => {
    timer = undefined;
    changed(undefined);
  }, copiedShownMs);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What the status line says of the last copy, while it says it. */
export function useCopiedFlash(): string | undefined {
  return useSyncExternalStore(subscribe, () => shown);
}
