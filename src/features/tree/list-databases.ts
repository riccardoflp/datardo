/**
 * Feature: tree.list-databases
 *
 * Reads the databases of a MongoDB connection with their sizes on disk, sorted by name. A user who may not list the
 * databases gets the database named in the connection string, or `test`, with no size, and no error.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { compareNames, failureOf, isObject, numberOf, textArg, type MongoDatabase } from './types';

/** How long the server may take, in ms (R9.2; Datardo's choice). */
export const listTimeLimitMs = 10_000;

/** The database a connection string names, as the driver reads it: `app` in `mongodb://ada@db1:27017/app?tls=true`. */
export function databaseOfAddress(address: string): string | undefined {
  const rest = address.replace(/^mongodb(\+srv)?:\/\//u, '');
  const slash = rest.indexOf('/');
  if (slash < 0) {
    return undefined;
  }
  const path = rest.slice(slash + 1).split('?')[0] ?? '';
  try {
    const name = decodeURIComponent(path);
    return name === '' ? undefined : name;
  } catch {
    // A path that is not valid percent-encoding is the name as written: the driver would refuse it before this.
    return path;
  }
}

/** The arguments of this read for a saved connection: `{ connection, fallback }`, the database to show when listing is refused. */
export function listDatabasesArgs(state: AppState, connection: ConnectionId): Json {
  const address = savedConnection(state.connections, connection)?.address ?? '';
  return { connection, fallback: databaseOfAddress(address) ?? 'test' };
}

/** `db.adminCommand({ listDatabases: 1, authorizedDatabases: true })`. */
export function listDatabasesRequest(): MongoRequest {
  return {
    engine: 'mongodb',
    database: 'admin',
    method: 'runCommand',
    arguments: [{ listDatabases: { $numberInt: '1' }, authorizedDatabases: true }],
    timeLimitMs: listTimeLimitMs,
  };
}

/** Feature: tree.list-databases — the request, for `args.connection`. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(textArg(args, 'connection')), request: listDatabasesRequest() }],
  };
}

/** The databases of a `listDatabases` reply, sorted by name. */
export function databasesOf(reply: unknown): readonly MongoDatabase[] {
  const list = isObject(reply) ? reply['databases'] : undefined;
  const databases = Array.isArray(list)
    ? list.flatMap((each): MongoDatabase[] => {
        if (!isObject(each) || typeof each['name'] !== 'string') {
          return [];
        }
        const size = numberOf(each['sizeOnDisk']);
        return [size === undefined ? { name: each['name'] } : { name: each['name'], sizeOnDisk: size }];
      })
    : [];
  return [...databases].sort((one, other) => compareNames(one.name, other.name));
}

/**
 * Feature: tree.list-databases — the databases with their `sizeOnDisk`, sorted by name; when the request was refused,
 * the database `args.fallback` (or `test`) alone, with no size.
 */
export function parse(replies: readonly unknown[], args: Json = null): readonly MongoDatabase[] {
  const [reply] = replies;
  if (failureOf(reply) !== undefined || !isObject(reply)) {
    return [{ name: textArg(args, 'fallback', 'test') || 'test' }];
  }
  return databasesOf(reply);
}
