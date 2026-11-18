/**
 * Whether Go to is open, and with what typed first: the window's own state (`palette.open`). The keys, the field of the
 * top bar and **All tabs** of the tab strip open it here; the main process asks for it through the app's state
 * (`palette.goToAsked`, the menu bar on macOS). Closing it gives the focus back to the control that had it.
 */
import { useSyncExternalStore } from 'react';

/** Go to, open with a prefix typed, or closed. */
export type GoToOpen = { readonly open: false } | { readonly open: true; readonly prefix: string; readonly at: number };

let current: GoToOpen = { open: false };
let before: HTMLElement | null = null;
const listeners = new Set<() => void>();

function set(next: GoToOpen): void {
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens Go to with `prefix` typed (`>` for the commands, `=` for the open tabs), or opens it again with it. */
export function openGoTo(prefix = ''): void {
  if (!current.open) {
    before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  set({ open: true, prefix, at: Date.now() });
}

/** Closes Go to; with `giveFocusBack`, the focus goes back to the control that had it before. */
export function closeGoTo(giveFocusBack = true): void {
  if (!current.open) {
    return;
  }
  set({ open: false });
  const had = before;
  before = null;
  if (giveFocusBack && had?.isConnected === true) {
    had.focus();
  }
}

/** Whether Go to is open now. */
export function isGoToOpen(): boolean {
  return current.open;
}

/** Go to's state, drawn again when it opens or closes. */
export function useGoTo(): GoToOpen {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
