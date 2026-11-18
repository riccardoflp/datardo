/**
 * The window's mirror of the app's state: read once from the main process, then changed by the same events through the
 * same `reduce` (architecture, "State"). Components read it with {@link useAppState}.
 */
import { useSyncExternalStore } from 'react';
import { initialState, reduce, type AppEvent, type AppState } from '../../shared/state';

let state: AppState = initialState;
const listeners = new Set<() => void>();

function changed(next: AppState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Starts mirroring the main process's state; events that arrive before its first answer are applied after it. */
export async function connectState(): Promise<void> {
  const early: AppEvent[] = [];
  let ready = false;
  window.datardo.onEvent((event) => {
    if (ready) {
      changed(reduce(state, event));
    } else {
      early.push(event);
    }
  });
  const first = await window.datardo.state();
  ready = true;
  changed(early.reduce(reduce, first));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The app's state, drawn again whenever it changes. */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}
