/**
 * The states the Views of the Monitor page are drawn from, made of what a tab keeps and the app's state; and what a
 * Monitor page tab adds to the active tab for the inspector island (`nav.inspector`).
 */
import type { Inspection } from '../../../features/nav/types';
import { view as operationsView, type OperationsState } from '../../../features/monitor/operations';
import { builtSections, firstSection } from '../../../features/monitor/show';
import { view as slowView, type SlowQueriesState } from '../../../features/monitor/slow-queries';
import { text } from '../../../features/monitor/text';
import type { MonitorSection } from '../../../features/monitor/types';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import { treeOf } from '../../tree/tree-store';
import { databasesOf, slowDatabaseOf } from './monitor-reads';
import { monitorTabOf, type MonitorTab } from './monitor-store';

/** The connection of a tab as the Views need it: its name, whether it is read-only, whether it reaches a mongos. */
export interface PageConnection {
  readonly id: ConnectionId;
  readonly name: string;
  readonly readOnly: boolean;
  readonly mongos: boolean;
  readonly version?: string;
}

/** The connection of a tab, while it is saved. */
export function connectionOf(app: AppState, id: ConnectionId): PageConnection | undefined {
  const saved = savedConnection(app.connections, id);
  if (saved === undefined) {
    return undefined;
  }
  const server = app.connections.live[id]?.server;
  const mongo = server?.engine === 'mongodb' ? server : undefined;
  return {
    id,
    name: saved.name,
    readOnly: saved.readOnly,
    mongos: mongo?.topology.kind === 'sharded',
    ...(mongo === undefined ? {} : { version: mongo.version }),
  };
}

/** The section a tab shows: the one kept with it when it is built, else **Operations**. */
export function sectionOf(app: AppState, tabId: string): MonitorSection {
  const section = app.tabs.tabs.find((each) => each.id === tabId)?.section;
  return builtSections.find((each) => each === section) ?? firstSection;
}

/** The namespaces the tree island has read as views: their suggested index cannot be created. */
export function viewsOf(connection: ConnectionId): readonly string[] {
  const contents = treeOf(connection).island.mongodb.contents;
  return Object.entries(contents).flatMap(([database, read]) =>
    read.kind === 'loaded'
      ? read.value.entries.filter((entry) => entry.kind === 'view').map((entry) => `${database}.${entry.name}`)
      : [],
  );
}

/** The state of the Operations section. */
export function operationsState(tab: MonitorTab, connection: PageConnection): OperationsState {
  const { choices } = tab;
  return {
    connection,
    ...(tab.operations === undefined ? {} : { read: tab.operations }),
    ...(tab.readAt.operations === undefined ? {} : { readAt: tab.readAt.operations }),
    filter: choices.operationsFilter,
    runningAtLeast: choices.runningAtLeast,
    idle: choices.idle,
    system: choices.system,
    killing: tab.killing,
    ...(tab.selected.operation === undefined ? {} : { selected: tab.selected.operation }),
  };
}

/** The state of the Slow queries section. */
export function slowState(tab: MonitorTab, connection: PageConnection): SlowQueriesState {
  const { choices } = tab;
  const database = slowDatabaseOf(tab);
  return {
    connection,
    ...(connection.version === undefined ? {} : { version: connection.version }),
    source: connection.mongos ? 'log' : choices.source,
    ...(database === undefined ? {} : { database }),
    databases: databasesOf(tab),
    since: choices.since,
    grouping: choices.grouping,
    filter: choices.slowFilter,
    ...(choices.sort === undefined ? {} : { sort: choices.sort }),
    ...(tab.slow === undefined ? {} : { read: tab.slow }),
    ...(tab.slowArgs === undefined ? {} : { readArgs: tab.slowArgs }),
    views: viewsOf(connection.id),
    ...(tab.selected.slow === undefined ? {} : { selected: tab.selected.slow }),
  };
}

/** The title of what is selected in the section shown, or `undefined` when nothing is. */
function selectedTitle(app: AppState, tab: MonitorTab, section: MonitorSection): string | undefined {
  const connection = connectionOf(app, tab.connection);
  if (connection === undefined) {
    return undefined;
  }
  if (section === 'operations') {
    const shown = operationsView(operationsState(tab, connection)).inspector;
    return shown === undefined ? undefined : `${text.operations.columns.opid} ${String(tab.selected.operation)}`;
  }
  const shown = slowView(slowState(tab, connection)).inspector;
  return shown?.record.title;
}

/** What a Monitor page tab adds to the active tab: what the inspector island shows. */
export function monitorExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = monitorTabOf(tabId);
  if (tab === undefined) {
    return {};
  }
  const title = selectedTitle(app, tab, sectionOf(app, tabId));
  return {
    inspection:
      title === undefined ? { selected: 0, emptyLine: text.window.emptyLine } : { selected: 1, title, emptyLine: '' },
  };
}
