/**
 * What each Monitor page tab keeps in the window alone (`monitor.show`): the last read of each part of the page, the
 * requests of each part, the choices of its controls, what is selected in each section, the values typed in the
 * controls of the profiler and of the threshold, the history of the lines of the Stats section (`monitor.rates`), and
 * what its Operations are doing. A tab's state lives until Datardo quits or the tab is closed; the section and the
 * choices are kept with the tab (`tab.restore`).
 */
import { useSyncExternalStore } from 'react';
import type { MonitorChoices } from '../../../features/monitor/parts/choices';
import type { PartRead } from '../../../features/monitor/parts/failure';
import type { ShardedCluster } from '../../../features/monitor/parts/sharding-records';
import type { RatesResult } from '../../../features/monitor/rates';
import type { CollectionStats } from '../../../features/monitor/read-collection-stats';
import type { DatabaseStats } from '../../../features/monitor/read-database-stats';
import type { ServerOperation } from '../../../features/monitor/read-operations';
import type { OplogEntries } from '../../../features/monitor/read-oplog';
import type { ReplicaSetRead, ServerKind } from '../../../features/monitor/read-replication';
import type { ServerStatus } from '../../../features/monitor/read-server-status';
import type { ShardingEvent } from '../../../features/monitor/read-sharding-events';
import type { ShardingServer } from '../../../features/monitor/read-sharding';
import type { SlowQueriesRead } from '../../../features/monitor/read-slow-queries';
import type { MonitorPart, PartRequests } from '../../../features/monitor/show';
import type { MonitorSection } from '../../../features/monitor/types';
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';

/**
 * What is selected in each section: an operation by its opid, a group by its key or an operation by its place, a
 * collection of the Stats section by its name, a member or an oplog entry, a shard, a sharded collection or an event.
 */
export interface MonitorSelection {
  readonly operation?: number | string;
  readonly slow?: { readonly group: string } | { readonly operation: number };
  readonly statsCollection?: string;
  readonly replication?: { readonly kind: 'member' | 'entry'; readonly key: string };
  readonly sharding?: { readonly kind: 'shard' | 'collection' | 'event'; readonly key: string };
}

/** What the Stats section read: the server, its rates and lines, the databases, the collections of one. */
export interface StatsReads {
  readonly server?: PartRead<ServerStatus>;
  readonly rates?: RatesResult;
  readonly databases?: PartRead<readonly DatabaseStats[]>;
  readonly collections?: PartRead<readonly CollectionStats[]>;
  /** The database whose collections were read. */
  readonly collectionsOf?: string;
}

/** What the Replication section read: what `hello` says the server is, the replica set, the oplog's entries. */
export interface ReplicationReads {
  readonly server?: PartRead<ServerKind>;
  readonly replicaSet?: ReplicaSetRead;
  readonly oplog?: PartRead<OplogEntries>;
}

/** What the Sharding section read: the kind of server, the cluster merged with the last full read, the events. */
export interface ShardingReads {
  readonly server?: PartRead<ShardingServer>;
  readonly cluster?: ShardedCluster;
  readonly events?: PartRead<readonly ShardingEvent[]>;
}

/** The values typed in the controls of the Slow queries section, before **Apply**. */
export interface SlowDrafts {
  readonly level?: number;
  readonly slowMs?: string;
  readonly logSlowMs?: string;
}

/** What one Monitor page tab keeps. */
export interface MonitorTab {
  readonly connection: ConnectionId;
  readonly choices: MonitorChoices;
  /** The section whose reads were last started as chosen. */
  readonly shown?: MonitorSection;
  /** The databases of the **Database** lists, read once when the page opened. */
  readonly databases?: PartRead<readonly string[]>;
  readonly operations?: PartRead<readonly ServerOperation[]>;
  readonly slow?: SlowQueriesRead;
  /** The arguments the last read of the slow operations was sent with: sent again after **Create index…**. */
  readonly slowArgs?: Json;
  /** When each part was last read. */
  readonly readAt: Partial<Readonly<Record<MonitorPart, number>>>;
  /** When the section was last read: what the automatic refresh counts from. */
  readonly lastReadAt?: number;
  readonly requests: PartRequests;
  /** The parts whose read runs now: the section keeps what it showed meanwhile. */
  readonly loading: readonly MonitorPart[];
  readonly selected: MonitorSelection;
  /** The opids whose kill runs now. */
  readonly killing: readonly (number | string)[];
  readonly drafts: SlowDrafts;
  /** The error line of an Operation of a section, by section. */
  readonly operationErrors: Partial<Readonly<Record<MonitorSection, string>>>;
  /** What an Operation of a section says once it ran (*The balancer is stopped.*), by section. */
  readonly notices: Partial<Readonly<Record<MonitorSection, string>>>;
  readonly stats: StatsReads;
  readonly replication: ReplicationReads;
  readonly sharding: ShardingReads;
}

const tabs = new Map<string, MonitorTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** A tab never shown in this run, with the choices kept with it. */
export function freshMonitorTab(connection: ConnectionId, choices: MonitorChoices): MonitorTab {
  return {
    connection,
    choices,
    readAt: {},
    requests: {},
    loading: [],
    selected: {},
    killing: [],
    drafts: {},
    operationErrors: {},
    notices: {},
    stats: {},
    replication: {},
    sharding: {},
  };
}

/** The state of a tab, when it was shown once. */
export function monitorTabOf(tab: string): MonitorTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepMonitorTab(tab: string, state: MonitorTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeMonitorTab(tab: string, change: (state: MonitorTab) => MonitorTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosedMonitorTabs(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useMonitorTab(tab: string | undefined): MonitorTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
