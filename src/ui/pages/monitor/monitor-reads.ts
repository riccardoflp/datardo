/**
 * The reads of a Monitor page tab, started through the bridge as the Read features the runner carries out: the
 * databases of the **Database** lists once, then the reads of the section shown (`readsOf`), when it is chosen, with
 * **Refresh** and at the automatic refresh; the parts of the Stats, Replication and Sharding sections read in several
 * steps (`monitor-section-reads.ts`). A reply older than the last request of its part is dropped; a read that failed
 * puts its message in the error line of its part. The Operations of the page (**Kill…**, **Apply**, **Clear…**,
 * **Create index…**, **Step down…**, the balancer's buttons) read their section again once they ran.
 */
import { firstDatabase } from '../../../features/monitor/slow-queries';
import { failedPart, type PartRead } from '../../../features/monitor/parts/failure';
import type { DatabaseStatsRead } from '../../../features/monitor/read-database-stats';
import type { ServerOperation } from '../../../features/monitor/read-operations';
import { slowQueriesArgs, type SlowQueriesRead } from '../../../features/monitor/read-slow-queries';
import { isLatestReply, readsOf, sendRequest, type MonitorPart, type ReadReason } from '../../../features/monitor/show';
import type { MonitorSection } from '../../../features/monitor/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { ReadNeed } from '../../../shared/feature';
import type { Place } from '../../../shared/ids';
import { sectionPartRead, type PartChange } from './monitor-section-reads';
import { messageOf, startOn } from './monitor-start';
import { changeMonitorTab, monitorTabOf, type MonitorTab } from './monitor-store';

function failedRead<T>(result: IntentResult): PartRead<T> {
  return failedPart({ message: messageOf(result) ?? '' });
}

/** What a reply of a part changes in the tab. */
function withReply(state: MonitorTab, part: MonitorPart, result: IntentResult): MonitorTab {
  const read = result.kind === 'read' ? result.result : undefined;
  switch (part) {
    case 'databases': {
      const list = read as DatabaseStatsRead | undefined;
      return { ...state, databases: list?.step === 'list' ? list.databases : failedRead(result) };
    }
    case 'operations':
      return {
        ...state,
        operations: read === undefined ? failedRead(result) : (read as PartRead<readonly ServerOperation[]>),
      };
    case 'slow-queries': {
      const slow: SlowQueriesRead =
        read === undefined ? { source: state.choices.source, profiler: failedRead(result) } : (read as SlowQueriesRead);
      return { ...state, slow };
    }
    case 'server-status':
    case 'database-stats':
    case 'collection-stats':
    case 'replication':
    case 'oplog':
    case 'sharding':
    case 'sharding-events':
      // These parts are read in steps by `sectionPartRead`, which keeps their replies itself.
      return state;
  }
}

/** Sends the read of a part, in one step or several, and gives what its reply changes in the tab. */
async function changeOf(state: MonitorTab, part: MonitorPart, need: ReadNeed): Promise<PartChange> {
  const read = sectionPartRead(part);
  if (read !== undefined) {
    return read(state, need);
  }
  const result = await startOn(state, need.read, 'toolbar', need.args);
  return (now) => withReply(now, part, result);
}

/** Sends the read of one part and keeps its reply, unless a newer request of the same part was sent meanwhile. */
async function readPart(tab: string, need: ReadNeed): Promise<void> {
  const part = need.key as MonitorPart;
  let number = 0;
  changeMonitorTab(tab, (state) => {
    const sent = sendRequest(state.requests, part);
    number = sent.number;
    return {
      ...state,
      requests: sent.requests,
      loading: [...state.loading.filter((each) => each !== part), part],
      ...(part === 'slow-queries' ? { slowArgs: need.args } : {}),
    };
  });
  const state = monitorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const change = await changeOf(state, part, need);
  const readAt = Date.now();
  changeMonitorTab(tab, (now) => {
    if (!isLatestReply(now.requests, part, number)) {
      return now;
    }
    const loading = now.loading.filter((each) => each !== part);
    return { ...change(now), loading, readAt: { ...now.readAt, [part]: readAt } };
  });
}

/** The databases of the **Database** lists, once read; none while they are not. */
export function databasesOf(state: MonitorTab): readonly string[] {
  return state.databases?.kind === 'read' ? [...state.databases.value].sort() : [];
}

/** The database the Slow queries section reads: the one chosen, else the first for the profiler. */
export function slowDatabaseOf(state: MonitorTab): string | undefined {
  return state.choices.database ?? firstDatabase(state.choices.source, databasesOf(state));
}

/** The arguments of the reads of the sections, from the choices of the tab. */
function readsInput(state: MonitorTab): Parameters<typeof readsOf>[2] {
  const { choices } = state;
  const database = slowDatabaseOf(state);
  return {
    connection: state.connection,
    operations: choices.idle ? { idle: true } : {},
    slowQueries: slowQueriesArgs({
      connection: state.connection,
      source: choices.source,
      ...(database === undefined ? {} : { database }),
      sinceMinutes: choices.since,
      now: Date.now(),
    }),
    ...(choices.statsDatabase === undefined ? {} : { statsDatabase: choices.statsDatabase }),
    oplog: { text: choices.oplogText, operation: choices.oplogOperation, last: choices.oplogLast },
    events: { text: choices.eventsText, show: choices.eventsScope },
  };
}

/**
 * Reads a section: when it is chosen, with **Refresh**, or at the automatic refresh. The databases are read first
 * when the page has none yet, since the Slow queries section reads the first of them.
 */
export async function readSection(tab: string, section: MonitorSection, reason: ReadReason): Promise<void> {
  const before = monitorTabOf(tab);
  if (before === undefined) {
    return;
  }
  changeMonitorTab(tab, (now) => ({
    ...now,
    lastReadAt: Date.now(),
    ...(reason === 'chosen' || reason === 'opened' ? { shown: section } : {}),
  }));
  const opening = before.databases === undefined;
  if (opening) {
    const [databases] = readsOf(section, 'opened', readsInput(before));
    if (databases !== undefined) {
      await readPart(tab, databases);
    }
  }
  const state = monitorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const needs = readsOf(section, reason === 'opened' ? 'chosen' : reason, readsInput(state)).filter(
    (need) => reason !== 'auto' || !state.loading.includes(need.key as MonitorPart),
  );
  await Promise.all(needs.map((need) => readPart(tab, need)));
}

/** An error line of an Operation of a section, or none. */
function withOperationError(state: MonitorTab, section: MonitorSection, error: string | undefined): MonitorTab {
  const { [section]: _dropped, ...others } = state.operationErrors;
  return { ...state, operationErrors: error === undefined ? others : { ...others, [section]: error } };
}

/** **Kill…** of an operation: the Operation, then the operations read again once it ran or failed. */
export async function killOperation(tab: string, opid: number | string, args: Json, place: Place): Promise<void> {
  const state = monitorTabOf(tab);
  if (state === undefined || state.killing.includes(opid)) {
    return;
  }
  changeMonitorTab(tab, (now) => ({ ...now, killing: [...now.killing, opid] }));
  const result = await startOn(state, 'monitor.kill-operation', place, args);
  const error = result.kind === 'failed' ? result.message : undefined;
  changeMonitorTab(tab, (now) => ({
    ...withOperationError(now, 'operations', error),
    killing: now.killing.filter((each) => each !== opid),
  }));
  if (result.kind === 'done' || result.kind === 'failed') {
    await readSection(tab, 'operations', 'refresh');
  }
}

/**
 * An Operation of the Slow queries section (**Apply**, **Clear…**, **Create index…**): the Operation, then the slow
 * operations read again once it ran; its failure is the section's error line.
 */
export async function runSlowOperation(tab: string, feature: string, args: Json, place: Place): Promise<void> {
  const state = monitorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const result = await startOn(state, feature, place, args);
  const error = result.kind === 'failed' ? result.message : undefined;
  changeMonitorTab(tab, (now) => ({
    ...withOperationError(now, 'slow-queries', error),
    ...(result.kind === 'done' ? { drafts: {} } : {}),
  }));
  if (result.kind === 'done' || result.kind === 'failed') {
    await readSection(tab, 'slow-queries', 'refresh');
  }
}

/**
 * Reads one part of a section again, as **Refresh** would read it: the collections of the database chosen in the
 * Stats section, the oplog after a change of its filter, the events after a change of theirs.
 */
export async function readPartOf(tab: string, section: MonitorSection, part: MonitorPart): Promise<void> {
  const state = monitorTabOf(tab);
  if (state === undefined) {
    return;
  }
  const need = readsOf(section, 'refresh', readsInput(state)).find((each) => each.key === part);
  if (need !== undefined) {
    await readPart(tab, need);
  }
}

/** The tab with what an Operation of a section said once it ran, and its error line, each in place of the last. */
export function withOperationOutcome(
  state: MonitorTab,
  section: MonitorSection,
  outcome: { readonly notice?: string; readonly error?: string },
): MonitorTab {
  const { [section]: _dropped, ...others } = state.notices;
  return {
    ...withOperationError(state, section, outcome.error),
    notices: outcome.notice === undefined ? others : { ...others, [section]: outcome.notice },
  };
}
