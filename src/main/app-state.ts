/**
 * The app's state in the main process: changed only through `reduce` (R3.3), each event sent to the window, which
 * reduces it into its mirror of the state.
 */
import type { BrowserWindow } from 'electron';
import { bridgeChannel } from '../shared/bridge';
import { initialState, reduce, type AppEvent, type AppState } from '../shared/state';
import type { StateHolder } from '../runner/ports';

/** The state, the windows that mirror it, and who else listens to its events. */
export class AppStateHolder implements StateHolder {
  private state: AppState = initialState;
  private readonly windows = new Set<BrowserWindow>();
  private readonly listeners = new Set<(event: AppEvent, state: AppState) => void>();

  /** The state now. */
  readonly get = (): AppState => this.state;

  /** Changes the state and tells the windows and the listeners. */
  readonly dispatch = (event: AppEvent): void => {
    this.state = reduce(this.state, event);
    for (const window of this.windows) {
      if (!window.isDestroyed()) {
        window.webContents.send(bridgeChannel.event, event);
      }
    }
    for (const listener of this.listeners) {
      listener(event, this.state);
    }
  };

  /** Sends the events to a window from now on, until it is closed. */
  mirrorTo(window: BrowserWindow): void {
    this.windows.add(window);
    window.on('closed', () => this.windows.delete(window));
  }

  /** Calls `listener` after every change; returns what stops it. */
  listen(listener: (event: AppEvent, state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
