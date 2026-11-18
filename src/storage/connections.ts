/**
 * `connections.json`: the saved connections, with nothing secret (data.md; connection.secrets). A field Datardo does
 * not know is kept and written back, on each connection and at the top of the file.
 */
import type { ConnectionColor, SavedConnection, SshSettings, TlsSettings } from '../shared/connection';
import { connectionColors } from '../shared/connection';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import type { JsonObject, StoredFile } from './store';

/** What `connections.json` holds: the connections, and what Datardo does not know in it. */
export interface ConnectionsFile {
  readonly connections: readonly SavedConnection[];
  /** The fields of each connection that this version does not know, by id. */
  readonly unknown: Readonly<Record<ConnectionId, JsonObject>>;
  /** The fields at the top of the file that this version does not know. */
  readonly rest: JsonObject;
}

/** No connection saved. */
export const noConnections: ConnectionsFile = { connections: [], unknown: {}, rest: {} };

const knownFields = new Set([
  'id',
  'name',
  'engine',
  'hosts',
  'folder',
  'color',
  'readOnly',
  'keepsUndo',
  'tls',
  'ssh',
  'queriesFolder',
  'publishesTo',
  'oplog',
]);

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(object: JsonObject, field: string): string | undefined {
  const value = object[field];
  return typeof value === 'string' ? value : undefined;
}

function required(object: JsonObject, field: string): string {
  const value = text(object, field);
  if (value === undefined) {
    throw new Error(`A connection has no ${field}.`);
  }
  return value;
}

function flag(object: JsonObject, field: string): boolean | undefined {
  const value = object[field];
  return typeof value === 'boolean' ? value : undefined;
}

function tlsOf(value: Json | undefined): TlsSettings | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const caFile = text(value, 'caFile');
  const certificateKeyFile = text(value, 'certificateKeyFile');
  const allowInvalidCertificates = flag(value, 'allowInvalidCertificates');
  const allowInvalidHostnames = flag(value, 'allowInvalidHostnames');
  return {
    ...(caFile === undefined ? {} : { caFile }),
    ...(certificateKeyFile === undefined ? {} : { certificateKeyFile }),
    ...(allowInvalidCertificates === undefined ? {} : { allowInvalidCertificates }),
    ...(allowInvalidHostnames === undefined ? {} : { allowInvalidHostnames }),
  };
}

function sshOf(value: Json | undefined): SshSettings | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const authentication = text(value, 'authentication');
  const port = value['port'];
  const privateKeyFile = text(value, 'privateKeyFile');
  return {
    host: required(value, 'host'),
    port: typeof port === 'number' ? port : 22,
    username: required(value, 'username'),
    authentication: authentication === 'private-key' || authentication === 'agent' ? authentication : 'password',
    ...(privateKeyFile === undefined ? {} : { privateKeyFile }),
  };
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

/** One connection of the file; throws when it has no id, name or engine. */
export function connectionOf(object: JsonObject): SavedConnection {
  const engine = required(object, 'engine');
  if (engine !== 'mongodb' && engine !== 'redis') {
    throw new Error(`A connection has the engine ${engine}.`);
  }
  const color = text(object, 'color');
  return {
    id: required(object, 'id') as ConnectionId,
    name: required(object, 'name'),
    engine,
    hosts: text(object, 'hosts') ?? '',
    readOnly: flag(object, 'readOnly') ?? false,
    keepsUndo: flag(object, 'keepsUndo') ?? true,
    ...optional('folder', text(object, 'folder')),
    ...optional(
      'color',
      connectionColors.find((each): each is ConnectionColor => each === color),
    ),
    ...optional('tls', tlsOf(object['tls'])),
    ...optional('ssh', sshOf(object['ssh'])),
    ...optional('queriesFolder', text(object, 'queriesFolder')),
    ...optional('publishesTo', text(object, 'publishesTo') as ConnectionId | undefined),
    ...optional('oplog', object['oplog']),
  };
}

function unknownOf(object: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([field]) => !knownFields.has(field)));
}

/** A connection as the file writes it, with the fields this version did not know. */
export function connectionJson(connection: SavedConnection, unknown: JsonObject = {}): JsonObject {
  return { ...unknown, ...(connection as JsonObject) };
}

/** The kind of file `connections.json` is. */
export const connectionsFile: StoredFile<ConnectionsFile> = {
  path: 'connections.json',
  holds: 'The connections',
  version: 1,
  migrations: {},
  empty: () => noConnections,
  read: (object) => {
    const list = object['connections'] ?? [];
    if (!Array.isArray(list)) {
      throw new Error('connections is not a list.');
    }
    const objects = (list as readonly Json[]).filter(isObject);
    const connections = objects.map(connectionOf);
    const unknown = Object.fromEntries(connections.map((each, index) => [each.id, unknownOf(objects[index] ?? {})]));
    const rest = Object.fromEntries(
      Object.entries(object).filter(([field]) => field !== 'connections' && field !== 'version'),
    );
    return { connections, unknown, rest };
  },
  write: (value) => ({
    ...value.rest,
    connections: value.connections.map((each) => connectionJson(each, value.unknown[each.id])),
  }),
};

/** The file with the connections changed, keeping what this version does not know of those that stay. */
export function withConnections(file: ConnectionsFile, connections: readonly SavedConnection[]): ConnectionsFile {
  const ids = new Set(connections.map((each) => each.id));
  return {
    connections,
    unknown: Object.fromEntries(Object.entries(file.unknown).filter(([id]) => ids.has(id as ConnectionId))),
    rest: file.rest,
  };
}
