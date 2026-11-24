/**
 * The last guard of the MCP server's promise (`mcp.server`, R5.6): what the main process lets a tool send. The tools
 * are written to read only; this checks each request again before it leaves, whatever arguments a client crafted, so
 * that nothing a tool sends can write, kill an operation or change a server setting. A MongoDB request is one of the
 * methods that read, a command of `runCommand` one that reads (`profile` only as `-1`, which reads the level), a
 * pipeline without `$out` or `$merge`; a Redis command is one of those the cards list in **Reads**. An app action is one
 * of those the tools ask the main process, and a tab opened is never a console or a playground.
 */
import type { ConnectionRequest, Json, MongoRequest, RedisRequest } from '../../../shared/engine-request';
import { writeStageAnywhere } from '../refuse-write-stages';
import { mcpActions } from '../types';

/** The methods of MongoDB a tool may call: they read. */
const mongoMethods: ReadonlySet<string> = new Set([
  'find',
  'findOne',
  'aggregate',
  'countDocuments',
  'estimatedDocumentCount',
  'distinct',
  'listCollections',
  'listIndexes',
  'watch',
  'runCommand',
]);

/** The commands of `runCommand` a tool may send: they read. */
const mongoCommands: ReadonlySet<string> = new Set([
  'hello',
  'buildInfo',
  'listDatabases',
  'serverStatus',
  'dbStats',
  'replSetGetStatus',
  'replSetGetConfig',
  'currentOp',
  'getLog',
  'profile',
  'explain',
  'ping',
]);

/** The commands `explain` may wrap. */
const explainedCommands: ReadonlySet<string> = new Set(['find', 'aggregate', 'count', 'distinct']);

/** The Redis commands a tool may send, with the subcommand they need when they have some. */
const redisCommands: ReadonlyMap<string, ReadonlySet<string> | undefined> = new Map<
  string,
  ReadonlySet<string> | undefined
>([
  ['SCAN', undefined],
  ['TYPE', undefined],
  ['PTTL', undefined],
  ['STRLEN', undefined],
  ['HLEN', undefined],
  ['LLEN', undefined],
  ['SCARD', undefined],
  ['ZCARD', undefined],
  ['XLEN', undefined],
  ['GETRANGE', undefined],
  ['HSCAN', undefined],
  ['LRANGE', undefined],
  ['SSCAN', undefined],
  ['ZRANGE', undefined],
  ['XRANGE', undefined],
  ['INFO', undefined],
  ['PING', undefined],
  ['OBJECT', new Set(['ENCODING'])],
  ['MEMORY', new Set(['USAGE', 'STATS', 'DOCTOR'])],
  ['SLOWLOG', new Set(['GET', 'LEN'])],
  ['CLIENT', new Set(['LIST'])],
  ['CONFIG', new Set(['GET'])],
]);

/** The one parameter `CONFIG GET` may read: no password of the configuration is ever read. */
const configRead = 'slowlog-log-slower-than';

function recordOf(value: Json | undefined): Readonly<Record<string, Json>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : undefined;
}

/**
 * Whether a pipeline has no stage that writes: no `$out`, no `$merge`, spaces around the name ignored, at the top nor
 * in the pipelines nested in `$facet`, `$lookup` and `$unionWith`.
 */
export function isReadingPipeline(pipeline: Json | undefined): boolean {
  if (pipeline === undefined) {
    return true;
  }
  if (!Array.isArray(pipeline)) {
    return false;
  }
  return (
    (pipeline as readonly Json[]).every((stage) => recordOf(stage) !== undefined) &&
    writeStageAnywhere(pipeline) === undefined
  );
}

function isReadingCommand(command: Readonly<Record<string, Json>> | undefined): boolean {
  const name = command === undefined ? undefined : Object.keys(command)[0];
  if (command === undefined || name === undefined || !mongoCommands.has(name)) {
    return false;
  }
  if (name === 'profile') {
    const level = command['profile'];
    return level === -1 || recordOf(level)?.['$numberInt'] === '-1';
  }
  if (name === 'explain') {
    const inner = recordOf(command['explain']);
    const innerName = inner === undefined ? undefined : Object.keys(inner)[0];
    return (
      inner !== undefined &&
      innerName !== undefined &&
      explainedCommands.has(innerName) &&
      isReadingPipeline(inner['pipeline'])
    );
  }
  return true;
}

/** Whether a request to MongoDB reads only. */
export function isReadingMongoRequest(request: MongoRequest): boolean {
  if (!mongoMethods.has(request.method)) {
    return false;
  }
  const [first] = request.arguments;
  switch (request.method) {
    case 'aggregate':
    case 'watch':
      return isReadingPipeline(first ?? []);
    case 'runCommand':
      return isReadingCommand(recordOf(first));
    default:
      return true;
  }
}

/** Whether a command to Redis is one of those the tools read with. */
export function isReadingRedisRequest(request: RedisRequest): boolean {
  const words = request.command.map((word) => new TextDecoder().decode(word));
  const [name = '', sub = ''] = words.map((word, index) => (index < 2 ? word.toUpperCase() : word));
  if (!redisCommands.has(name)) {
    return false;
  }
  const subcommands = redisCommands.get(name);
  if (subcommands !== undefined && !subcommands.has(sub)) {
    return false;
  }
  if (name === 'CONFIG') {
    return words.length === 3 && words[2] === configRead;
  }
  return true;
}

/** Whether a request a tool asks to send reads only. */
export function isReadingRequest(request: ConnectionRequest): boolean {
  const asked = request.request;
  return asked.engine === 'mongodb' ? isReadingMongoRequest(asked) : isReadingRedisRequest(asked);
}

/** The app actions the main process answers for the tools; any other is refused. */
export const toolActions: ReadonlySet<string> = new Set([
  mcpActions.connect,
  mcpActions.undoHistory,
  mcpActions.undoWrite,
  mcpActions.openTab,
  'saved-query.list',
  // The advice of the Index advisor, from reads only (`advisor.read-indexes`, `advisor.read-slow-operations`).
  'advisor.analyze',
  // The reads of the Sharding section through a mongos, for `sharding_status`: it never starts or stops the balancer.
  'monitor.sharding',
]);

/** The kinds of tab no tool opens: a console or a playground, where a command or a script would run. */
const closedKinds: ReadonlySet<string> = new Set(['console', 'playground']);

/** Whether the intent of `mcp.open-tab` opens a tab the tools may open: `tab.open`, never a console or a playground. */
export function isToolTab(intent: Json | undefined): boolean {
  const record = recordOf(intent);
  const shows = recordOf(recordOf(record?.['args'])?.['shows']);
  const kind = shows?.['kind'];
  return record?.['feature'] === 'tab.open' && typeof kind === 'string' && !closedKinds.has(kind);
}

/** The sentence a tool gets for a request the guard did not send. */
export function notSentSentence(request: ConnectionRequest): string {
  const asked = request.request;
  const what =
    asked.engine === 'mongodb'
      ? asked.method === 'runCommand'
        ? (Object.keys(recordOf(asked.arguments[0]) ?? {})[0] ?? 'runCommand')
        : asked.method
      : (new TextDecoder().decode(asked.command[0] ?? new Uint8Array()) || 'the command').toUpperCase();
  return `Datardo's MCP server only reads: ${what} was not sent.`;
}
