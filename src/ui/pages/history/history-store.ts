/**
 * What a document history page keeps in the window, one for each tab (`history.show`): the writes of all the reads
 * made so far, the document as it is now, Datardo's own writes around them, where the reads stopped, the message of
 * the last restore and the write selected. The reads go through the bridge (`history.read-writes`, which the main
 * process makes window after window); the versions are rebuilt here from all the writes (`history.versions`), and
 * matched with the undo history (`history.own-writes`). A newer read wins over an older one.
 */
import { useSyncExternalStore } from 'react';
import { text as documentText } from '../../../features/document/text';
import { oneLineText } from '../../../features/document/write/values';
import { ownWrites, type RecordedOperation } from '../../../features/history/own-writes';
import type { OplogPoint } from '../../../features/history/oplog-window';
import type { HistoryRead, ReadStop } from '../../../features/history/read-writes';
import { historyPage, type HistoryOf, type HistoryStatus } from '../../../features/history/show';
import { localDateTime } from '../../../features/history/time/time-text';
import {
  writeKey,
  type DocumentHistory,
  type DocumentVersion,
  type DocumentWrite,
  type JsonObject,
} from '../../../features/history/types';
import { writeTime } from '../../../features/history/version-detail';
import { documentHistory } from '../../../features/history/versions';
import type { Json } from '../../../shared/engine-request';
import { connectionId, featureId } from '../../../shared/ids';
import type { TabShows } from '../../../shared/state/tabs';

/** The page of one tab. */
export interface HistoryTab {
  readonly of: HistoryOf;
  readonly status: HistoryStatus;
  readonly oplog?: { readonly first?: OplogPoint; readonly last?: OplogPoint };
  readonly writes: readonly DocumentWrite[];
  readonly recorded: readonly RecordedOperation[];
  readonly read?: { readonly stop: ReadStop; readonly writes: number; readonly durationMs: number };
  /** The document as it is now; `null` when it no longer exists. */
  readonly current: JsonObject | null;
  readonly history?: DocumentHistory;
  readonly own: Readonly<Record<string, string>>;
  readonly restoreMessage?: string;
  readonly selected?: string;
  /** The number of the read in flight: an older one that answers late is dropped. */
  readonly reading: number;
}

const tabs = new Map<string, HistoryTab>();
const listeners = new Set<() => void>();
let readings = 0;
let version = 0;

function told(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function changed(tab: string, next: HistoryTab): void {
  tabs.set(tab, next);
  told();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The page of a tab, drawn again whenever it changes. */
export function useHistoryTab(tab: string): HistoryTab | undefined {
  return useSyncExternalStore(subscribe, () => tabs.get(tab));
}

/** Draws again whenever a page changes: for what the pages add to the active tab (`nav.inspector`). */
export function useHistoryChanges(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** The page of a tab, as it is now. */
export function historyTabOf(tab: string): HistoryTab | undefined {
  return tabs.get(tab);
}

/** The time zone of the window, in minutes east of UTC. */
export function offsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/** The document a history tab shows: its connection, collection and `_id`; `undefined` for any other tab. */
export function historyOfShows(shows: TabShows): HistoryOf | undefined {
  if (shows.kind !== 'page' || shows.page !== historyPage || shows.database === undefined) {
    return undefined;
  }
  const [collection, idJson] = shows.of ?? [];
  if (collection === undefined || idJson === undefined) {
    return undefined;
  }
  try {
    const id = JSON.parse(idJson) as Json;
    return { connection: shows.connection, database: shows.database, collection, id, idText: oneLineText(id) };
  } catch {
    return undefined;
  }
}

/** The page as it starts: loading, with nothing read. */
function newTab(of: HistoryOf): HistoryTab {
  return {
    of,
    status: { kind: 'loading', older: false },
    writes: [],
    recorded: [],
    current: null,
    own: {},
    reading: 0,
  };
}

/** The writes with those added, each once, newest first. */
function joined(writes: readonly DocumentWrite[], added: readonly DocumentWrite[]): readonly DocumentWrite[] {
  const keys = new Set(writes.map(writeKey));
  return [...writes, ...added.filter((write) => !keys.has(writeKey(write)))];
}

function joinedRecorded(
  recorded: readonly RecordedOperation[],
  added: readonly RecordedOperation[],
): readonly RecordedOperation[] {
  const keyOf = (operation: RecordedOperation): string => `${operation.title}\u0000${String(operation.time)}`;
  const keys = new Set(recorded.map(keyOf));
  return [...recorded, ...added.filter((operation) => !keys.has(keyOf(operation)))];
}

/** The page after a read that answered. */
function afterRead(page: HistoryTab, read: Extract<HistoryRead, { kind: 'read' }>, older: boolean): HistoryTab {
  const writes = older ? joined(page.writes, read.writes) : read.writes;
  const recorded = older ? joinedRecorded(page.recorded, read.recorded) : read.recorded;
  const history = documentHistory(writes, read.current ?? undefined);
  const before = older ? page.read : undefined;
  const { restoreMessage: _message, ...rest } = page;
  return {
    ...(older ? page : rest),
    status: { kind: 'loaded' },
    oplog: read.oplog,
    writes,
    recorded,
    read: {
      stop: read.stop,
      writes: writes.length,
      durationMs: (before?.durationMs ?? 0) + read.durationMs,
    },
    current: read.current,
    history,
    own: Object.fromEntries(ownWrites(history.versions, recorded)),
  };
}

const oplogCodes = new Set([
  'history.oplog-window/standalone',
  'history.oplog-window/sharded',
  'history.oplog-window/view',
  'history.oplog-window/not-authorized',
]);

/**
 * Reads the history of a tab's document: again from the newest write, or (`older`) the part of the oplog before where
 * the reads stopped (**Load older**).
 */
export async function readHistory(tab: string, of: HistoryOf, older = false): Promise<void> {
  const page = tabs.get(tab) ?? newTab(of);
  readings += 1;
  const reading = readings;
  const back = older ? page.read?.stop.readBackTo : undefined;
  changed(tab, { ...page, of, status: { kind: 'loading', older: older && page.history !== undefined }, reading });
  const result = await window.datardo.start({
    feature: featureId('history.read-writes'),
    target: { kind: 'collection', connection: of.connection, database: of.database, collection: of.collection },
    place: older ? 'list' : 'toolbar',
    args: {
      connection: of.connection,
      database: of.database,
      collection: of.collection,
      id: of.id,
      ...(back === undefined ? {} : { readBackTo: { t: back.t, i: back.i } }),
    },
  });
  const now = tabs.get(tab);
  if (now === undefined || now.reading !== reading) {
    return;
  }
  if (result.kind === 'read') {
    const read = result.result as HistoryRead;
    if (read.kind === 'read') {
      changed(tab, afterRead(now, read, older));
    } else {
      const kind = read.kind === 'refused' && oplogCodes.has(read.code) ? 'no-oplog' : 'error';
      changed(tab, { ...now, status: { kind, message: read.message } });
    }
  } else if (result.kind === 'failed' || result.kind === 'refused') {
    changed(tab, { ...now, status: { kind: 'error', message: result.message } });
  } else {
    changed(tab, { ...now, status: now.history === undefined ? { kind: 'error', message: '' } : { kind: 'loaded' } });
  }
}

/** Selects a write of the list, by the key of its version. */
export function selectWrite(tab: string, key: string): void {
  const page = tabs.get(tab);
  if (page !== undefined && page.selected !== key) {
    changed(tab, { ...page, selected: key });
  }
}

/** The versions newest first, as the list shows them. */
export function newestFirst(page: HistoryTab): readonly DocumentVersion[] {
  return [...(page.history?.versions ?? [])].reverse();
}

/** The version a control of the page names by its key. */
export function versionOf(page: HistoryTab, key: string): DocumentVersion | undefined {
  return page.history?.versions.find((version) => version.key === key);
}

/** Restores a version (`document.restore-version`), after its confirmation; the page then says what it did. */
export async function restoreVersion(tab: string, key: string): Promise<void> {
  const page = tabs.get(tab);
  const version = page === undefined ? undefined : versionOf(page, key);
  if (page === undefined || version?.document === undefined) {
    return;
  }
  const { of } = page;
  const at = localDateTime(writeTime(version), offsetMinutes());
  const existed = page.current !== null;
  const result = await window.datardo.start({
    feature: featureId('document.restore-version'),
    target: {
      kind: 'collection',
      connection: connectionId(of.connection),
      database: of.database,
      collection: of.collection,
    },
    place: 'list',
    args: { id: of.id, version: version.document, at, exact: version.state === 'exact' },
  });
  const now = tabs.get(tab);
  if (now === undefined) {
    return;
  }
  const shown = oneLineText(of.id);
  if (result.kind === 'done') {
    const message = existed ? documentText.restore.restored(shown, at) : documentText.restore.inserted(shown, at);
    changed(tab, { ...now, restoreMessage: message });
    await readHistory(tab, of);
    const read = tabs.get(tab);
    if (read !== undefined) {
      changed(tab, { ...read, restoreMessage: message });
    }
  } else if (result.kind === 'failed') {
    changed(tab, { ...now, restoreMessage: documentText.restore.failed(result.message) });
  }
}

/** Forgets the page of a tab that is closed. */
export function forgetHistoryTab(tab: string): void {
  if (tabs.delete(tab)) {
    told();
  }
}
