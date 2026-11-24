/**
 * The reads of the tree island, started through the bridge and kept in the window's memory of the island: the
 * databases when a connection is connected, what a database holds when it is expanded, the counts once the
 * collections arrived (`tree.count`), the calls of a scan one after the other until its run ends
 * (`tree.scan-namespaces`), **Load more**, a refresh (`tree.refresh`), and the collections the filter needs
 * (`tree.filter`). Every read is a Read feature run by the runner; the window only keeps what it gives.
 */
import { countedCollections, withCounts } from '../../features/tree/count';
import {
  notRefreshed,
  refreshArgs,
  refreshed,
  refreshReads,
  whileRefreshing,
  type RefreshedRead,
  type RefreshScope,
} from '../../features/tree/refresh';
import { loadingMore, nextCall, scanningAfter, scanStopped, type ScanPage } from '../../features/tree/scan-namespaces';
import { databasesToList } from '../../features/tree/show';
import { nodeId, type DatabaseContents, type ScanState, type TreeIsland } from '../../features/tree/types';
import type { IntentResult } from '../../shared/bridge';
import type { Json } from '../../shared/engine-request';
import { featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { changeIsland, treeOf } from './tree-store';

/** Starts a Read of the tree on a connection, from the tree island. */
async function startRead(feature: string, connection: ConnectionId, args: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'connection', connection },
    place: 'tree',
    args,
  });
}

/** The message of a read that ended without a result, or nothing when it was cancelled or connected first. */
function messageOf(result: IntentResult): string | undefined {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : undefined;
}

/** The run of each scan, by connection and database: a newer run (a refresh, **Load more**) stops an older one. */
const scanRuns = new Map<string, number>();

function nextRun(connection: ConnectionId, database: number): number {
  const key = `${connection} ${String(database)}`;
  const run = (scanRuns.get(key) ?? 0) + 1;
  scanRuns.set(key, run);
  return run;
}

function isRunning(connection: ConnectionId, database: number, run: number): boolean {
  return scanRuns.get(`${connection} ${String(database)}`) === run;
}

function withScan(island: TreeIsland, database: number, scan: ScanState): TreeIsland {
  return { ...island, redis: { ...island.redis, scans: { ...island.redis.scans, [String(database)]: scan } } };
}

/** Makes the calls of a scan one after the other until its run ends, it is cancelled or a newer run starts. */
async function continueScan(connection: ConnectionId, database: number, run: number): Promise<void> {
  for (;;) {
    const state = treeOf(connection).island.redis.scans[String(database)];
    const args = state === undefined ? undefined : nextCall(state.scan, connection, database);
    if (state === undefined || args === undefined || !isRunning(connection, database, run)) {
      return;
    }
    const result = await startRead('tree.scan-namespaces', connection, args);
    const now = treeOf(connection).island.redis.scans[String(database)];
    if (!isRunning(connection, database, run) || now === undefined) {
      return;
    }
    if (result.kind !== 'read') {
      changeIsland(connection, (island) => withScan(island, database, scanStopped(now, messageOf(result))));
      return;
    }
    changeIsland(connection, (island) => withScan(island, database, scanningAfter(now, result.result as ScanPage)));
  }
}

/** **Load more**: scans a database further, from the cursor kept, for 10,000 more keys. */
export function loadMoreKeys(connection: ConnectionId, database: number): void {
  const run = nextRun(connection, database);
  changeIsland(connection, (island) =>
    withScan(island, database, loadingMore(island.redis.scans[String(database)], Date.now())),
  );
  void continueScan(connection, database, run);
}

/** Reads the counts of the collections of a database once they arrived (`tree.count`); a failure shows nothing. */
async function countCollections(connection: ConnectionId, database: string, contents: DatabaseContents): Promise<void> {
  const collections = countedCollections(contents);
  if (collections.length === 0) {
    return;
  }
  const result = await startRead('tree.count', connection, { connection, database, collections: [...collections] });
  if (result.kind === 'read') {
    const arrived = result.result as Readonly<Record<string, number>>;
    changeIsland(connection, (island) => ({
      ...island,
      mongodb: { ...island.mongodb, counts: withCounts(island.mongodb.counts, database, arrived) },
    }));
  }
}

/** What follows each read of a refresh: the counts of the collections listed, the next calls of a scan. */
function follow(connection: ConnectionId, results: readonly RefreshedRead[], runs: ReadonlyMap<number, number>): void {
  for (const { read, result } of results) {
    if (result.kind !== 'loaded') {
      continue;
    }
    const args = read.args as Readonly<Record<string, Json>>;
    if (read.read === 'tree.list-collections' && typeof args['database'] === 'string') {
      void countCollections(connection, args['database'], result.value as DatabaseContents);
    }
    if (read.read === 'tree.scan-namespaces' && typeof args['database'] === 'number') {
      void continueScan(connection, args['database'], runs.get(args['database']) ?? 0);
    }
  }
}

/** Whether a refresh also reads a database that is collapsed: the filter needs its collections. */
export type Collapsed = 'skip-collapsed' | 'read-even-collapsed';

/**
 * `tree.refresh`: reads again the whole connection or one database, as the island is now; while it reads, what was
 * shown stays. A connection that is not connected is connected first, which reads the tree anew.
 */
export async function refreshTree(
  state: AppState,
  connection: ConnectionId,
  scope: RefreshScope,
  collapsed: Collapsed = 'skip-collapsed',
): Promise<void> {
  const island = treeOf(connection).island;
  const seen =
    collapsed === 'read-even-collapsed' && scope.kind === 'database'
      ? { ...island, expanded: [...island.expanded, nodeId({ kind: 'database', database: scope.database })] }
      : island;
  const args = refreshArgs(state, seen, connection, scope);
  const reads = refreshReads(args);
  if (reads.length === 0) {
    return;
  }
  const runs = new Map(
    reads.flatMap((read) => {
      const database = (read.args as Readonly<Record<string, Json>>)['database'];
      return read.read === 'tree.scan-namespaces' && typeof database === 'number'
        ? [[database, nextRun(connection, database)] as const]
        : [];
    }),
  );
  changeIsland(connection, (before) => whileRefreshing(before, reads, Date.now()));
  const result = await startRead('tree.refresh', connection, args);
  if (result.kind !== 'read') {
    changeIsland(connection, (before) => notRefreshed(before, reads, messageOf(result)));
    return;
  }
  const results = result.result as readonly RefreshedRead[];
  changeIsland(connection, (before) => refreshed(before, results));
  follow(connection, results, runs);
}

const listing = new Set<ConnectionId>();

/** Lists the collections of every database the filter needs, one database after the other (`tree.filter`). */
export async function listForFilter(state: AppState, connection: ConnectionId): Promise<void> {
  if (listing.has(connection)) {
    return;
  }
  listing.add(connection);
  const tried = new Set<string>();
  try {
    for (;;) {
      const saved = savedConnection(state.connections, connection);
      const database = databasesToList(treeOf(connection).island, saved).find((each) => !tried.has(each));
      if (database === undefined) {
        return;
      }
      tried.add(database);
      await refreshTree(state, connection, { kind: 'database', database }, 'read-even-collapsed');
    }
  } finally {
    listing.delete(connection);
  }
}
