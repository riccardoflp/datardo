/**
 * What each keys tab keeps in the window alone (`key.show`; architecture, "State": the keys of a scan are not kept in
 * the main process): the pattern field and the last scan, the rows found, what `key.details` read, the sort, the
 * selection and what the inspector island read of the selected key. A tab's state lives until Datardo quits; the
 * pattern and the type are kept with the tab.
 */
import { useSyncExternalStore } from 'react';
import type { InspectRead } from '../../../features/key/inspect';
import type { ScanState } from '../../../features/key/scan';
import { noSelection, type KeySelection } from '../../../features/key/select';
import { startingScan, type LastScan, type ReadDetails, type ShownScan } from '../../../features/key/show';
import type { KeySort } from '../../../features/key/sort';
import type { ConnectionId } from '../../../shared/ids';

/** Where the keys of a tab are. */
export interface KeysWhere {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly namespace?: string;
}

/** What the inspector island read of the one key selected. */
export interface InspectedState {
  readonly key: string;
  readonly read: InspectRead;
  /** Read before the scan started again: still shown, and read again. */
  readonly stale?: boolean;
}

/** What one keys tab keeps. */
export interface KeysTab {
  readonly where: KeysWhere;
  readonly field: string;
  readonly last: LastScan;
  readonly scan?: ScanState;
  /** The scan before, drawn until the new one gives its first page. */
  readonly previous?: ShownScan;
  readonly error?: string;
  readonly details: ReadonlyMap<string, ReadDetails>;
  readonly sizesRefused: boolean;
  readonly sort: KeySort;
  readonly selection: KeySelection;
  /** The run of the scan in progress: a newer one (a refresh, a new pattern) stops an older one. */
  readonly run: number;
  readonly scanning: boolean;
  readonly inspected?: InspectedState;
  /** The refresh of the connection last followed (`state.runner.refreshed.times`). */
  readonly refreshes: number;
}

const tabs = new Map<string, KeysTab>();
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

/** A tab never shown: an empty field for a database, the namespace's pattern for a namespace, **All types**. */
export function freshTab(where: KeysWhere, refreshes: number): KeysTab {
  const last = startingScan(where.namespace);
  return {
    where,
    field: last.typed,
    last,
    details: new Map(),
    sizesRefused: false,
    sort: undefined,
    selection: noSelection,
    run: 0,
    scanning: false,
    refreshes,
  };
}

/** The state of a tab, when it was shown once. */
export function keysTabOf(tab: string): KeysTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepTab(tab: string, state: KeysTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeTab(tab: string, change: (state: KeysTab) => KeysTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosed(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useKeysTab(tab: string | undefined): KeysTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}

/** The database whose keys tab puts the focus in its pattern field when it is shown (**Search** in the rail). */
let focusAsked: { readonly connection: string; readonly database: number; readonly ask: number } | undefined;
let asks = 0;

/** The keys tab of `connection` and `database`, when it is shown, puts the focus in its pattern field. */
export function focusPatternNext(connection: string, database: number): void {
  asks += 1;
  focusAsked = { connection, database, ask: asks };
  changedAll();
}

/** The number of times the focus was asked, drawn again when it changes. */
export function useFocusAsks(): number {
  useSyncExternalStore(subscribe, () => version);
  return asks;
}

/** Whether the pattern field of the keys tab of `where` takes the focus now; each ask is taken once. */
export function takesFocus(where: KeysWhere): boolean {
  const asked = focusAsked;
  if (asked === undefined || asked.connection !== where.connection || asked.database !== where.database) {
    return false;
  }
  focusAsked = undefined;
  return true;
}
