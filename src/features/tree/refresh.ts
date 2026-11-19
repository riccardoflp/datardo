/**
 * Feature: tree.refresh
 *
 * Reads again what the tree shows, for the whole connection or for one database: the databases, and for each
 * database that is expanded what is under it (its collections, or the first keys of its scan from the cursor `0`). A
 * database that is collapsed is not read; the open tabs are not read again. The counts of the collections follow
 * once their list has arrived (`tree.count`), and a scan goes on call after call (`tree.scan-namespaces`).
 */
import type { EngineName, Json } from '../../shared/engine-request';
import { run, noDanger, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState, savedConnection } from '../../shared/state/connections';
import * as listCollections from './list-collections';
import * as listDatabases from './list-databases';
import * as redisDatabases from './redis-databases';
import * as scanNamespaces from './scan-namespaces';
import { argsOf, textArg, type Loadable, type TreeIsland } from './types';

/** What is refreshed: the whole connection, or one database of it. */
export type RefreshScope =
  | { readonly kind: 'connection' }
  | { readonly kind: 'database'; readonly database: string }
  | { readonly kind: 'redis-database'; readonly database: number };

/** One read a refresh makes, as the window could also start it on its own. */
export interface TreeRead {
  readonly read: 'tree.list-databases' | 'tree.list-collections' | 'tree.redis-databases' | 'tree.scan-namespaces';
  readonly args: Json;
}

/** The databases of a MongoDB tree that are expanded, by the identifiers of their nodes. */
function expandedMongo(island: TreeIsland): readonly string[] {
  return island.expanded.flatMap((id) => (id.startsWith('database:') ? [id.slice('database:'.length)] : []));
}

function expandedRedis(island: TreeIsland): readonly number[] {
  return island.expanded.flatMap((id) => {
    const number = id.startsWith('redis-database:') ? Number(id.slice('redis-database:'.length)) : Number.NaN;
    return Number.isInteger(number) ? [number] : [];
  });
}

/** The arguments of a refresh of a connection's tree island: `{ connection, engine, scope, expanded, fallback }`. */
export function refreshArgs(state: AppState, island: TreeIsland, connection: ConnectionId, scope: RefreshScope): Json {
  const engine = savedConnection(state.connections, connection)?.engine ?? 'mongodb';
  const fallback = textArg(listDatabases.listDatabasesArgs(state, connection), 'fallback', 'test');
  const expanded = engine === 'mongodb' ? expandedMongo(island) : expandedRedis(island);
  const inScope = scope.kind === 'connection' ? expanded : expanded.filter((each) => each === scope.database);
  return { connection, engine, scope: scope as unknown as Json, expanded: inScope as Json, fallback };
}

function scopeOf(args: Json): RefreshScope {
  const scope = argsOf(argsOf(args)['scope'] ?? null);
  if (scope['kind'] === 'database' && typeof scope['database'] === 'string') {
    return { kind: 'database', database: scope['database'] };
  }
  if (scope['kind'] === 'redis-database' && typeof scope['database'] === 'number') {
    return { kind: 'redis-database', database: scope['database'] };
  }
  return { kind: 'connection' };
}

function engineOf(args: Json): EngineName {
  return argsOf(args)['engine'] === 'redis' ? 'redis' : 'mongodb';
}

function expandedOf(args: Json): readonly (string | number)[] {
  const value = argsOf(args)['expanded'];
  return Array.isArray(value)
    ? value.filter((each): each is string | number => typeof each === 'string' || typeof each === 'number')
    : [];
}

/** The reads of a refresh, in order: the databases for the whole connection, then each expanded database. */
export function refreshReads(args: Json): readonly TreeRead[] {
  const connection = textArg(args, 'connection');
  const whole = scopeOf(args).kind === 'connection';
  if (engineOf(args) === 'mongodb') {
    const databases: TreeRead = {
      read: 'tree.list-databases',
      args: { connection, fallback: textArg(args, 'fallback', 'test') },
    };
    const under = expandedOf(args).map((database): TreeRead => ({
      read: 'tree.list-collections',
      args: { connection, database },
    }));
    return whole ? [databases, ...under] : under;
  }
  const databases: TreeRead = { read: 'tree.redis-databases', args: { connection } };
  const under = expandedOf(args).map((database): TreeRead => ({
    read: 'tree.scan-namespaces',
    args: { connection, database, cursor: '0' },
  }));
  return whole ? [databases, ...under] : under;
}

const reads: Readonly<Record<TreeRead['read'], Pick<ReadFeature, 'request' | 'parse'>>> = {
  'tree.list-databases': listDatabases,
  'tree.list-collections': listCollections,
  'tree.redis-databases': redisDatabases,
  'tree.scan-namespaces': scanNamespaces,
};

/** How many requests a read sends: every read of the tree sends one, `tree.redis-databases` two. */
function requestCount(read: TreeRead): number {
  return read.read === 'tree.redis-databases' ? redisDatabases.redisDatabasesRequests().length : 1;
}

/**
 * Feature: tree.refresh — the requests of every read of {@link refreshReads}, one after the other. A connection that
 * is not connected is connected first (`connection.connect`), which reads the tree anew.
 */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const connection = connectionId(textArg(args, 'connection'));
  if (connectionState(context.state.connections, connection) !== 'connected') {
    const target = { kind: 'connection', connection } as const;
    return run({
      title: 'Refresh the tree',
      steps: [],
      danger: noDanger,
      undo: { cannot: 'Nothing is changed.' },
      publishes: false,
      after: [{ kind: 'start', feature: featureId('connection.connect'), target, args: { connection } }],
    });
  }
  const requests = refreshReads(args).flatMap((read) => {
    const built = reads[read.read].request(context, read.args);
    return built.kind === 'engine' ? built.requests : [];
  });
  return { kind: 'engine', requests };
}

/** What one read of a refresh gave: its result, or the message of its failure. */
export interface RefreshedRead {
  readonly read: TreeRead;
  readonly result: Loadable<unknown>;
}

/**
 * Feature: tree.refresh — the result of each read, in the order of {@link refreshReads}, from the replies split back
 * by read. A read that failed is a failure with its message; the others are not touched by it.
 */
export function parse(replies: readonly unknown[], args: Json): readonly RefreshedRead[] {
  let at = 0;
  return refreshReads(args).map((read): RefreshedRead => {
    const count = requestCount(read);
    const own = replies.slice(at, at + count);
    at += count;
    try {
      return { read, result: { kind: 'loaded', value: reads[read.read].parse(own, read.args) } };
    } catch (error: unknown) {
      // A read that failed becomes the message shown under its node (`tree.node-states`); the others go on.
      return { read, result: { kind: 'failed', message: error instanceof Error ? error.message : String(error) } };
    }
  });
}
