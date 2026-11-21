/**
 * The app action `monitor.sharding` the tool `sharding_status` asks (`mcp.deployment-tools`): the reads of the
 * Sharding section through a mongos, one after the other as the section sends them on **Refresh** (a full read,
 * `parts/sharding-reading.ts › nextShardingRead`), then the recent events (`monitor.read-sharding-events`), each started
 * by `read` as the MCP server starts a feature, and the reply the tool writes (`sharding-reply.ts`). Every read only
 * reads: the balancer is never started or stopped. The MCP area gives the runner (`mcp/index.ts`).
 */
import { shardingReply } from '../features/mcp/tool/sharding-reply';
import type { ShardingReply } from '../features/mcp/tool/sharding';
import type { PartRead } from '../features/monitor/parts/failure';
import {
  nextShardingRead,
  nothingSharded,
  shardingOf,
  withShardingReply,
  type ShardingProgress,
} from '../features/monitor/parts/sharding-reading';
import type { ShardingEvent } from '../features/monitor/read-sharding-events';
import type { ShardingRead } from '../features/monitor/read-sharding';
import type { IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import { connectionId, featureId, type ConnectionId } from '../shared/ids';

/** Starts a Read of the Monitor page on a connection, as the MCP server starts a feature. */
export type StartMonitorRead = (feature: string, args: Json, connection: ConnectionId) => Promise<IntentResult>;

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(args: Json): Fields {
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
}

function resultOf(result: IntentResult): unknown {
  if (result.kind !== 'read') {
    throw new Error(result.kind === 'failed' || result.kind === 'refused' ? result.message : 'nothing was read');
  }
  return result.result;
}

/** `monitor.sharding` `{ connection, events }`: the cluster read in full through a mongos, and its recent events. */
export async function shardingForTool(args: Json, read: StartMonitorRead): Promise<ShardingReply> {
  const fields = fieldsOf(args);
  const named = fields['connection'];
  if (typeof named !== 'string' || named === '') {
    throw new Error('monitor.sharding needs { connection }.');
  }
  const connection = connectionId(named);
  const most = typeof fields['events'] === 'number' ? fields['events'] : 20;
  const input = { connection, full: true, at: Date.now() };
  let progress: ShardingProgress = nothingSharded;
  for (let step = nextShardingRead(input, progress); step !== undefined; step = nextShardingRead(input, progress)) {
    progress = withShardingReply(
      progress,
      resultOf(await read(featureId('monitor.read-sharding'), step, connection)) as ShardingRead,
    );
  }
  const { server, cluster } = shardingOf(progress);
  if (server?.kind === 'failed') {
    throw new Error(server.failure.message);
  }
  if (cluster === undefined) {
    throw new Error('the server is not a mongos');
  }
  const events =
    most === 0
      ? undefined
      : (resultOf(
          await read(featureId('monitor.read-sharding-events'), { connection, text: '', show: 'balancer' }, connection),
        ) as PartRead<readonly ShardingEvent[]>);
  return shardingReply(cluster, events, most);
}
