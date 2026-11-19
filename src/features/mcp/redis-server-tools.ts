/**
 * Feature: mcp.redis-server-tools
 *
 * The state of a Redis server, for when the problem is the server rather than the keys: its information
 * (`redis_server_info`), its slow log (`redis_slow_log`), its clients (`redis_clients`) and its memory
 * (`redis_memory`). They send only `INFO`, `SLOWLOG GET`, `SLOWLOG LEN`, `CONFIG GET slowlog-log-slower-than`, `CLIENT
 * LIST`, `MEMORY STATS` and `MEMORY DOCTOR`, with the readings of the Server page (`server.show`, `server.slow-log`):
 * the passwords of a slow command are masked before anything is written, and with `datardo.mcp.readData` off every
 * argument of a slow command is `?`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Context } from '../../shared/feature';
import { groupThousands } from '../../shared/text-units';
import { clientsOf } from '../server/read-clients';
import { infoField, infoNumber, infoReport, sectionFields, type InfoReport } from '../server/read-info';
import { memoryStats, statNumber } from '../server/read-memory';
import { entryOf } from '../server/read-slow-log';
import { durationText, thresholdTime } from '../server/slow-log';
import { numberOfReply, pairsOf } from '../server/types';
import { intArg, oneOfArg, toolConnection } from './arguments';
import { clippedLine, counted } from './output-limits';
import { commandShape, mcpSettings } from './read-data';
import { utcText } from './tool/mongo';
import { replyOrProblem, type ToolSession } from './tool/program';
import { redisCall, redisReply, replyText } from './tool/redis';
import { connectionProp, endOf, groupOf, integerProp, namesProp } from './tool/schemas';
import { shortDuration, sizeText } from './tool/units';
import { isFailed, type ToolCall, type ToolEnd, type ToolStep } from './types';

/** The sections `redis_server_info` gives as the server writes them. */
export const infoSections = [
  'server',
  'clients',
  'memory',
  'persistence',
  'stats',
  'replication',
  'cpu',
  'keyspace',
] as const;

function sendTo(session: ToolSession, connection: ConnectionView, words: readonly (readonly string[])[]) {
  return session.send(words.map((each) => redisCall(connection.id, 0, each)));
}

function checked(reply: unknown, connection: ConnectionView): unknown {
  return redisReply(reply, { connectionName: connection.name, database: 0 });
}

/** `Keys: db0 12,345 (1,200 with an expiry); db1 3.`, or `Keys: none.` */
export function keysLine(report: InfoReport): string {
  const databases = report.databases.filter((each) => (each.keys ?? 0) > 0);
  if (databases.length === 0) {
    return 'Keys: none.';
  }
  const each = databases.map((database) => {
    const expires = database.expires ?? 0;
    return `${database.name} ${groupThousands(database.keys ?? 0)}${expires > 0 ? ` (${groupThousands(expires)} with an expiry)` : ''}`;
  });
  return `Keys: ${each.join('; ')}.`;
}

function memoryLimit(report: InfoReport): string {
  const limit = infoNumber(report, 'maxmemory') ?? 0;
  const policy = infoField(report, 'maxmemory_policy');
  return limit === 0 ? 'Limit: none.' : `Limit: ${sizeText(limit)}, policy ${policy ?? 'unknown'}.`;
}

function summary(connection: ConnectionView, report: InfoReport): string {
  const field = (name: string): string => infoField(report, name) ?? 'unknown';
  const number = (name: string): string => groupThousands(infoNumber(report, name) ?? 0);
  const product = infoField(report, 'valkey_version') === undefined ? 'Redis' : 'Valkey';
  const version = infoField(report, 'valkey_version') ?? field('redis_version');
  const replicas = report.replicas.map((each) => `${each.ip ?? '?'}:${each.port ?? '?'} ${each.state ?? ''}`.trim());
  return [
    `${connection.name}: ${product} ${version}, ${field('redis_mode')}, role ${field('role')}, up ${shortDuration(infoNumber(report, 'uptime_in_seconds') ?? 0)}.`,
    `Clients: ${number('connected_clients')} connected, ${number('blocked_clients')} blocked.`,
    `Memory: ${sizeText(infoNumber(report, 'used_memory') ?? 0)} used. ${memoryLimit(report)}`,
    `Operations: ${number('instantaneous_ops_per_sec')} per second; hits ${number('keyspace_hits')}, misses ${number('keyspace_misses')}.`,
    `Persistence: RDB last save ${field('rdb_last_bgsave_status')}, AOF ${infoField(report, 'aof_enabled') === '1' ? 'on' : 'off'}.`,
    `Replicas: ${replicas.length === 0 ? 'none' : replicas.join(', ')}.`,
    keysLine(report),
  ].join('\n');
}

function serverInfo(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const section = oneOfArg(session.args, 'section', infoSections);
  const [reply] = sendTo(session, connection, [section === undefined ? ['INFO'] : ['INFO', section]]);
  const report = infoReport(replyText(checked(reply, connection)));
  if (section === undefined) {
    return summary(connection, report);
  }
  const fields = report.sections.flatMap((each) => sectionFields(report, each.name));
  return fields.length === 0
    ? `${connection.name} gave no lines for the section ${section}.`
    : fields.map(([name, value]) => `${name}: ${value}`).join('\n');
}

function thresholdText(reply: unknown): string {
  const value = isFailed(reply) ? undefined : pairsOf(reply).find(([name]) => name === 'slowlog-log-slower-than')?.[1];
  const microseconds = numberOfReply(value);
  if (microseconds === undefined) {
    return "(threshold unknown: the server doesn't allow CONFIG GET)";
  }
  if (microseconds < 0) {
    return '(the slow log is off)';
  }
  return microseconds === 0
    ? '(every command is logged)'
    : `(commands slower than ${thresholdTime(microseconds)} are logged)`;
}

function slowLog(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const limit = intArg(session.args, 'limit', [20, 1, 128]);
  const [entries, length, threshold] = sendTo(session, connection, [
    ['SLOWLOG', 'GET', String(limit)],
    ['SLOWLOG', 'LEN'],
    ['CONFIG', 'GET', 'slowlog-log-slower-than'],
  ]);
  const read = (Array.isArray(checked(entries, connection)) ? (entries as unknown[]) : []).flatMap(
    (each) => entryOf(each) ?? [],
  );
  if (read.length === 0) {
    return `The slow log of ${connection.name} is empty.`;
  }
  const readData = mcpSettings(session.context.state.settings).readData;
  const total = Number(replyText(checked(length, connection)));
  const lines = read.map((entry) => {
    const words = entry.arguments.map((word) => new TextDecoder().decode(word));
    const command = clippedLine(readData ? entry.command : commandShape(words));
    const client =
      entry.client === undefined ? '' : ` · ${entry.client}${entry.clientName ? ` "${entry.clientName}"` : ''}`;
    return `- #${String(entry.id)} · ${utcText(entry.time * 1000)} · ${durationText(entry.microseconds).replace(/(\.\d)\d+ ms$/u, '$1 ms')} · ${command}${client}`;
  });
  const of = Number.isFinite(total) ? ` of ${groupThousands(total)}` : '';
  return [
    `Slow log of ${connection.name}: ${String(read.length)}${of} entries, newest first ${thresholdText(threshold)}.`,
    '',
    ...lines,
  ].join('\n');
}

function clients(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const limit = intArg(session.args, 'limit', [50, 1, 500]);
  const [reply] = sendTo(session, connection, [['CLIENT', 'LIST']]);
  const all = [...clientsOf(replyText(checked(reply, connection)))].sort(
    (one, other) => (one.idleSeconds ?? 0) - (other.idleSeconds ?? 0),
  );
  const shown = all.slice(0, limit);
  const head =
    all.length > limit
      ? `${connection.name}: the ${String(limit)} least idle of ${groupThousands(all.length)} clients.`
      : `${connection.name}: ${counted(all.length, 'client')}.`;
  const lines = shown.map((client) =>
    [
      `- id ${client.id}`,
      client.address ?? '?',
      ...(client.name ? [`"${client.name}"`] : []),
      `db${String(client.database ?? 0)}`,
      `age ${shortDuration(client.ageSeconds ?? 0)}`,
      `idle ${shortDuration(client.idleSeconds ?? 0)}`,
      ...(client.command === undefined ? [] : [`last command ${client.command}`]),
      ...(client.user === undefined ? [] : [`user ${client.user}`]),
      ...(client.libraryName === undefined ? [] : [`library ${client.libraryName}`]),
      ...(client.memoryBytes === undefined ? [] : [`memory ${sizeText(client.memoryBytes)}`]),
    ].join(' · '),
  );
  return [head, '', ...lines].join('\n');
}

function memory(session: ToolSession): string {
  const connection = toolConnection(session, 'redis');
  const [stats, doctor, info] = sendTo(session, connection, [
    ['MEMORY', 'STATS'],
    ['MEMORY', 'DOCTOR'],
    ['INFO', 'memory'],
  ]);
  const report = infoReport(replyText(replyOrProblem(info)));
  const used = infoNumber(report, 'used_memory') ?? 0;
  const lines = [
    `Used: ${sizeText(used)} (peak ${sizeText(infoNumber(report, 'used_memory_peak') ?? used)}), resident ${sizeText(infoNumber(report, 'used_memory_rss') ?? 0)}, fragmentation ${infoField(report, 'mem_fragmentation_ratio') ?? 'unknown'}.`,
    memoryLimit(report),
  ];
  if (isFailed(stats)) {
    return [...lines, "The server doesn't have the MEMORY commands: this is what INFO memory tells."].join('\n');
  }
  const read = memoryStats(stats);
  const overhead = statNumber(read, 'overhead.total');
  const dataset = statNumber(read, 'dataset.bytes');
  const keys = statNumber(read, 'keys.count');
  return [
    ...lines,
    `Overhead: ${overhead === undefined ? 'unknown' : sizeText(overhead)}; data: ${dataset === undefined ? 'unknown' : sizeText(dataset)}; keys: ${keys === undefined ? 'unknown' : groupThousands(keys)}.`,
    '',
    isFailed(doctor) ? 'MEMORY DOCTOR could not be read.' : replyText(doctor),
  ].join('\n');
}

/** The tools of this group. */
export const group = groupOf('mcp.redis-server-tools', [
  {
    name: 'redis_server_info',
    title: 'Redis server information',
    description:
      'Without section, a summary: version, mode, role, uptime, clients, memory against its limit and the eviction policy, operations per second, hits and misses, persistence, replicas, and the keys of each database. With section, the lines of that section of INFO.',
    properties: { connection: connectionProp, section: namesProp(infoSections, 'A section of INFO.') },
    required: ['connection'],
    run: serverInfo,
  },
  {
    name: 'redis_slow_log',
    title: 'Redis slow log',
    description:
      'The commands the server logged as slow, newest first: id, time, duration, the command, the client; the number of entries the server holds and its threshold.',
    properties: { connection: connectionProp, limit: integerProp(1, 128, 20, 'Entries returned.') },
    required: ['connection'],
    run: slowLog,
  },
  {
    name: 'redis_clients',
    title: 'Redis clients',
    description:
      'The clients connected, least idle first: id, address, name, database, age, idle time, flags, last command, user, library, memory.',
    properties: { connection: connectionProp, limit: integerProp(1, 500, 50, 'Clients returned.') },
    required: ['connection'],
    run: clients,
  },
  {
    name: 'redis_memory',
    title: 'Redis memory',
    description:
      'Memory used, resident and at its peak, the fragmentation ratio, the limit and the eviction policy, the overhead and the size of the data, the keys counted, and what the server diagnoses.',
    properties: { connection: connectionProp },
    required: ['connection'],
    run: memory,
  },
]);

/** Feature: mcp.redis-server-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.redis-server-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
