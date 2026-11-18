/**
 * What the unit tests of the connection area build their contexts from: saved connections, their states, a form.
 */
import type { ConnectionForm, ConnectionStateName, ConnectionView } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Context } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import { initialConnectionsState, type ConnectionsState } from '../../../src/shared/state/connections';
import type { Target } from '../../../src/shared/target';

/** A saved MongoDB connection named Local, with its password saved. */
export function mongoConnection(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: connectionId('c-local'),
    name: 'Local',
    engine: 'mongodb',
    hosts: 'db1:27017',
    readOnly: false,
    keepsUndo: true,
    address: 'mongodb://ada@db1:27017/app',
    secrets: { ...noSecretsSaved, connectionString: true, password: true },
    ...overrides,
  };
}

/** A saved Redis connection named Cache local. */
export function redisConnection(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: connectionId('c-cache'),
    name: 'Cache local',
    engine: 'redis',
    hosts: 'cache:6379',
    readOnly: false,
    keepsUndo: true,
    address: 'redis://cache',
    secrets: { ...noSecretsSaved, connectionString: true },
    ...overrides,
  };
}

/** The app's state with these connections, each in the state given (not connected otherwise). */
export function stateWith(
  saved: readonly ConnectionView[],
  states: Readonly<Record<string, ConnectionStateName>> = {},
  keychain = true,
): AppState {
  const connections: ConnectionsState = {
    ...initialConnectionsState,
    loaded: true,
    keychain,
    saved,
    live: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, { state }])),
  };
  return { ...initialState, connections };
}

/** A context of the feature, at a fixed time, on a target. */
export function contextOf(feature: string, state: AppState, target: Target = { kind: 'app' }): Context {
  return { feature: featureId(feature), now: 1_763_400_000_000, platform: 'windows', startedBy: 'user', target, state };
}

/** The target of a connection. */
export function on(connection: ConnectionView): Target {
  return { kind: 'connection', connection: connection.id };
}

/** A form with its defaults for an engine, changed by `overrides`. */
export function formOf(engine: 'mongodb' | 'redis', overrides: Partial<ConnectionForm> = {}): ConnectionForm {
  return {
    engine,
    name: '',
    connectionString: engine === 'mongodb' ? 'mongodb://localhost:27017' : '',
    password: '',
    redisMode: 'fields',
    host: 'localhost',
    port: '6379',
    username: '',
    database: '0',
    folder: '',
    color: '',
    readOnly: false,
    queriesFolder: '',
    tls: {
      on: false,
      caFile: '',
      certificateKeyFile: '',
      keyPassword: '',
      allowInvalidCertificates: false,
      allowInvalidHostnames: false,
    },
    ssh: {
      on: false,
      host: '',
      port: '22',
      username: '',
      authentication: 'password',
      password: '',
      privateKeyFile: '',
      passphrase: '',
    },
    oplog: { on: false, connection: '' },
    ...overrides,
  };
}
