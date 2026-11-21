/**
 * The reads of the parts of the Stats, Replication and Sharding sections, each one or more Reads one after the other
 * through the bridge (`monitor.stats`, `monitor.replication`, `monitor.sharding`):
 *
 * - the server's status, with the time of the read, whose rates and lines `monitor.rates` makes from the last one;
 * - the databases, listed, then their `dbStats` 8 at a time, a batch after the other (`monitor.read-database-stats`);
 * - the collections of the chosen database the same way (`monitor.read-collection-stats`);
 * - `hello`, then on a replica set its members and oplog (`monitor.read-replication`); the oplog's entries;
 * - the cluster step after step (`parts/sharding-reading.ts`), kept with what the last full read found
 *   (`mergeSharding`) when the read is not full; the recent events.
 *
 * Each returns what its reply changes in the tab, which the page applies unless a newer request of the part was sent.
 */
import { failedPart, valueOfPart, type PartRead } from '../../../features/monitor/parts/failure';
import {
  nextShardingRead,
  nothingSharded,
  shardingOf,
  withShardingReply,
  type ShardingProgress,
} from '../../../features/monitor/parts/sharding-reading';
import { emptyHistory, rates } from '../../../features/monitor/rates';
import {
  collectionBatches,
  sortCollections,
  type CollectionStats,
  type CollectionStatsRead,
} from '../../../features/monitor/read-collection-stats';
import {
  databaseBatches,
  type DatabaseStats,
  type DatabaseStatsRead,
} from '../../../features/monitor/read-database-stats';
import type { OplogEntries } from '../../../features/monitor/read-oplog';
import { replicaSetArgs, type ReplicationRead } from '../../../features/monitor/read-replication';
import type { ServerStatus } from '../../../features/monitor/read-server-status';
import type { ShardingEvent } from '../../../features/monitor/read-sharding-events';
import { mergeSharding, type ShardingRead } from '../../../features/monitor/read-sharding';
import type { MonitorPart } from '../../../features/monitor/show';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import type { ReadNeed } from '../../../shared/feature';
import { messageOf, readOf, startOn } from './monitor-start';
import type { MonitorTab } from './monitor-store';

/** What a reply changes in the tab. */
export type PartChange = (state: MonitorTab) => MonitorTab;

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function failedOf<T>(result: IntentResult): PartRead<T> {
  return failedPart({ message: messageOf(result) ?? '' });
}

/** Sends one Read of the part and gives what it read, or `undefined` with the failure. */
async function readOnce(
  state: MonitorTab,
  read: string,
  args: Json,
): Promise<{ value?: unknown; result: IntentResult }> {
  const result = await startOn(state, read, 'toolbar', args);
  const value = readOf(result);
  return value === undefined ? { result } : { value, result };
}

async function serverStatusChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const { value, result } = await readOnce(state, need.read, { ...fieldsOf(need.args), at: Date.now() });
  const server = value === undefined ? failedOf<ServerStatus>(result) : (value as PartRead<ServerStatus>);
  return (now) => {
    const current = valueOfPart(server);
    const previous = valueOfPart(now.stats.server);
    const next =
      current === undefined ? now.stats.rates : rates(previous, current, now.stats.rates?.history ?? emptyHistory);
    return { ...now, stats: { ...now.stats, server, ...(next === undefined ? {} : { rates: next }) } };
  };
}

async function databaseStatsChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const listed = await readOnce(state, need.read, need.args);
  const list = listed.value as DatabaseStatsRead | undefined;
  if (list?.step !== 'list' || list.databases.kind === 'failed') {
    const databases: PartRead<readonly DatabaseStats[]> =
      list?.step === 'list' && list.databases.kind === 'failed' ? list.databases : failedOf(listed.result);
    return (now) => ({ ...now, stats: { ...now.stats, databases } });
  }
  const stats: DatabaseStats[] = [];
  for (const batch of databaseBatches(list.databases.value)) {
    const read = await readOnce(state, need.read, { ...fieldsOf(need.args), step: 'stats', databases: [...batch] });
    const reply = read.value as DatabaseStatsRead | undefined;
    const message = messageOf(read.result) ?? '';
    stats.push(...(reply?.step === 'stats' ? reply.stats : batch.map((name) => ({ name, failure: { message } }))));
  }
  return (now) => ({ ...now, stats: { ...now.stats, databases: { kind: 'read', value: stats } } });
}

async function collectionStatsChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const database = fieldsOf(need.args)['database'];
  const of = typeof database === 'string' ? database : '';
  const listed = await readOnce(state, need.read, need.args);
  const list = listed.value as CollectionStatsRead | undefined;
  if (list?.step !== 'list' || list.collections.kind === 'failed') {
    const collections: PartRead<readonly CollectionStats[]> =
      list?.step === 'list' && list.collections.kind === 'failed' ? list.collections : failedOf(listed.result);
    return (now) => ({ ...now, stats: { ...now.stats, collections, collectionsOf: of } });
  }
  const stats: CollectionStats[] = [];
  for (const batch of collectionBatches(list.collections.value)) {
    const args = { ...fieldsOf(need.args), step: 'stats', collections: batch.map((each) => ({ ...each })) };
    const read = await readOnce(state, need.read, args);
    const reply = read.value as CollectionStatsRead | undefined;
    const message = messageOf(read.result) ?? '';
    stats.push(
      ...(reply?.step === 'stats'
        ? reply.stats
        : batch.map((each) => (each.type === 'view' ? each : { ...each, failure: { message } }))),
    );
  }
  const value = sortCollections(stats);
  return (now) => ({ ...now, stats: { ...now.stats, collections: { kind: 'read', value }, collectionsOf: of } });
}

async function replicationChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const said = await readOnce(state, need.read, need.args);
  const hello = said.value as ReplicationRead | undefined;
  if (hello?.step !== 'hello') {
    return (now) => ({ ...now, replication: { ...now.replication, server: failedOf(said.result) } });
  }
  const args = replicaSetArgs(state.connection, hello);
  const set = args === undefined ? undefined : ((await readOnce(state, need.read, args)).value as ReplicationRead);
  const replicaSet = set?.step === 'replica-set' ? set.replicaSet : undefined;
  return (now) => {
    const { replicaSet: _dropped, ...others } = now.replication;
    return {
      ...now,
      replication: { ...others, server: hello.server, ...(replicaSet === undefined ? {} : { replicaSet }) },
    };
  };
}

async function oplogChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const { value, result } = await readOnce(state, need.read, need.args);
  const oplog = value === undefined ? failedOf<OplogEntries>(result) : (value as PartRead<OplogEntries>);
  return (now) => ({ ...now, replication: { ...now.replication, oplog } });
}

async function shardingChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const full = fieldsOf(need.args)['full'] !== false;
  const input = { connection: state.connection, full, at: Date.now() };
  let progress: ShardingProgress = nothingSharded;
  for (let step = nextShardingRead(input, progress); step !== undefined; step = nextShardingRead(input, progress)) {
    const read = await readOnce(state, need.read, step);
    if (read.value === undefined) {
      const server = failedOf<never>(read.result);
      return (now) => ({ ...now, sharding: { ...now.sharding, server } });
    }
    progress = withShardingReply(progress, read.value as ShardingRead);
  }
  const { server, cluster } = shardingOf(progress);
  return (now) => {
    const { cluster: _dropped, ...others } = now.sharding;
    const merged = cluster === undefined ? undefined : full ? cluster : mergeSharding(now.sharding.cluster, cluster);
    return {
      ...now,
      sharding: {
        ...others,
        ...(server === undefined ? {} : { server }),
        ...(merged === undefined ? {} : { cluster: merged }),
      },
    };
  };
}

async function eventsChange(state: MonitorTab, need: ReadNeed): Promise<PartChange> {
  const { value, result } = await readOnce(state, need.read, need.args);
  const events =
    value === undefined ? failedOf<readonly ShardingEvent[]>(result) : (value as PartRead<readonly ShardingEvent[]>);
  return (now) => ({ ...now, sharding: { ...now.sharding, events } });
}

/** The read of a part of the Stats, Replication or Sharding section, or `undefined` for another part. */
export function sectionPartRead(
  part: MonitorPart,
): ((state: MonitorTab, need: ReadNeed) => Promise<PartChange>) | undefined {
  switch (part) {
    case 'server-status':
      return serverStatusChange;
    case 'database-stats':
      return databaseStatsChange;
    case 'collection-stats':
      return collectionStatsChange;
    case 'replication':
      return replicationChange;
    case 'oplog':
      return oplogChange;
    case 'sharding':
      return shardingChange;
    case 'sharding-events':
      return eventsChange;
    case 'databases':
    case 'operations':
    case 'slow-queries':
      return undefined;
  }
}
