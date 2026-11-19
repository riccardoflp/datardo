/**
 * The app's state and the one function that changes it (architecture, "State"; R3.3). The main process holds the
 * state and changes it only through {@link reduce}; it sends each event to the window, which reduces the same events
 * into its mirror of the state.
 *
 * The state is made of parts, one per area that needs one, in `src/shared/state/<part>.ts`. Each part exports its
 * state, its initial value, its events (each carrying `slice: '<part>'`) and its reducer; a new part adds one line to
 * each of the four lists below.
 */
import { initialAppInfo, reduceAppInfo, type AppInfoEvent, type AppInfoState } from './app';
import {
  initialConnectionsState,
  reduceConnections,
  type ConnectionsEvent,
  type ConnectionsState,
} from './connections';
import { initialNavState, reduceNav, type NavEvent, type NavState } from './nav';
import { initialPaletteState, reducePalette, type PaletteEvent, type PaletteState } from './palette';
import { initialRunnerState, reduceRunner, type RunnerEvent, type RunnerState } from './runner';
import { initialSettingsState, reduceSettings, type SettingsEvent, type SettingsState } from './settings';
import { initialTabsState, reduceTabs, type TabsEvent, type TabsState } from './tabs';
import { initialWindowState, reduceWindow, type WindowEvent, type WindowState } from './window';
import { initialUndoState, reduceUndo, type UndoEvent, type UndoState } from './undo';
import { initialOplogState, reduceOplog, type OplogState, type OplogStateEvent } from './oplog';

/** Everything the window shows and the features decide from, apart from the results of reads. */
export interface AppState {
  readonly app: AppInfoState;
  readonly settings: SettingsState;
  readonly runner: RunnerState;
  readonly window: WindowState;
  readonly nav: NavState;
  readonly connections: ConnectionsState;
  readonly tabs: TabsState;
  readonly palette: PaletteState;
  readonly undo: UndoState;
  readonly oplog: OplogState;
}

/** Every change to the app's state. */
export type AppEvent =
  | AppInfoEvent
  | SettingsEvent
  | RunnerEvent
  | WindowEvent
  | NavEvent
  | ConnectionsEvent
  | TabsEvent
  | PaletteEvent
  | UndoEvent
  | OplogStateEvent;

/** The state at start, before anything is loaded. */
export const initialState: AppState = {
  app: initialAppInfo,
  settings: initialSettingsState,
  runner: initialRunnerState,
  window: initialWindowState,
  nav: initialNavState,
  connections: initialConnectionsState,
  tabs: initialTabsState,
  palette: initialPaletteState,
  undo: initialUndoState,
  oplog: initialOplogState,
};

/** The one function that changes the app's state. */
export function reduce(state: AppState, event: AppEvent): AppState {
  switch (event.slice) {
    case 'app':
      return { ...state, app: reduceAppInfo(state.app, event) };
    case 'settings':
      return { ...state, settings: reduceSettings(state.settings, event) };
    case 'runner':
      return { ...state, runner: reduceRunner(state.runner, event) };
    case 'window':
      return { ...state, window: reduceWindow(state.window, event) };
    case 'nav':
      return { ...state, nav: reduceNav(state.nav, event) };
    case 'connections':
      return { ...state, connections: reduceConnections(state.connections, event) };
    case 'tabs':
      return { ...state, tabs: reduceTabs(state.tabs, event) };
    case 'palette':
      return { ...state, palette: reducePalette(state.palette, event) };
    case 'undo':
      return { ...state, undo: reduceUndo(state.undo, event) };
    case 'oplog':
      return { ...state, oplog: reduceOplog(state.oplog, event) };
  }
}
