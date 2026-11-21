/**
 * The Pub/Sub pages of Redis connections in the main process (`pubsub.show`): one page per Pub/Sub tab, made when
 * the tab opens (from what the tab kept, `tab.restore`) and forgotten when it closes, with the page's own client
 * closed. The messages the client receives are added to the page's list at most 10 times a second (`pubsub.keep`);
 * a client lost by itself is opened again after 1, 2, 4, 8 and 16 seconds, then every 30 (`pubsub.reconnect`); a
 * connection the user disconnects leaves its pages **Not connected** until it is connected again.
 *
 * Every change of a page is decided by the functions of `src/features/pubsub` and goes through {@link setPage}, which
 * sends the window only what changed and keeps with the tab what the tab restores.
 */
import type { IntentResult } from '../shared/bridge';
import { featureId, type ConnectionId } from '../shared/ids';
import type { AppEvent, AppState } from '../shared/state';
import { connectionState, savedConnection } from '../shared/state/connections';
import { keptChange, type PageFields } from '../shared/state/pubsub';
import type { Tab } from '../shared/state/tabs';
import { oplogLinkOf } from '../features/pubsub/follow-oplog';
import { messagesAfter } from '../features/pubsub/keep';
import { additionsPerSecond } from '../features/pubsub/messages';
import { disconnectedPage, notConnectedPage, reconnectedPage, retryFailedPage } from '../features/pubsub/reconnect';
import { pageChoices, restoredPage } from '../features/pubsub/show';
import { subscriptionsAfter } from '../features/pubsub/subscriptions';
import { pubsubClient, pubsubOwner, type Arrived, type PubSubPage } from '../features/pubsub/types';
import type { PubSubPush } from '../engines';
import type { RunnerPorts } from '../runner/ports';
import { start as startFeature } from '../runner/start';
import type { AreaStart } from './areas';
import { connectionEngines } from './connections';
import type { MainServices } from './services';

/** What the main process keeps of each page beside the app's state. */
interface Live {
  /** The messages received since the list was last changed. */
  readonly arrived: Extract<Arrived, { kind: 'message' }>[];
  flush: ReturnType<typeof setTimeout> | undefined;
  retry: ReturnType<typeof setTimeout> | undefined;
  /** The page's client is being closed on purpose: its closing is no drop. */
  closing: boolean;
  /** A try of `pubsub.reconnect` is running. */
  trying: boolean;
}

let services: MainServices | undefined;
let runnerPorts: RunnerPorts | undefined;
const lives = new Map<ConnectionId, Live>();

/** The list is changed at most this often, in milliseconds (`pubsub.messages`). */
const flushEveryMs = 1000 / additionsPerSecond;

/** The services of the main process, once the pages started. */
export function need(): MainServices {
  if (services === undefined) {
    throw new Error('The Pub/Sub pages are not started yet.');
  }
  return services;
}

/** Whether the pages started. */
export function pubsubStarted(): boolean {
  return services !== undefined;
}

function liveOf(connection: ConnectionId): Live {
  const known = lives.get(connection);
  if (known !== undefined) {
    return known;
  }
  const live: Live = { arrived: [], flush: undefined, retry: undefined, closing: false, trying: false };
  lives.set(connection, live);
  return live;
}

/** The page of a connection in the app's state, when its tab is open. */
export function pageNow(connection: ConnectionId): PubSubPage | undefined {
  return services?.state.get().pubsubPages[connection];
}

/** The computer's time zone, in minutes east of UTC. */
function offsetNow(): number {
  return -new Date().getTimezoneOffset();
}

function fieldsOf(page: PubSubPage): PageFields {
  const { kept: _kept, ...fields } = page;
  return fields;
}

function sameFields(first: PageFields, second: PageFields): boolean {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  return [...keys].every((key) => (first as Record<string, unknown>)[key] === (second as Record<string, unknown>)[key]);
}

function pubsubTabOf(state: AppState, connection: ConnectionId): Tab | undefined {
  return state.tabs.tabs.find(
    (tab) => tab.shows.kind === 'page' && tab.shows.page === 'pubsub' && tab.shows.connection === connection,
  );
}

/** Keeps with the tab what it restores, when that changed. */
function keepWithTab(page: PubSubPage): void {
  const holder = need().state;
  const tab = pubsubTabOf(holder.get(), page.connection);
  if (tab === undefined) {
    return;
  }
  const choices = pageChoices(page);
  const before = tab.memory?.choices ?? {};
  const same =
    Object.keys(choices).length === Object.keys(before).length &&
    Object.entries(choices).every(([key, value]) => before[key] === value);
  if (!same) {
    holder.dispatch({ slice: 'tabs', type: 'changed', tab: tab.id, memory: { ...tab.memory, choices } });
  }
}

/** Changes the page of a connection: the window is sent only what changed. */
export function setPage(connection: ConnectionId, next: PubSubPage): void {
  const holder = need().state;
  const before = pageNow(connection);
  if (before === undefined) {
    return;
  }
  if (before.kept !== next.kept) {
    holder.dispatch({ slice: 'pubsub', type: 'kept', connection, change: keptChange(before.kept, next.kept) });
  }
  const fields = fieldsOf(next);
  if (!sameFields(fieldsOf(before), fields)) {
    holder.dispatch({ slice: 'pubsub', type: 'changed', connection, page: fields });
  }
  keepWithTab(next);
}

/** Changes the page of a connection, when its tab is open. */
export function changePage(connection: ConnectionId, change: (page: PubSubPage) => PubSubPage): void {
  const page = pageNow(connection);
  if (page !== undefined) {
    setPage(connection, change(page));
  }
}

/** Adds the messages received since the last time to the list, and counts them on their subscriptions. */
export function flushMessages(connection: ConnectionId): void {
  const live = liveOf(connection);
  if (live.flush !== undefined) {
    clearTimeout(live.flush);
    live.flush = undefined;
  }
  const arrived = live.arrived.splice(0);
  if (arrived.length > 0) {
    changePage(connection, (page) => ({
      ...page,
      kept: messagesAfter(page.kept, arrived),
      subscriptions: subscriptionsAfter(page.subscriptions, arrived),
    }));
  }
}

/** A message the page's client received: it joins the list with the next change. */
export function received(connection: ConnectionId, push: PubSubPush): void {
  const live = liveOf(connection);
  live.arrived.push({
    kind: 'message',
    receivedAt: Date.now(),
    channel: push.channel,
    ...(push.pattern === undefined ? {} : { pattern: push.pattern }),
    message: push.message,
  });
  live.flush ??= setTimeout(() => {
    live.flush = undefined;
    flushMessages(connection);
  }, flushEveryMs);
}

/** Closes the page's client on purpose: its closing is no drop. */
export async function closeClient(connection: ConnectionId): Promise<void> {
  const live = liveOf(connection);
  live.closing = true;
  flushMessages(connection);
  await connectionEngines().disconnect(pubsubClient(connection));
}

/** The page's client is being opened: its closing is a drop again. */
export function opening(connection: ConnectionId): void {
  liveOf(connection).closing = false;
}

function stopRetry(connection: ConnectionId): void {
  const live = liveOf(connection);
  if (live.retry !== undefined) {
    clearTimeout(live.retry);
    live.retry = undefined;
  }
}

function isConnected(connection: ConnectionId): boolean {
  return connectionState(need().state.get().connections, connection) === 'connected';
}

function scheduleRetry(connection: ConnectionId): void {
  stopRetry(connection);
  const page = pageNow(connection);
  if (page?.retryAt === undefined || page.pageConnection !== 'disconnected') {
    return;
  }
  liveOf(connection).retry = setTimeout(
    () => {
      liveOf(connection).retry = undefined;
      void subscribeAgain(connection);
    },
    Math.max(0, page.retryAt - Date.now()),
  );
}

/** The result of a try that failed: the next one later, with the error in the banner. */
function tryFailed(connection: ConnectionId, message: string): void {
  changePage(connection, (page) =>
    page.pageConnection === 'connecting' || page.pageConnection === 'disconnected'
      ? retryFailedPage({ ...page, pageConnection: 'disconnected' }, Date.now(), message)
      : page,
  );
  scheduleRetry(connection);
}

function failureOf(result: IntentResult): string | undefined {
  switch (result.kind) {
    case 'done':
    case 'read':
      return undefined;
    case 'cancelled':
      return 'Cancelled.';
    case 'refused':
    case 'failed':
      return result.message;
  }
}

/**
 * Opens the page's client again and subscribes again to every channel and pattern of its list (`pubsub.reconnect`):
 * after a drop, when the saved connection is connected again, for a restored tab, and with **Reconnect now**.
 */
export async function subscribeAgain(connection: ConnectionId): Promise<IntentResult> {
  const live = liveOf(connection);
  const page = pageNow(connection);
  if (runnerPorts === undefined || page === undefined || page.subscriptions.length === 0 || live.trying) {
    return { kind: 'cancelled' };
  }
  stopRetry(connection);
  if (!isConnected(connection)) {
    tryFailed(
      connection,
      `${savedConnection(need().state.get().connections, connection)?.name ?? ''} is not connected.`,
    );
    return { kind: 'cancelled' };
  }
  live.trying = true;
  const result = await startFeature(runnerPorts, {
    feature: featureId('pubsub.reconnect'),
    target: { kind: 'connection', connection },
  });
  live.trying = false;
  const failure = failureOf(result);
  if (failure === undefined && connectionEngines().isConnected(pubsubClient(connection))) {
    changePage(connection, (now) => reconnectedPage(now, Date.now()));
  } else {
    tryFailed(connection, failure ?? 'The Pub/Sub connection closed.');
  }
  return result;
}

/** The page's client was lost by itself: the page says so and tries again (`pubsub.reconnect`). */
function dropped(client: ConnectionId): void {
  const connection = pubsubOwner(client);
  const page = connection === undefined ? undefined : pageNow(connection);
  if (connection === undefined || page === undefined || liveOf(connection).closing) {
    return;
  }
  flushMessages(connection);
  if (page.subscriptions.length === 0) {
    changePage(connection, (now) => ({ ...now, pageConnection: 'closed' }));
    return;
  }
  changePage(connection, (now) => disconnectedPage(now, Date.now()));
  scheduleRetry(connection);
}

function linkOf(state: AppState, eventsOf: string | undefined): ReturnType<typeof oplogLinkOf> {
  const mongo = eventsOf === undefined ? undefined : state.connections.saved.find((each) => each.id === eventsOf);
  return mongo === undefined ? undefined : oplogLinkOf(mongo);
}

/** A Pub/Sub tab was opened, or restored: its page, from what the tab kept, subscribes when it can. */
function opened(connection: ConnectionId, tab: Tab): void {
  const holder = need().state;
  const state = holder.get();
  const choices = tab.memory?.choices ?? {};
  const page = restoredPage(connection, choices, offsetNow(), linkOf(state, choices['eventsOf']));
  const waiting = page.subscriptions.length > 0 && !isConnected(connection);
  holder.dispatch({
    slice: 'pubsub',
    type: 'opened',
    page: waiting ? { ...page, pageConnection: 'not-connected' } : page,
  });
  if (page.subscriptions.length > 0 && isConnected(connection)) {
    void subscribeAgain(connection);
  }
}

/** The Pub/Sub tab was closed: its client closes, and the page is forgotten. */
function closed(connection: ConnectionId): void {
  stopRetry(connection);
  void closeClient(connection).then(() => {
    lives.delete(connection);
  });
  need().state.dispatch({ slice: 'pubsub', type: 'forgotten', connection });
}

/** The saved connection was connected, or left: the page subscribes again, or waits without retrying. */
function connectionChanged(connection: ConnectionId, connected: boolean): void {
  const page = pageNow(connection);
  if (page === undefined) {
    return;
  }
  if (connected) {
    if (page.pageConnection === 'not-connected' || page.pageConnection === 'disconnected') {
      void subscribeAgain(connection);
    }
    return;
  }
  stopRetry(connection);
  void closeClient(connection);
  changePage(connection, (now) =>
    now.subscriptions.length === 0 ? { ...now, pageConnection: 'closed' } : notConnectedPage(now, Date.now()),
  );
}

function pubsubTabs(state: AppState): ReadonlyMap<ConnectionId, Tab> {
  return new Map(
    state.tabs.tabs.flatMap((tab) =>
      tab.shows.kind === 'page' && tab.shows.page === 'pubsub' ? [[tab.shows.connection, tab] as const] : [],
    ),
  );
}

function follow(event: AppEvent, state: AppState, known: Set<ConnectionId>): void {
  if (event.slice === 'tabs') {
    const now = pubsubTabs(state);
    for (const [connection, tab] of now) {
      if (!known.has(connection)) {
        known.add(connection);
        opened(connection, tab);
      }
    }
    for (const connection of [...known]) {
      if (!now.has(connection)) {
        known.delete(connection);
        closed(connection);
      }
    }
  }
  if (event.slice === 'connections' && event.type === 'state' && state.pubsubPages[event.connection] !== undefined) {
    if (event.state === 'connected' || event.state === 'not-connected' || event.state === 'failed') {
      connectionChanged(event.connection, event.state === 'connected');
    }
  }
}

/** The runner's ports, once the bridge answers: the pages subscribe again through them. */
export function pubsubReady(ports: RunnerPorts): void {
  runnerPorts = ports;
  for (const connection of Object.keys(need().state.get().pubsubPages) as ConnectionId[]) {
    const page = pageNow(connection);
    if (page !== undefined && page.subscriptions.length > 0 && isConnected(connection)) {
      void subscribeAgain(connection);
    }
  }
}

/** Makes the pages of the tabs restored, and follows the tabs, the connections and the pages' clients from then on. */
export const start: AreaStart = (given) => {
  services = given;
  const known = new Set<ConnectionId>();
  for (const [connection, tab] of pubsubTabs(given.state.get())) {
    known.add(connection);
    opened(connection, tab);
  }
  given.state.listen((event, state) => {
    follow(event, state, known);
  });
  connectionEngines().onDrop((client) => {
    dropped(client);
  });
  given.onQuit(async () => {
    await Promise.allSettled([...known].map(closeClient));
  });
  return Promise.resolve();
};
