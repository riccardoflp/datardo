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
import { initialTableState, reduceTable, type TableEvent, type TableState } from './table';
import { initialTabsState, reduceTabs, type TabsEvent, type TabsState } from './tabs';
import { initialWindowState, reduceWindow, type WindowEvent, type WindowState } from './window';
import { initialUndoState, reduceUndo, type UndoEvent, type UndoState } from './undo';
import { initialOplogState, reduceOplog, type OplogState, type OplogStateEvent } from './oplog';
import {
  initialPlaygroundsState,
  reducePlaygrounds,
  type PlaygroundsEvent,
  type PlaygroundsState,
} from './playgrounds';
import { initialConsolesState, reduceConsoles, type ConsolesEvent, type ConsolesState } from './consoles';
import { initialSavedQueryState, reduceSavedQuery, type SavedQueryEvent, type SavedQueryState } from './saved-query';
import { initialMcpState, reduceMcp, type McpEvent, type McpState } from './mcp';
import { initialWatchState, reduceWatch, type WatchPages, type WatchStateEvent } from './watch';
import { initialPubSubPages, reducePubSub, type PubSubEvent, type PubSubPages } from './pubsub';
import { initialSearchState, reduceSearch, type SearchState, type SearchStateEvent } from './search';
import { initialRelationState, reduceRelation, type RelationState, type RelationStateEvent } from './relation';
import { initialTasksState, reduceTasks, type TasksEvent, type TasksState } from './tasks';
import { initialSchemaState, reduceSchema, type SchemaEvent, type SchemaState } from './schema';

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
  readonly table: TableState;
  readonly playgrounds: PlaygroundsState;
  readonly consoles: ConsolesState;
  readonly savedQuery: SavedQueryState;
  readonly mcp: McpState;
  readonly watch: WatchPages;
  readonly pubsubPages: PubSubPages;
  readonly search: SearchState;
  readonly relation: RelationState;
  readonly tasks: TasksState;
  readonly schema: SchemaState;
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
  | OplogStateEvent
  | TableEvent
  | PlaygroundsEvent
  | ConsolesEvent
  | SavedQueryEvent
  | McpEvent
  | WatchStateEvent
  | PubSubEvent
  | SearchStateEvent
  | RelationStateEvent
  | TasksEvent
  | SchemaEvent;

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
  table: initialTableState,
  playgrounds: initialPlaygroundsState,
  consoles: initialConsolesState,
  savedQuery: initialSavedQueryState,
  mcp: initialMcpState,
  watch: initialWatchState,
  pubsubPages: initialPubSubPages,
  search: initialSearchState,
  relation: initialRelationState,
  tasks: initialTasksState,
  schema: initialSchemaState,
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
    case 'table':
      return { ...state, table: reduceTable(state.table, event) };
    case 'playgrounds':
      return { ...state, playgrounds: reducePlaygrounds(state.playgrounds, event) };
    case 'consoles':
      return { ...state, consoles: reduceConsoles(state.consoles, event) };
    case 'saved-query':
      return { ...state, savedQuery: reduceSavedQuery(state.savedQuery, event) };
    case 'mcp':
      return { ...state, mcp: reduceMcp(state.mcp, event) };
    case 'watch':
      return { ...state, watch: reduceWatch(state.watch, event) };
    case 'pubsub':
      return { ...state, pubsubPages: reducePubSub(state.pubsubPages, event) };
    case 'search':
      return { ...state, search: reduceSearch(state.search, event) };
    case 'relation':
      return { ...state, relation: reduceRelation(state.relation, event) };
    case 'tasks':
      return { ...state, tasks: reduceTasks(state.tasks, event) };
    case 'schema':
      return { ...state, schema: reduceSchema(state.schema, event) };
  }
}
