/**
 * What each Server page tab keeps in the window alone (`server.show`): the last read of each part of the page, the
 * requests of each part, the client the page reads with (`CLIENT ID`), the choices of its controls, what is selected
 * in each section, what its two Operations are doing, and the search of the largest keys. A tab's state lives until
 * Datardo quits or the tab is closed; the section and the choices are kept with the tab (`tab.restore`).
 */
import { useSyncExternalStore } from 'react';
import type { InspectRead } from '../../../features/key/inspect';
import type { LargestKeysSearch } from '../../../features/server/largest-keys';
import type { MemoryTileName } from '../../../features/server/memory';
import type { OverviewTileName } from '../../../features/server/overview';
import type { ServerClient } from '../../../features/server/read-clients';
import type { ConfigParameter } from '../../../features/server/read-config';
import type { InfoReport } from '../../../features/server/read-info';
import type { MemoryStats } from '../../../features/server/read-memory';
import type { SlowLogEntries, SlowLogThreshold } from '../../../features/server/read-slow-log';
import { noRequests, type PartRequests, type ServerChoices, type ServerPart } from '../../../features/server/show';
import type { PartRead, ServerSection } from '../../../features/server/types';
import type { ConnectionId } from '../../../shared/ids';

/** What is selected in each section: a tile, or a row by what names it. */
export interface ServerSelection {
  readonly overview?: OverviewTileName;
  /** A row of **Keys per database**, by its database. */
  readonly database?: number;
  readonly clients?: string;
  readonly 'slow-log'?: number;
  readonly memory?: MemoryTileName;
  /** A row of the largest keys, by the hexadecimal of its name. */
  readonly largest?: string;
  readonly replication?: string;
  readonly configuration?: string;
}

/** The search of the largest keys and the key of it the inspector island shows. */
export interface LargestState {
  readonly chosen?: number;
  readonly search?: LargestKeysSearch;
  /** The run in progress: **Cancel**, a new search or **Examine 100,000 more** stops an older one. */
  readonly run: number;
  /** The ask of Go to (`server.largest-keys`) already followed, by when it was asked. */
  readonly handledAsk?: number;
  readonly inspected?: { readonly key: string; readonly read: InspectRead };
}

/** What one Server page tab keeps. */
export interface ServerTab {
  readonly connection: ConnectionId;
  /** When the page was first shown in this run, in milliseconds since 1970. */
  readonly createdAt: number;
  readonly choices: ServerChoices;
  /** What `CLIENT ID` answered, once asked. */
  readonly own?: string;
  /** The section whose reads were last started as chosen. */
  readonly shown?: ServerSection;
  readonly info?: PartRead<InfoReport>;
  readonly replication?: PartRead<InfoReport>;
  readonly keyspace?: PartRead<InfoReport>;
  readonly clients?: PartRead<readonly ServerClient[]>;
  readonly slowLog?: PartRead<SlowLogEntries>;
  readonly threshold?: PartRead<SlowLogThreshold | undefined>;
  readonly memory?: PartRead<MemoryStats>;
  readonly doctor?: PartRead<string>;
  readonly config?: PartRead<readonly ConfigParameter[]>;
  /** When each part was last read. */
  readonly readAt: Partial<Readonly<Record<ServerPart, number>>>;
  /** When the section was last read: the time of the toolbar, and what the automatic refresh counts from. */
  readonly lastReadAt?: number;
  readonly requests: PartRequests;
  readonly selected: ServerSelection;
  /** The clients being disconnected, by id. */
  readonly disconnecting: readonly string[];
  readonly clearing: boolean;
  /** The error line of an Operation of a section, by section. */
  readonly operationErrors: Partial<Readonly<Record<ServerSection, string>>>;
  readonly largest: LargestState;
}

const tabs = new Map<string, ServerTab>();
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
export function freshServerTab(connection: ConnectionId, choices: ServerChoices, now: number): ServerTab {
  return {
    connection,
    createdAt: now,
    choices,
    readAt: {},
    requests: noRequests,
    selected: {},
    disconnecting: [],
    clearing: false,
    operationErrors: {},
    largest: { run: 0 },
  };
}

/** The state of a tab, when it was shown once. */
export function serverTabOf(tab: string): ServerTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepServerTab(tab: string, state: ServerTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeServerTab(tab: string, change: (state: ServerTab) => ServerTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosedServerTabs(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useServerTab(tab: string | undefined): ServerTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
