/**
 * The consoles of Redis connections in the main process (`console.show`): the console's own client of each open
 * console tab, what it is in (`console.session`), its output (`console.output`) and its history of commands
 * (`console.history`, kept in `state/<connection id>.json`). It opens the console of each console tab, closes its
 * client with the tab or with the connection, and says in the output when the client was lost.
 *
 * The app steps of the console's plans are carried out in `actions/console.ts`; the command typed and its reply are
 * put in the output in `console-commands.ts`.
 */
import type { Intent, IntentResult } from '../shared/bridge';
import { featureId, type ConnectionId } from '../shared/ids';
import type { AppEvent, AppState } from '../shared/state';
import { connectionState } from '../shared/state/connections';
import type { ConsoleChange, ConsoleState, OutputEntry } from '../shared/state/consoles';
import { savedDatabase } from '../features/console/connect';
import { openedSession, reopenedSession } from '../features/console/session';
import { text } from '../features/console/text';
import { consoleClient, consoleOwner, type CommandArguments, type Protocol } from '../features/console/types';
import type { RunnerPorts } from '../runner/ports';
import { start as startFeature } from '../runner/start';
import { consoleHistoryIn, withConsoleHistory } from '../storage/connection-state';
import type { AreaStart } from './areas';
import { stateStoreOf } from './connection-state';
import { connectionEngines } from './connections';
import type { MainServices } from './services';

/** A line of `console.run` about to be started: the line typed, its arguments, and how the output writes it. */
export interface Pending {
  readonly line: string;
  readonly command: CommandArguments;
  readonly shown: string;
}

/** What the main process keeps of each console beside the app's state. */
export interface Live {
  /** The line `console.run` was started with, until its step goes to the console's client. */
  pending: Pending | undefined;
  /** The protocol `HELLO` or `AUTH` left the console's client in, while it opens. */
  protocol: Protocol;
  /** The console's client is being closed by `console.stop`: the command it waited for was stopped. */
  stopping: boolean;
  /** The console's client is being closed on purpose: its closing is no drop. */
  closing: boolean;
}

let services: MainServices | undefined;
let runnerPorts: RunnerPorts | undefined;
const lives = new Map<ConnectionId, Live>();
let nextEntry = 1;

/** The id of a new entry of an output. */
export function newEntryId(): number {
  return nextEntry++;
}

/** Whether the consoles started: before, the window cannot have a console. */
export function consolesStarted(): boolean {
  return services !== undefined;
}

/** The services of the main process, once the consoles started. */
export function need(): MainServices {
  if (services === undefined) {
    throw new Error('The consoles are not started yet.');
  }
  return services;
}

/** What the main process keeps of the console of a connection. */
export function liveOf(connection: ConnectionId): Live {
  const known = lives.get(connection);
  if (known !== undefined) {
    return known;
  }
  const live: Live = { pending: undefined, protocol: 3, stopping: false, closing: false };
  lives.set(connection, live);
  return live;
}

/** The console of a connection in the app's state, when its tab is open. */
export function consoleNow(connection: ConnectionId): ConsoleState | undefined {
  return services?.state.get().consoles[connection];
}

/** Changes the console of a connection in the app's state. */
export function change(connection: ConnectionId, consoleChange: ConsoleChange): void {
  need().state.dispatch({ slice: 'consoles', type: 'changed', connection, change: consoleChange });
}

/** Adds an entry to the output of a console, or replaces the one of the same id. */
export function addEntry(connection: ConnectionId, entry: OutputEntry): void {
  need().state.dispatch({ slice: 'consoles', type: 'entry', connection, entry });
}

/** A line of notes that follows no command: the connection closed, or was opened again. */
function notesEntry(console: ConsoleState, notes: readonly string[], failure?: string): OutputEntry {
  return {
    id: nextEntry++,
    prompt: '',
    line: '',
    sentAt: Date.now(),
    protocol: console.session.protocol,
    notes,
    ...(failure === undefined ? {} : { failure }),
  };
}

/** Closes the console's client on purpose: no line *The console's connection closed.* follows. */
export async function closeClient(connection: ConnectionId): Promise<void> {
  liveOf(connection).closing = true;
  await connectionEngines().disconnect(consoleClient(connection));
}

/** Writes the history of a connection's console to its file. */
export async function saveHistory(connection: ConnectionId, history: readonly string[]): Promise<void> {
  const store = await stateStoreOf(need(), connection);
  store.set(withConsoleHistory(store.get(), history));
}

/** The console's client opened, or did not: the console is ready, with the notes of a connection opened again. */
export function afterConnect(connection: ConnectionId, result: IntentResult): void {
  const console = consoleNow(connection);
  if (console === undefined) {
    return;
  }
  if (result.kind !== 'done') {
    change(connection, { status: 'closed', running: null });
    const failure = result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
    if (failure !== undefined) {
      addEntry(connection, notesEntry(console, [], failure));
    }
    return;
  }
  const protocol = liveOf(connection).protocol;
  if (console.opened === 0) {
    change(connection, {
      status: 'ready',
      running: null,
      session: openedSession(console.session.database, protocol),
      opened: 1,
    });
    return;
  }
  const reopened = reopenedSession(console.session, protocol);
  change(connection, { status: 'ready', running: null, session: reopened.session, opened: console.opened + 1 });
  addEntry(connection, notesEntry({ ...console, session: reopened.session }, reopened.notes));
}

function connectIntent(connection: ConnectionId): Intent {
  return { feature: featureId('console.connect'), target: { kind: 'connection', connection } };
}

/** Opens the console's client with the plan of `console.connect`, once the runner is there. */
export async function connectConsole(connection: ConnectionId): Promise<IntentResult> {
  const ports = runnerPorts;
  if (ports === undefined) {
    return { kind: 'cancelled' };
  }
  change(connection, { status: 'connecting' });
  const result = await startFeature(ports, connectIntent(connection));
  afterConnect(connection, result);
  return result;
}

/** Whether the connection is connected. */
export function isConnected(state: AppState, connection: ConnectionId): boolean {
  return connectionState(state.connections, connection) === 'connected';
}

/** Waits until the console's client is no longer being opened. */
export function untilOpened(connection: ConnectionId): Promise<void> {
  const holder = need().state;
  return new Promise((resolve) => {
    const done = (): boolean => consoleNow(connection)?.status !== 'connecting';
    if (done()) {
      resolve();
      return;
    }
    const stop = holder.listen(() => {
      if (done()) {
        stop();
        resolve();
      }
    });
  });
}

/** The runner's ports, once the bridge answers: the consoles open their clients through them. */
export function consolesReady(ports: RunnerPorts): void {
  runnerPorts = ports;
  for (const connection of Object.keys(need().state.get().consoles) as ConnectionId[]) {
    openIfConnected(connection);
  }
}

/** The connections whose console tab is open. */
function consoleTabs(state: AppState): ReadonlySet<ConnectionId> {
  return new Set(state.tabs.tabs.flatMap((tab) => (tab.shows.kind === 'console' ? [tab.shows.connection] : [])));
}

function openIfConnected(connection: ConnectionId): void {
  const state = need().state.get();
  const console = state.consoles[connection];
  if (runnerPorts !== undefined && console?.status === 'closed' && isConnected(state, connection)) {
    void connectConsole(connection);
  }
}

/** A console tab was opened: the console starts on the connection's database, with the history of its file. */
async function opened(connection: ConnectionId): Promise<void> {
  const holder = need().state;
  const saved = holder.get().connections.saved.find((each) => each.id === connection);
  holder.dispatch({
    slice: 'consoles',
    type: 'opened',
    console: {
      connection,
      status: 'closed',
      session: openedSession(saved === undefined ? 0 : savedDatabase(saved), 3),
      opened: 0,
      entries: [],
      history: [],
    },
  });
  const store = await stateStoreOf(need(), connection);
  if (consoleNow(connection) !== undefined) {
    change(connection, { history: consoleHistoryIn(store.get()) });
  }
  openIfConnected(connection);
}

/** The console tab was closed: its client closes, and the console is forgotten. */
function closed(connection: ConnectionId): void {
  void closeClient(connection);
  lives.delete(connection);
  need().state.dispatch({ slice: 'consoles', type: 'forgotten', connection });
}

/** The connection was disconnected or lost: the console's client closes too, and the tab keeps its output. */
function connectionLeft(connection: ConnectionId): void {
  const console = consoleNow(connection);
  if (console === undefined || console.status === 'closed') {
    return;
  }
  void closeClient(connection);
  change(connection, { status: 'closed', running: null });
}

function follow(event: AppEvent, state: AppState, known: Set<ConnectionId>): void {
  if (event.slice === 'tabs') {
    const now = consoleTabs(state);
    for (const connection of now) {
      if (!known.has(connection)) {
        known.add(connection);
        void opened(connection);
      }
    }
    for (const connection of [...known]) {
      if (!now.has(connection)) {
        known.delete(connection);
        closed(connection);
      }
    }
  }
  if (event.slice === 'connections' && event.type === 'state' && state.consoles[event.connection] !== undefined) {
    if (event.state === 'connected') {
      openIfConnected(event.connection);
    } else {
      connectionLeft(event.connection);
    }
  }
}

/** The console's client was lost by itself: the output says so, and the next command opens it again. */
function dropped(client: ConnectionId): void {
  const connection = consoleOwner(client);
  const console = connection === undefined ? undefined : consoleNow(connection);
  if (connection === undefined || console === undefined) {
    return;
  }
  const live = liveOf(connection);
  if (live.closing) {
    return;
  }
  change(connection, { status: 'closed', running: null });
  addEntry(connection, notesEntry(console, [text.session.closed]));
}

/** Opens the consoles of the tabs restored, and follows the tabs and the connections from then on. */
export const start: AreaStart = async (given) => {
  services = given;
  const known = new Set<ConnectionId>();
  for (const connection of consoleTabs(given.state.get())) {
    known.add(connection);
    await opened(connection);
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
};
