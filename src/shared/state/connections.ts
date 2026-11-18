/**
 * The part of the app's state about connections: the saved ones, without secrets, and what each is doing now (its
 * state, its server, its latency). The cards of the connection area (M6) say what it holds. No secret is ever here: the
 * state is sent to the window (R14.3).
 */
import type { ConnectionStateName, ConnectionView, ServerInfo } from '../connection';
import type { ConnectionId } from '../ids';

/** What a connection is doing now. */
export interface LiveConnection {
  readonly state: ConnectionStateName;
  /** Why it failed, or why it is reconnecting: the error without secrets. */
  readonly reason?: string;
  /** What the server is, once connected. */
  readonly server?: ServerInfo;
  /** The round trip of the last ping, for the current connection only (`nav.ping`). */
  readonly latencyMs?: number;
}

/** The saved connections and what each is doing. */
export interface ConnectionsState {
  /** Whether the connections were read from the data folder. */
  readonly loaded: boolean;
  /** In the order they were saved. */
  readonly saved: readonly ConnectionView[];
  /** By connection; a connection that is not here is not connected. */
  readonly live: Readonly<Record<string, LiveConnection>>;
  /** Whether the secrets are written in the secret storage; false when the system has no keychain (D26). */
  readonly keychain: boolean;
  /** Changes to the saved connections are not saved: the file is of a newer version (data.md, "Versions"). */
  readonly readOnlyFile: boolean;
}

/** The events of this part of the state. */
export type ConnectionsEvent =
  | {
      readonly slice: 'connections';
      readonly type: 'loaded';
      readonly saved: readonly ConnectionView[];
      readonly keychain: boolean;
      readonly readOnlyFile: boolean;
    }
  | { readonly slice: 'connections'; readonly type: 'saved'; readonly connection: ConnectionView }
  | { readonly slice: 'connections'; readonly type: 'removed'; readonly connection: ConnectionId }
  | {
      readonly slice: 'connections';
      readonly type: 'state';
      readonly connection: ConnectionId;
      readonly state: ConnectionStateName;
      readonly reason?: string;
      readonly server?: ServerInfo;
    }
  | { readonly slice: 'connections'; readonly type: 'latency'; readonly connection: ConnectionId; readonly ms: number };

/** Nothing read yet. */
export const initialConnectionsState: ConnectionsState = {
  loaded: false,
  saved: [],
  live: {},
  keychain: true,
  readOnlyFile: false,
};

/** Changes this part of the state. */
export function reduceConnections(state: ConnectionsState, event: ConnectionsEvent): ConnectionsState {
  switch (event.type) {
    case 'loaded':
      return { ...state, loaded: true, saved: event.saved, keychain: event.keychain, readOnlyFile: event.readOnlyFile };
    case 'saved':
      return { ...state, saved: withSaved(state.saved, event.connection) };
    case 'removed': {
      const { [event.connection]: _gone, ...live } = state.live;
      return { ...state, saved: state.saved.filter((each) => each.id !== event.connection), live };
    }
    case 'state':
      return { ...state, live: { ...state.live, [event.connection]: liveAfter(state.live[event.connection], event) } };
    case 'latency': {
      const live = state.live[event.connection];
      return live?.state === 'connected'
        ? { ...state, live: { ...state.live, [event.connection]: { ...live, latencyMs: event.ms } } }
        : state;
    }
  }
}

function withSaved(saved: readonly ConnectionView[], connection: ConnectionView): readonly ConnectionView[] {
  return saved.some((each) => each.id === connection.id)
    ? saved.map((each) => (each.id === connection.id ? connection : each))
    : [...saved, connection];
}

function liveAfter(
  before: LiveConnection | undefined,
  event: Extract<ConnectionsEvent, { type: 'state' }>,
): LiveConnection {
  const server =
    event.server ?? (event.state === 'connected' || event.state === 'reconnecting' ? before?.server : undefined);
  return {
    state: event.state,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    ...(server === undefined ? {} : { server }),
  };
}

/** A saved connection by its id. */
export function savedConnection(state: ConnectionsState, connection: ConnectionId): ConnectionView | undefined {
  return state.saved.find((each) => each.id === connection);
}

/** The state of a connection: **not connected** when nothing is known of it. */
export function connectionState(state: ConnectionsState, connection: ConnectionId): ConnectionStateName {
  return state.live[connection]?.state ?? 'not-connected';
}
