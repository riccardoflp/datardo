/**
 * The states the Views of the Server page are drawn from, made of what a tab keeps and the app's state; and what a
 * Server page tab adds to the active tab for the status line and the inspector island (`nav.status-line`,
 * `nav.inspector`).
 */
import { nameText } from '../../../features/key/types';
import type { Inspection as IslandInspection } from '../../../features/nav/types';
import { view as clientsView, type ClientsState } from '../../../features/server/clients';
import { view as configView, type ConfigState } from '../../../features/server/config';
import { view as memoryView, type MemoryState } from '../../../features/server/memory';
import { view as overviewView, type OverviewState } from '../../../features/server/overview';
import { view as replicationView, type ReplicationState } from '../../../features/server/replication';
import { firstSection } from '../../../features/server/show';
import { view as slowLogView, type SlowLogState } from '../../../features/server/slow-log';
import { text } from '../../../features/server/text';
import { bytesOfHex, valueOf, type Inspection, type ServerSection } from '../../../features/server/types';
import type { ConnectionView } from '../../../shared/connection';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import { serverTabOf, type ServerTab } from './server-store';

/** The connection of a tab as the Views need it, while it is saved. */
export function connectionOf(app: AppState, id: ConnectionId): ConnectionView | undefined {
  return savedConnection(app.connections, id);
}

/** The section a tab shows: the one kept with it, else **Overview**. */
export function sectionOf(app: AppState, tabId: string): ServerSection {
  const tab = app.tabs.tabs.find((each) => each.id === tabId);
  const section = tab?.section;
  const known: readonly string[] = ['overview', 'clients', 'slow-log', 'memory', 'replication', 'configuration'];
  return section !== undefined && known.includes(section) ? (section as ServerSection) : firstSection;
}

/** The state of the Overview section. */
export function overviewState(tab: ServerTab, now: number): OverviewState {
  const selected = tab.selected.overview;
  return {
    connection: tab.connection,
    ...(tab.info === undefined ? {} : { info: tab.info }),
    now,
    ...(selected === undefined ? {} : { selected }),
    ...(tab.selected.database === undefined ? {} : { selectedDatabase: tab.selected.database }),
  };
}

/** The state of the Clients section. */
export function clientsState(tab: ServerTab, connection: ConnectionView): ClientsState {
  return {
    connection,
    ...(tab.clients === undefined ? {} : { clients: tab.clients }),
    ...(tab.readAt.clients === undefined ? {} : { readAt: tab.readAt.clients }),
    filter: tab.choices.clientsFilter,
    idleAtMost: tab.choices.clientsIdle,
    sort: tab.choices.clientsSort,
    ...(tab.selected.clients === undefined ? {} : { selected: tab.selected.clients }),
    disconnecting: tab.disconnecting,
  };
}

/** The state of the Slow log section. */
export function slowLogState(tab: ServerTab, connection: ConnectionView, now: number): SlowLogState {
  const selected = tab.selected['slow-log'];
  return {
    connection,
    ...(tab.slowLog === undefined ? {} : { entries: tab.slowLog }),
    ...(tab.threshold === undefined ? {} : { threshold: tab.threshold }),
    ...(tab.readAt['slow-log'] === undefined ? {} : { readAt: tab.readAt['slow-log'] }),
    now,
    filter: tab.choices.slowLogFilter,
    slowerThanMs: tab.choices.slowerThan,
    order: tab.choices.slowLogOrder,
    ...(selected === undefined ? {} : { selected }),
    clearing: tab.clearing,
  };
}

/** The state of the Memory section, with the part of the largest keys. */
export function memoryState(tab: ServerTab, connection: ConnectionView): MemoryState {
  const { search, chosen } = tab.largest;
  return {
    ...(tab.memory === undefined ? {} : { stats: tab.memory }),
    ...(tab.doctor === undefined ? {} : { doctor: tab.doctor }),
    ...(tab.selected.memory === undefined ? {} : { selected: tab.selected.memory }),
    largest: {
      connection,
      databases: valueOf(tab.keyspace)?.databases ?? [],
      ...(chosen === undefined ? {} : { chosen }),
      ...(search === undefined ? {} : { search }),
      ...(tab.selected.largest === undefined ? {} : { selected: tab.selected.largest }),
    },
  };
}

/** The state of the Replication section. */
export function replicationState(tab: ServerTab): ReplicationState {
  return {
    ...(tab.replication === undefined ? {} : { info: tab.replication }),
    ...(tab.selected.replication === undefined ? {} : { selected: tab.selected.replication }),
  };
}

/** The state of the Configuration section. */
export function configState(tab: ServerTab): ConfigState {
  return {
    connection: tab.connection,
    ...(tab.config === undefined ? {} : { parameters: tab.config }),
    ...(tab.readAt.config === undefined ? {} : { readAt: tab.readAt.config }),
    filter: tab.choices.configFilter,
    ...(tab.selected.configuration === undefined ? {} : { selected: tab.selected.configuration }),
  };
}

/** What the inspector island shows of the section shown: every field of what is selected; `undefined` when nothing is. */
export function inspectionOf(
  app: AppState,
  tab: ServerTab,
  section: ServerSection,
  now: number,
): Inspection | undefined {
  const connection = connectionOf(app, tab.connection);
  if (connection === undefined) {
    return undefined;
  }
  switch (section) {
    case 'overview':
      return overviewView(overviewState(tab, now)).inspector;
    case 'clients':
      return clientsView(clientsState(tab, connection)).inspector;
    case 'slow-log':
      return slowLogView(slowLogState(tab, connection, now)).inspector;
    case 'memory':
      return memoryView(memoryState(tab, connection)).inspector;
    case 'replication':
      return replicationView(replicationState(tab)).inspector;
    case 'configuration':
      return configView(configState(tab)).inspector;
  }
}

/** What a Server page tab adds to the active tab: what the inspector island shows. */
export function serverExtras(app: AppState, tabId: string): { count?: string; inspection?: IslandInspection } {
  const tab = serverTabOf(tabId);
  if (tab === undefined) {
    return {};
  }
  const section = sectionOf(app, tabId);
  const largest = section === 'memory' ? tab.selected.largest : undefined;
  if (largest !== undefined) {
    return { inspection: { selected: 1, title: nameText(bytesOfHex(largest)), emptyLine: '' } };
  }
  const shown = inspectionOf(app, tab, section, Date.now());
  return {
    inspection:
      shown === undefined
        ? { selected: 0, emptyLine: text.window.emptyLine }
        : { selected: 1, title: shown.title, emptyLine: '' },
  };
}
