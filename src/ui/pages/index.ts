/**
 * The pages the main island can show, by name. Each area that has a page adds one line here; the tabs of M4 open
 * them.
 */
import { ConnectionFormPage } from './connection/form-page';
import { OverviewPage } from './connection/overview-page';
import { HomePage } from './home/home-page';
import { LogPage } from './log/log-page';
import { SettingsPage } from './settings/settings-page';
import { UndoHistoryPage } from './undo/undo-page';
import { KeyPage } from './key/key-page';
import { KeyInspector } from './keys/key-inspector';
import { KeysPage } from './keys/keys-page';
import { keysExtras } from './keys/keys-state';
import { ServerInspector } from './server/server-inspector';
import { ServerPage } from './server/server-page';
import { serverExtras } from './server/server-state';
import { useServerTab } from './server/server-store';
import { useKeysTab } from './keys/keys-store';
import { ValueItemInspector } from './value/value-inspector';
import { valueExtras } from './value/value-state';
import { useValueTab } from './value/value-store';
import { ConsoleInspector } from './console/console-inspector';
import { ConsolePage } from './console/console-page';
import { consoleExtras } from './console/console-state';
import { useConsoleTab } from './console/console-store';
import { GridFsInspector } from './gridfs/gridfs-inspector';
import { GridFsPage } from './gridfs/gridfs-page';
import { gridFsExtras } from './gridfs/gridfs-state';
import { useGridFsTab } from './gridfs/gridfs-store';
import { HistoryInspector, historyExtras } from './history/history-inspector';
import { HistoryPage } from './history/history-page';
import { useHistoryChanges } from './history/history-store';
import { WatchInspector, watchExtras } from './watch/watch-inspector';
import { WatchPage } from './watch/watch-page';
import { useWatchChanges } from './watch/watch-store';
import { PubSubInspector } from './pubsub/pubsub-inspector';
import { PubSubPage } from './pubsub/pubsub-page';
import { pubsubExtras } from './pubsub/pubsub-state';
import { usePubSubTab } from './pubsub/pubsub-store';
import { UsersInspector } from './user/user-inspector';
import { UsersPage } from './user/user-page';
import { usersExtras } from './user/user-state';
import { useUsersTab } from './user/user-store';
import { SearchInspector, searchExtras } from './search/search-inspector';
import { SearchPage } from './search/search-page';
import { useSearchTab } from './search/search-store';
import { DiagramPage } from './diagram/diagram-page';
import { CompareInspector, compareExtras } from './compare/compare-inspector';
import { ComparePage } from './compare/compare-page';
import { useCompareChanges } from './compare/compare-store';
import { StructureInspector, structureExtras } from './structure/structure-inspector';
import { StructurePage } from './structure/structure-page';
import { useStructureChanges } from './structure/structure-store';
import { TasksPage } from './tasks/tasks-page';
import { MonitorInspector } from './monitor/monitor-inspector';
import { MonitorPage } from './monitor/monitor-page';
import { monitorExtras } from './monitor/monitor-state';
import { useMonitorTab } from './monitor/monitor-store';
import { AdvisorPage } from './advisor/advisor-page';

/** A page as the main island draws it. */
export type PageView = () => React.JSX.Element | null;

/** Every page, by name. */
export const pages: Readonly<Record<string, PageView>> = {
  home: HomePage,
  settings: SettingsPage,
  log: LogPage,
  'connection-form': ConnectionFormPage,
  overview: OverviewPage,
  undo: UndoHistoryPage,
  server: ServerPage,
  gridfs: GridFsPage,
  history: HistoryPage,
  watch: WatchPage,
  pubsub: PubSubPage,
  users: UsersPage,
  search: SearchPage,
  diagram: DiagramPage,
  compare: ComparePage,
  structure: StructurePage,
  tasks: TasksPage,
  monitor: MonitorPage,
  advisor: AdvisorPage,
};

/** The pages of the tabs that show a target of a connection, by the kind of what they show (`keys`, `key`). */
export const tabPages: Readonly<Partial<Record<string, PageView>>> = {
  keys: KeysPage,
  key: KeyPage,
  console: ConsolePage,
};

/**
 * What the inspector island draws for one thing selected in a page, by the kind of what the active tab shows, or by
 * the name of its page for a page tab (`server`, `gridfs`, `history`, `watch`).
 */
export const inspectors: Readonly<
  Partial<Record<string, (props: { readonly tabId: string }) => React.JSX.Element | null>>
> = {
  keys: KeyInspector,
  key: ValueItemInspector,
  server: ServerInspector,
  console: ConsoleInspector,
  gridfs: GridFsInspector,
  history: HistoryInspector,
  watch: WatchInspector,
  pubsub: PubSubInspector,
  users: UsersInspector,
  search: SearchInspector,
  compare: CompareInspector,
  structure: StructureInspector,
  monitor: MonitorInspector,
};

/** What a page adds to the active tab, by its kind or its page: what the status line counts, what the inspector shows. */
export const tabExtras: Readonly<Partial<Record<string, typeof keysExtras>>> = {
  keys: keysExtras,
  key: valueExtras,
  server: serverExtras,
  console: consoleExtras,
  gridfs: gridFsExtras,
  history: historyExtras,
  watch: watchExtras,
  pubsub: pubsubExtras,
  users: usersExtras,
  search: searchExtras,
  compare: compareExtras,
  structure: structureExtras,
  monitor: monitorExtras,
};

/** The name `inspectors` and `tabExtras` know a tab by: its page for a page tab, else the kind of what it shows. */
export function extrasKey(shows: { readonly kind: string; readonly page?: string }): string {
  return shows.kind === 'page' && shows.page !== undefined ? shows.page : shows.kind;
}

/**
 * Draws the shell again whenever what a page keeps in the window changes: what a tab adds to it is drawn from that (the
 * key selected in a keys tab, the item of a value, the string selected in a console's output, the row of the Server
 * page, the file of a bucket, the history, Watch changes).
 */
export function usePageStores(): void {
  useKeysTab(undefined);
  useValueTab(undefined);
  useServerTab(undefined);
  useConsoleTab(undefined);
  useGridFsTab(undefined);
  useHistoryChanges();
  useWatchChanges();
  usePubSubTab(undefined);
  useUsersTab(undefined);
  useSearchTab(undefined);
  useCompareChanges();
  useStructureChanges();
  useMonitorTab(undefined);
}
