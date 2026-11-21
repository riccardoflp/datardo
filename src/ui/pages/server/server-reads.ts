/**
 * The reads of a Server page tab, started through the bridge as the Read features the runner carries out: `CLIENT ID`
 * once, then the reads of the section shown (`readsOf`), when it is chosen, with **Refresh** and at the automatic
 * refresh. A reply older than the last request of its part is dropped; a read that failed puts its message in the
 * error line of its part. The two Operations of the page, **Disconnect…** and **Clear…**, read their part again once
 * they ran.
 */
import type { ServerClient } from '../../../features/server/read-clients';
import type { ConfigParameter } from '../../../features/server/read-config';
import type { InfoReport } from '../../../features/server/read-info';
import type { MemoryRead } from '../../../features/server/read-memory';
import type { SlowLogRead } from '../../../features/server/read-slow-log';
import {
  isLatestReply,
  isWaiting,
  readsOf,
  replyArrived,
  sendRequest,
  type ReadReason,
  type ServerPart,
} from '../../../features/server/show';
import type { PartRead, ServerSection } from '../../../features/server/types';
import { unavailableSentence } from '../../../features/server/unavailable';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { ReadNeed } from '../../../shared/feature';
import { featureId, type Place } from '../../../shared/ids';
import { changeServerTab, serverTabOf, type ServerTab } from './server-store';

/** Starts a feature of the page on the tab's connection and waits for what it gives. */
export function startOn(state: ServerTab, feature: string, place: Place, args: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'connection', connection: state.connection },
    place,
    args,
  });
}

/** The message of an intent that did not give a result. */
export function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

/** A read that failed, as the error line of its part says it. */
function failedPart(result: IntentResult): PartRead<never> {
  return { kind: 'unavailable', unavailable: unavailableSentence('', messageOf(result) ?? '') };
}

const ownAsks = new Map<string, Promise<void>>();

/** Asks `CLIENT ID` once per tab, to know which row of the Clients section is the page's own. */
export function askOwnClient(tab: string): Promise<void> {
  const asked = ownAsks.get(tab);
  if (asked !== undefined) {
    return asked;
  }
  const state = serverTabOf(tab);
  if (state === undefined) {
    return Promise.resolve();
  }
  const asking = startOn(state, 'server.show:client-id', 'toolbar', { connection: state.connection }).then((result) => {
    const own = result.kind === 'read' && typeof result.result === 'string' ? result.result : undefined;
    if (own !== undefined) {
      changeServerTab(tab, (now) => ({ ...now, own }));
    }
  });
  ownAsks.set(tab, asking);
  return asking;
}

/** Forgets the `CLIENT ID` asked by tabs that are closed. */
export function forgetOwnAsks(open: ReadonlySet<string>): void {
  for (const tab of [...ownAsks.keys()]) {
    if (!open.has(tab)) {
      ownAsks.delete(tab);
    }
  }
}

/** What a reply of a part changes in the tab. */
function withReply(state: ServerTab, part: ServerPart, result: IntentResult): ServerTab {
  const read = result.kind === 'read' ? result.result : undefined;
  if (read === undefined) {
    const failed = failedPart(result);
    const field = part === 'slow-log' ? 'slowLog' : part;
    return { ...state, [field]: failed };
  }
  switch (part) {
    case 'slow-log': {
      const slowLog = read as SlowLogRead;
      return {
        ...state,
        ...(slowLog.entries === undefined ? {} : { slowLog: slowLog.entries }),
        ...(slowLog.threshold === undefined ? {} : { threshold: slowLog.threshold }),
      };
    }
    case 'memory': {
      const memory = read as MemoryRead;
      return { ...state, memory: memory.stats, ...(memory.doctor === undefined ? {} : { doctor: memory.doctor }) };
    }
    case 'clients':
      return { ...state, clients: read as PartRead<readonly ServerClient[]> };
    case 'config':
      return { ...state, config: read as PartRead<readonly ConfigParameter[]> };
    case 'info':
    case 'replication':
    case 'keyspace':
      return { ...state, [part]: read as PartRead<InfoReport> };
  }
}

/** Sends the read of one part and keeps its reply, unless a newer request of the same part was sent meanwhile. */
async function readPart(tab: string, need: ReadNeed): Promise<void> {
  const part = need.key as ServerPart;
  let number = 0;
  changeServerTab(tab, (state) => {
    const sent = sendRequest(state.requests, part);
    number = sent.number;
    return { ...state, requests: sent.requests };
  });
  const state = serverTabOf(tab);
  if (state === undefined) {
    return;
  }
  const result = await startOn(state, need.read, 'toolbar', need.args);
  const readAt = Date.now();
  changeServerTab(tab, (now) => {
    const requests = replyArrived(now.requests, part, number);
    if (!isLatestReply(now.requests, part, number)) {
      return { ...now, requests };
    }
    return { ...withReply(now, part, result), requests, readAt: { ...now.readAt, [part]: readAt } };
  });
}

/** The last result of the main read of each part, for `readsOf`. */
function lastOf(state: ServerTab): Partial<Record<ServerPart, PartRead<unknown>>> {
  return {
    ...(state.info === undefined ? {} : { info: state.info }),
    ...(state.replication === undefined ? {} : { replication: state.replication }),
    ...(state.keyspace === undefined ? {} : { keyspace: state.keyspace }),
    ...(state.clients === undefined ? {} : { clients: state.clients }),
    ...(state.slowLog === undefined ? {} : { 'slow-log': state.slowLog }),
    ...(state.memory === undefined ? {} : { memory: state.memory }),
    ...(state.config === undefined ? {} : { config: state.config }),
  };
}

/**
 * Reads a section: when it is chosen, with **Refresh**, or at the automatic refresh, which sends nothing for a part
 * whose read has not been answered yet.
 */
export async function readSection(tab: string, section: ServerSection, reason: ReadReason): Promise<void> {
  changeServerTab(tab, (now) => ({
    ...now,
    lastReadAt: Date.now(),
    ...(reason === 'chosen' ? { shown: section } : {}),
  }));
  if (section === 'clients') {
    await askOwnClient(tab);
  }
  const state = serverTabOf(tab);
  if (state === undefined) {
    return;
  }
  const own = state.own;
  const needs = readsOf(section, reason, {
    connection: state.connection,
    ...(own === undefined ? {} : { own }),
    last: lastOf(state),
  }).filter((need) => reason !== 'auto' || !isWaiting(state.requests, need.key as ServerPart));
  await Promise.all(needs.map((need) => readPart(tab, need)));
}

/** An error line of an Operation of a section, or none. */
function withOperationError(state: ServerTab, section: ServerSection, error: string | undefined): ServerTab {
  const { [section]: _dropped, ...others } = state.operationErrors;
  return { ...state, operationErrors: error === undefined ? others : { ...others, [section]: error } };
}

/** **Disconnect…** of a client: the Operation, then the clients read again once it ran. */
export async function disconnectClient(tab: string, client: string, args: Json, place: Place): Promise<void> {
  const state = serverTabOf(tab);
  if (state === undefined || state.disconnecting.includes(client)) {
    return;
  }
  changeServerTab(tab, (now) => ({ ...now, disconnecting: [...now.disconnecting, client] }));
  const own = state.own;
  const withOwn = { ...(args as Readonly<Record<string, Json>>), ...(own === undefined ? {} : { own }) };
  const result = await startOn(state, 'server.kill-client', place, withOwn);
  const error = result.kind === 'failed' ? unavailableSentence('CLIENT KILL', result.message).sentence : undefined;
  changeServerTab(tab, (now) => ({
    ...withOperationError(now, 'clients', error),
    disconnecting: now.disconnecting.filter((each) => each !== client),
  }));
  if (result.kind === 'done' || result.kind === 'failed') {
    await readSection(tab, 'clients', 'refresh');
  }
}

/** **Clear…** of the slow log: the Operation, then the slow log read again once it ran. */
export async function clearSlowLog(tab: string): Promise<void> {
  const state = serverTabOf(tab);
  if (state === undefined || state.clearing) {
    return;
  }
  changeServerTab(tab, (now) => ({ ...now, clearing: true }));
  const result = await startOn(state, 'server.slow-log-reset', 'toolbar', null);
  const error = result.kind === 'failed' ? result.message : undefined;
  changeServerTab(tab, (now) => ({ ...withOperationError(now, 'slow-log', error), clearing: false }));
  if (result.kind === 'done') {
    await readSection(tab, 'slow-log', 'refresh');
  }
}
