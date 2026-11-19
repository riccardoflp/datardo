/**
 * The text of `server_status` (`mcp.deployment-tools`), from `hello`, `buildInfo` and `serverStatus`: the topology,
 * the connections, the operation counters, the network, the memory, the WiredTiger cache, the global lock, the asserts
 * and the transactions. The monitor's readings (`monitor.show`, M30) are not on this branch: this reads the same
 * fields of `serverStatus`.
 */
import { counted } from '../output-limits';
import { listOf, numberIn, recordOf, textIn } from './mongo';
import { shortDuration, sizeText } from './units';

type Entry = Readonly<Record<string, unknown>>;

/** A number of a reply, `?` when absent. */
export function countText(value: unknown): string {
  const number = numberIn(value);
  return number === undefined ? '?' : number.toLocaleString('en-US');
}

/** `25%`, `3.2%` of a whole. */
export function percentText(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : '0%';
}

/** A size of a reply, `?` when absent. */
export function bytesText(value: unknown): string {
  const number = numberIn(value);
  return number === undefined ? '?' : sizeText(number);
}

function memberState(hello: Entry): string {
  if (hello['isWritablePrimary'] === true || hello['ismaster'] === true) {
    return 'PRIMARY';
  }
  if (hello['secondary'] === true) {
    return 'SECONDARY';
  }
  return hello['arbiterOnly'] === true
    ? 'ARBITER'
    : 'neither primary nor secondary (starting up, recovering or removed)';
}

/** The topology: `standalone server`, `member of the replica set rs0, state PRIMARY; primary …`, or a mongos. */
export function topologyText(hello: Entry, status: Entry): string {
  if (hello['msg'] === 'isdbgrid' || status['process'] === 'mongos') {
    return 'mongos (router of a sharded cluster): use sharding_status for the shards';
  }
  const shard = textIn(recordOf(status['sharding'])['configsvrConnectionString']);
  const cluster =
    hello['configsvr'] !== undefined
      ? ', a config server of a sharded cluster'
      : shard === undefined
        ? ''
        : `, a shard of a sharded cluster (config servers ${shard})`;
  const setName = textIn(hello['setName']);
  if (setName === undefined) {
    return `standalone server${cluster}`;
  }
  const delay = numberIn(hello['secondaryDelaySecs']);
  const extra = [
    ...(hello['hidden'] === true ? ['hidden'] : []),
    ...(hello['passive'] === true ? ['passive'] : []),
    ...(delay ? [`delayed ${String(delay)} s`] : []),
  ].join(', ');
  const arbiters = listOf(hello['arbiters']).length;
  return `member of the replica set ${setName}${cluster}, state ${memberState(hello)}${extra === '' ? '' : ` (${extra})`}; primary ${textIn(hello['primary']) ?? 'none'}, ${counted(listOf(hello['hosts']).length, 'electable member')}${arbiters > 0 ? `, ${counted(arbiters, 'arbiter')}` : ''}`;
}

function countersText(counters: Entry): string {
  return ['insert', 'query', 'update', 'delete', 'getmore', 'command']
    .map((key) => `${key} ${(numberIn(counters[key]) ?? 0).toLocaleString('en-US')}`)
    .join(', ');
}

function readersAndWriters(value: unknown): string {
  const entry = recordOf(value);
  return `${countText(entry['total'] ?? 0)} (${countText(entry['readers'] ?? 0)} readers, ${countText(entry['writers'] ?? 0)} writers)`;
}

function cacheLine(status: Entry): readonly string[] {
  const cache = recordOf(recordOf(status['wiredTiger'])['cache']);
  if (Object.keys(cache).length === 0) {
    return [];
  }
  const most = numberIn(cache['maximum bytes configured']) ?? 0;
  const used = numberIn(cache['bytes currently in the cache']) ?? 0;
  const dirty = numberIn(cache['tracked dirty bytes in the cache']) ?? 0;
  return [
    `WiredTiger cache: ${sizeText(used)} used (${percentText(used, most)}), ${sizeText(dirty)} dirty (${percentText(dirty, most)}), of ${sizeText(most)} configured.`,
  ];
}

function transactionsLine(status: Entry): readonly string[] {
  const t = recordOf(status['transactions']);
  if (t['currentOpen'] === undefined && t['totalStarted'] === undefined) {
    return [];
  }
  const prepared = t['currentPrepared'] === undefined ? '' : `, ${countText(t['currentPrepared'])} prepared`;
  return [
    `Transactions: ${countText(t['currentOpen'] ?? 0)} open (${countText(t['currentActive'] ?? 0)} active, ${countText(t['currentInactive'] ?? 0)} inactive${prepared}); since startup ${countText(t['totalStarted'] ?? 0)} started, ${countText(t['totalCommitted'] ?? 0)} committed, ${countText(t['totalAborted'] ?? 0)} aborted.`,
  ];
}

/** The lines of `serverStatus`, after the server and the topology. */
export function statusLines(status: Entry, replicaSet: boolean): readonly string[] {
  const connections = recordOf(status['connections']);
  const network = recordOf(status['network']);
  const memory = recordOf(status['mem']);
  const lock = recordOf(status['globalLock']);
  const asserts = recordOf(status['asserts']);
  const megabytes = (value: unknown): string => sizeText((numberIn(value) ?? 0) * 1024 * 1024);
  return [
    `Connections: ${countText(connections['current'])} current, ${countText(connections['available'])} available${connections['active'] === undefined ? '' : `, ${countText(connections['active'])} active`}${connections['totalCreated'] === undefined ? '' : `, ${countText(connections['totalCreated'])} created since startup`}.`,
    ...(status['opcounters'] === undefined
      ? []
      : [`Operations since startup (opcounters): ${countersText(recordOf(status['opcounters']))}.`]),
    ...(status['opcountersRepl'] === undefined || !replicaSet
      ? []
      : [`Replicated operations applied (opcountersRepl): ${countersText(recordOf(status['opcountersRepl']))}.`]),
    ...(status['network'] === undefined
      ? []
      : [
          `Network since startup: ${bytesText(network['bytesIn'])} in, ${bytesText(network['bytesOut'])} out, ${countText(network['numRequests'])} requests.`,
        ]),
    ...(status['mem'] === undefined
      ? []
      : [`Memory: ${megabytes(memory['resident'])} resident, ${megabytes(memory['virtual'])} virtual.`]),
    ...cacheLine(status),
    ...(status['globalLock'] === undefined
      ? []
      : [
          `Global lock: queued ${readersAndWriters(lock['currentQueue'])}; active clients ${readersAndWriters(lock['activeClients'])}.`,
        ]),
    ...(status['asserts'] === undefined
      ? []
      : [
          `Asserts since startup: ${Object.entries(asserts)
            .map(([key, value]) => `${key} ${countText(value)}`)
            .join(', ')}.`,
        ]),
    ...transactionsLine(status),
  ];
}

/** `Server host:27017 (mongod 8.0.4), up 3 d 2 h, storage engine wiredTiger.` */
export function serverLine(
  hello: Entry,
  status: Entry,
  fallback: { readonly name: string; readonly version?: string },
): string {
  const mongos = hello['msg'] === 'isdbgrid' || status['process'] === 'mongos';
  const host = textIn(status['host']) ?? textIn(hello['me']) ?? fallback.name;
  const version = textIn(status['version']) ?? fallback.version ?? 'unknown version';
  const uptime = numberIn(status['uptime']);
  const engine = textIn(recordOf(status['storageEngine'])['name']);
  return `Server ${host} (${mongos ? 'mongos' : 'mongod'} ${version})${uptime === undefined ? '' : `, up ${shortDuration(uptime)}`}${engine === undefined ? '' : `, storage engine ${engine}`}.`;
}
