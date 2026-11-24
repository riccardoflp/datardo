/**
 * Feature: mcp.deployment-tools
 *
 * Read the state of the MongoDB deployment rather than its data: the server's status (`server_status`), the sizes of
 * the databases and collections (`database_stats`), the replica set and its oplog (`replica_set_status`), and the
 * sharded cluster (`sharding_status`). They write nothing and change no setting: they never step down a primary and
 * never start or stop the balancer. They show hosts and replica set names, never a connection string.
 */
import type { Context } from '../../shared/feature';
import { intArg, stringArg, toolConnection } from './arguments';
import { counted } from './output-limits';
import { mcpSettings } from './read-data';
import { deploymentOf, notAuthorized } from './tool/deployment';
import { listOf, mongoCall, mongoCommand, numberIn, recordOf, textIn, type MongoPlace } from './tool/mongo';
import { replyOrProblem, ToolProblem, type ToolSession } from './tool/program';
import { helloMemberLines, memberLines, oplogLine, settingsLine } from './tool/replica';
import { bytesText, countText, serverLine, statusLines, topologyText } from './tool/server-status';
import { shardingText, type ShardingReply } from './tool/sharding';
import { connectionProp, endOf, groupOf, integerProp } from './tool/schemas';
import { isFailed, type ToolCall, type ToolEnd, type ToolStep } from './types';

/** The app action the main process answers on a mongos with the reads of the Sharding section (`monitor.sharding`). */
export const shardingAction = 'monitor.sharding';

/** The server's message without the command it quotes, and the role it needs when it is a missing privilege. */
export function failureText(reply: unknown, role: string): string {
  const message = isFailed(reply) ? reply.message : String(reply);
  return `${message.replace(/ to execute command \{[\s\S]*$/u, '')}${notAuthorized(reply) ? ` (needs ${role})` : ''}`;
}

function serverStatus(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const deployment = deploymentOf(session, connection);
  const [reply] = session.send([
    mongoCommand({ connection: connection.id, database: 'admin' }, { serverStatus: 1, repl: 0, metrics: 0, locks: 0 }),
  ]);
  const status = isFailed(reply) ? {} : recordOf(reply);
  const lines = [
    serverLine(deployment.hello, status, {
      name: connection.name,
      ...(deployment.version === undefined ? {} : { version: deployment.version }),
    }),
    `Topology: ${topologyText(deployment.hello, status)}.`,
    ...(isFailed(reply) ? [] : statusLines(status, deployment.kind === 'replica-set')),
    ...(isFailed(reply)
      ? [
          `Note: serverStatus could not be read: ${failureText(reply, 'the clusterMonitor role')}. Only what hello and buildInfo tell is shown.`,
        ]
      : []),
  ];
  return lines.join('\n');
}

interface DatabaseSizes {
  readonly name: string;
  readonly stats: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

function onDisk(sizes: DatabaseSizes): number {
  return (numberIn(sizes.stats['storageSize']) ?? 0) + (numberIn(sizes.stats['indexSize']) ?? 0);
}

function databaseLine(sizes: DatabaseSizes): string {
  if (sizes.error !== undefined) {
    return `- ${sizes.name}: could not be read: ${sizes.error}`;
  }
  const s = sizes.stats;
  const views = numberIn(s['views']) ?? 0;
  const indexes = numberIn(s['indexes']) ?? 0;
  return `- ${sizes.name}: ${counted(numberIn(s['collections']) ?? 0, 'collection')}${views > 0 ? `, ${counted(views, 'view')}` : ''}, ${counted(numberIn(s['objects']) ?? 0, 'document')}, data ${bytesText(s['dataSize'])}, storage ${bytesText(s['storageSize'])}, ${countText(indexes)} ${indexes === 1 ? 'index' : 'indexes'} ${bytesText(s['indexSize'])}`;
}

function collectionLines(session: ToolSession, place: MongoPlace, limit: number): readonly string[] {
  const [listed] = session.send([mongoCall(place, 'listCollections', [{}, {}])]);
  const entries = listOf(replyOrProblem(listed)).map(recordOf);
  const names = entries.map((each) => textIn(each['name']) ?? '').filter((name) => !name.startsWith('system.'));
  const views = entries
    .filter((each) => each['type'] === 'view')
    .map((each) => String(each['name']))
    .sort();
  const collections = names.filter((name) => !views.includes(name));
  const replies = session.send(
    collections.map((name) =>
      mongoCall({ ...place, collection: name }, 'aggregate', [[{ $collStats: { storageStats: {} } }], {}]),
    ),
  );
  const read = collections.map((name, index) => {
    const reply = replies[index];
    return isFailed(reply)
      ? {
          name,
          error: failureText(reply, 'the collStats privilege, e.g. the dbAdmin or clusterMonitor role'),
          size: -1,
          storage: {},
        }
      : { name, storage: recordOf(recordOf(listOf(reply)[0])['storageStats']), size: 0 };
  });
  const sized = read
    .map((each) => ('error' in each ? each : { ...each, size: numberIn(each.storage['size']) ?? 0 }))
    .sort((one, other) => other.size - one.size || one.name.localeCompare(other.name));
  if (sized.length === 0 && views.length === 0) {
    return [`${place.database} has no collections.`];
  }
  return [
    `Collections of ${place.database} (${String(sized.length)}), largest data first${sized.length > limit ? `; the first ${String(limit)}` : ''}:`,
    ...sized.slice(0, limit).map((each) => {
      if ('error' in each) {
        return `- ${each.name}: could not be read: ${each.error}`;
      }
      const s = each.storage;
      const indexes = numberIn(s['nindexes']);
      return `- ${each.name}${s['capped'] === true ? ' (capped)' : ''}: ${counted(numberIn(s['count']) ?? 0, 'document')}, data ${bytesText(s['size'])}, storage ${bytesText(s['storageSize'])}, ${indexes === undefined ? '?' : String(indexes)} ${indexes === 1 ? 'index' : 'indexes'} ${bytesText(s['totalIndexSize'])}`;
    }),
    ...(views.length === 0 ? [] : [`Views (${String(views.length)}): ${views.join(', ')}`]),
  ];
}

function databaseStats(session: ToolSession): string {
  const database = stringArg(session.args, 'database');
  const limit = intArg(session.args, 'limit', [50, 1, 1000]);
  const connection = toolConnection(session, 'mongodb');
  const admin = { connection: connection.id, database: 'admin' };
  const [listed] = session.send([mongoCommand(admin, { listDatabases: 1, nameOnly: true })]);
  const names = listOf(recordOf(replyOrProblem(listed, 'listDatabases failed: '))['databases']).map(
    (each) => textIn(recordOf(each)['name']) ?? '',
  );
  if (database !== undefined && !names.includes(database)) {
    throw new ToolProblem(`The database ${database} doesn't exist on ${connection.name}: use list_databases.`);
  }
  const chosen = database === undefined ? names : [database];
  const replies = session.send(
    chosen.map((name) => mongoCommand({ connection: connection.id, database: name }, { dbStats: 1 })),
  );
  const sizes = chosen
    .map((name, index): DatabaseSizes => {
      const reply = replies[index];
      return isFailed(reply)
        ? {
            name,
            stats: {},
            error: failureText(reply, 'the dbStats privilege on the database, e.g. the dbAdmin or clusterMonitor role'),
          }
        : { name, stats: recordOf(reply) };
    })
    .sort((one, other) => onDisk(other) - onDisk(one));
  const shown = sizes.slice(0, limit);
  const sum = (key: string): number => sizes.reduce((total, each) => total + (numberIn(each.stats[key]) ?? 0), 0);
  const lines = [
    ...(database === undefined
      ? [
          `${counted(sizes.length, 'database')} on ${connection.name}, largest on disk (storage + indexes) first${sizes.length > limit ? `; the first ${String(limit)}, ${String(sizes.length - limit)} more are not listed` : ''}:`,
        ]
      : []),
    ...shown.map(databaseLine),
    ...(database === undefined && sizes.length > 1
      ? [
          `Total: ${sum('objects').toLocaleString('en-US')} documents, data ${bytesText(sum('dataSize'))}, storage ${bytesText(sum('storageSize'))}, indexes ${bytesText(sum('indexSize'))}.`,
        ]
      : []),
  ];
  if (database !== undefined) {
    lines.push('', ...collectionLines(session, { connection: connection.id, database }, limit));
  }
  return lines.join('\n');
}

function replicaSetStatus(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const deployment = deploymentOf(session, connection);
  const me = textIn(deployment.hello['me']) ?? connection.name;
  if (deployment.kind === 'mongos') {
    return `${connection.name} is a mongos (a sharded cluster's router), not a replica set member: use sharding_status for the shards, or connect to a shard's replica set to see its members.`;
  }
  if (deployment.kind === 'standalone') {
    return `${me} is a standalone server, not a replica set member: there are no members, no replication and no oplog.`;
  }
  const admin = { connection: connection.id, database: 'admin' };
  const oplog: MongoPlace = { connection: connection.id, database: 'local', collection: 'oplog.rs' };
  const ends = { projection: { ts: 1, wall: 1 } };
  const [status, config, stats, first, last] = session.send([
    mongoCommand(admin, { replSetGetStatus: 1 }),
    mongoCommand(admin, { replSetGetConfig: 1 }),
    mongoCall(oplog, 'aggregate', [[{ $collStats: { storageStats: {} } }], {}]),
    mongoCall(oplog, 'find', [{}, { ...ends, sort: { $natural: 1 } }], 1),
    mongoCall(oplog, 'find', [{}, { ...ends, sort: { $natural: -1 } }], 1),
  ]);
  const configured = isFailed(config) ? undefined : recordOf(recordOf(config)['config']);
  const term = isFailed(status) ? undefined : numberIn(recordOf(status)['term']);
  const members = isFailed(status) ? helloMemberLines(deployment.hello) : memberLines(recordOf(status), configured);
  const oplogFailed = [stats, first, last].find(isFailed);
  const notes = [
    ...(isFailed(status)
      ? [
          `replSetGetStatus: ${failureText(status, 'the clusterMonitor role')}. Members are from hello alone: only names and which one is the primary, without health, lag or heartbeats.`,
        ]
      : []),
    ...(isFailed(config) && !isFailed(status)
      ? [
          `replSetGetConfig: ${failureText(config, 'the clusterMonitor role')}: priority, votes, hidden, delay and tags are missing.`,
        ]
      : []),
  ];
  return [
    `Replica set ${deployment.setName ?? '?'}${term === undefined ? '' : `, term ${String(term)}`}, connected to ${me}. Primary: ${textIn(deployment.hello['primary']) ?? 'none (no primary: writes fail until one is elected)'}.`,
    '',
    `Members (${String(members.length)}):`,
    ...members,
    ...settingsLine(configured),
    '',
    oplogFailed === undefined
      ? oplogLine(stats, first, last)
      : `Oplog: could not be read: ${failureText(oplogFailed, 'read access to the local database')}.`,
    ...notes.map((note) => `Note: ${note}`),
  ].join('\n');
}

function shardingStatus(session: ToolSession): string {
  const events = intArg(session.args, 'events', [20, 0, 100]);
  const connection = toolConnection(session, 'mongodb');
  const deployment = deploymentOf(session, connection);
  const me = textIn(deployment.hello['me']) ?? connection.name;
  if (deployment.kind === 'standalone') {
    return `${me} is a standalone server: it is not a sharded cluster.`;
  }
  if (deployment.kind === 'replica-set') {
    return deployment.hello['configsvr'] === undefined
      ? `${me} is a replica set member, not a mongos: it is not a sharded cluster (use replica_set_status).`
      : `${me} is a config server of a sharded cluster, not a mongos: connect to a mongos to see the shards, the sharded collections and the balancer.`;
  }
  const reply = session.app(shardingAction, { connection: connection.id, events });
  const readData = mcpSettings(session.context.state.settings).readData;
  if (isFailed(reply) && !readData) {
    // The server's text of what it could not read may quote shard key values: only what failed is said.
    throw new ToolProblem(
      'The sharded cluster could not be read: its text is left out because datardo.mcp.readData is off.',
    );
  }
  return shardingText(
    recordOf(replyOrProblem(reply, 'The sharded cluster could not be read: ')) as unknown as ShardingReply,
    readData,
  );
}

const connectionOnly = { connection: connectionProp };

/** The tools of this group. */
export const group = groupOf('mcp.deployment-tools', [
  {
    name: 'server_status',
    title: 'Server status',
    description:
      'The state of the server a connection points to: host, mongod or mongos and version, uptime, storage engine, topology, connections, operation counters, network, memory, WiredTiger cache, global lock queues, asserts and transactions.',
    properties: connectionOnly,
    required: ['connection'],
    run: serverStatus,
  },
  {
    name: 'database_stats',
    title: 'Database statistics',
    description:
      'Every database (or the one given) largest on disk first, with collections, views, documents, data, storage and index sizes and a total; with database, also its collections, largest data first, and its views.',
    properties: {
      connection: connectionProp,
      database: {
        type: 'string',
        description: 'One database (also lists its collections); every database when omitted.',
      },
      limit: integerProp(1, 1000, 50, 'Databases, or collections of the database, listed.'),
    },
    required: ['connection'],
    run: databaseStats,
  },
  {
    name: 'replica_set_status',
    title: 'Replica set status',
    description:
      'The replica set of a connection: its name, term, primary, every member (state, health, uptime, last applied, lag, heartbeat, ping, sync source, priority, votes, hidden, arbiter, delay, tags), the settings and the oplog window and size. On a standalone server or a mongos it says so.',
    properties: connectionOnly,
    required: ['connection'],
    run: replicaSetStatus,
  },
  {
    name: 'sharding_status',
    title: 'Sharding status',
    description:
      'On a mongos: the balancer, migrations of the last 24 hours, shards, sharded collections with their key, chunks, data per shard and balance, and the recent changelog events, failures first. On another server it says what it is. Never starts or stops the balancer.',
    properties: {
      connection: connectionProp,
      events: integerProp(0, 100, 20, 'Recent changelog and balancer events listed.'),
    },
    required: ['connection'],
    run: shardingStatus,
  },
]);

/** Feature: mcp.deployment-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.deployment-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
