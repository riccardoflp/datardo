/**
 * The reading of one slow operation, from a document of `system.profile` or from a "Slow query" line of the server
 * log (`monitor.read-slow-queries`, rules 1 to 6): its numbers, its kind, its query parts and its shape. The Index
 * advisor reads its slow operations with the same rules (`advisor.read-slow-operations`). Ported from Mongoster's
 * `src/shared/profile.ts` (`fromProfileDoc`, `fromLogLine`, `readCommand`, `isNoise`).
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import { queryShape } from '../query-shape';
import type { QueryParts, SlowQuery, SlowQuerySource } from '../types';
import { dateOf, isRecord, isTypedValue, listOf, numberOf, recordOf, textOf, type JsonRecord } from './ejson';

/** The fields of a command that are not its query, left out of the command on one line (`monitor.read-operations`). */
export const operationNoise: readonly string[] = [
  'lsid',
  '$clusterTime',
  '$db',
  '$readPreference',
  'txnNumber',
  'autocommit',
  'startTransaction',
  'readConcern',
  'writeConcern',
  'apiVersion',
  '$audit',
  '$client',
  'mayBypassWriteBlocking',
];

/** The fields left out when the command of a slow operation is read (rule 5). */
const slowQueryNoise = new Set([
  ...operationNoise,
  'apiStrict',
  'apiDeprecationErrors',
  'cursor',
  'batchSize',
  'comment',
  'maxTimeMS',
  'allowDiskUse',
  'ordered',
  'bypassDocumentValidation',
  'shardVersion',
  'databaseVersion',
]);

/** The longest command on one line, in characters, before `…`. */
export const longestCommand = 300;

/** A document of the query, or `undefined` when the value is not one. */
function documentOf(value: Json | undefined): Json | undefined {
  return isRecord(value) && !isTypedValue(value) ? value : undefined;
}

function defined(parts: Record<string, Json | readonly Json[] | undefined>): QueryParts {
  return Object.fromEntries(Object.entries(parts).filter(([, value]) => value !== undefined));
}

/** The kind of a command and its query parts (rule 3); `statement` is `update` or `remove` for one statement. */
export function readCommand(command: unknown, statement?: string): { kind: string; query: QueryParts } {
  const fields = recordOf(command);
  if (statement === 'update') {
    return { kind: 'update', query: defined({ filter: documentOf(fields['q']), update: fields['u'] }) };
  }
  if (statement === 'remove') {
    return { kind: 'delete', query: defined({ filter: documentOf(fields['q']) }) };
  }
  const first = Object.keys(fields).find((key) => !slowQueryNoise.has(key)) ?? '';
  switch (first) {
    case 'find':
      return {
        kind: 'find',
        query: defined({
          filter: documentOf(fields['filter']),
          sort: documentOf(fields['sort']),
          projection: documentOf(fields['projection']),
        }),
      };
    case 'aggregate':
      return { kind: 'aggregate', query: { pipeline: listOf(fields['pipeline']).filter((stage) => isRecord(stage)) } };
    case 'count':
    case 'distinct':
      return { kind: first, query: defined({ filter: documentOf(fields['query']) }) };
    case 'findAndModify':
    case 'findandmodify':
      return {
        kind: 'findAndModify',
        query: defined({
          filter: documentOf(fields['query']),
          sort: documentOf(fields['sort']),
          update: fields['update'],
        }),
      };
    default:
      return { kind: first === '' ? (statement ?? 'command') : first, query: {} };
  }
}

/** A command on one line in mongosh syntax, without `left` fields, cut at 300 characters with `…`. */
export function commandLine(command: unknown, left: ReadonlySet<string> = slowQueryNoise): string {
  if (!isRecord(command)) {
    return '';
  }
  const kept = Object.fromEntries(Object.entries(command).filter(([key]) => !left.has(key)));
  const text = formattedValue(kept, 'one-line');
  const characters = Array.from(text);
  return characters.length > longestCommand ? `${characters.slice(0, longestCommand).join('')}…` : text;
}

/** The users of an operation as `name@database` joined by `, `. */
export function usersText(value: unknown): string | undefined {
  const users = listOf(value).flatMap((each) => {
    const name = textOf(recordOf(each)['user']);
    const database = textOf(recordOf(each)['db']);
    return name === undefined ? [] : [`${name}@${database ?? ''}`];
  });
  return users.length === 0 ? undefined : users.join(', ');
}

/** What a profiler document or a log line says beside its command. */
interface RecordFields {
  readonly source: SlowQuerySource;
  readonly time: number;
  readonly namespace: string;
  readonly millis: number;
  readonly numbers: JsonRecord;
  readonly application?: string;
  readonly client?: string;
  readonly users?: string;
  readonly record: Json;
}

function optionalNumber(name: 'docsExamined' | 'keysExamined' | 'returned', value: Json | undefined): object {
  const number = numberOf(value);
  return number === undefined ? {} : { [name]: number };
}

function optionalText(name: string, value: string | undefined): object {
  return value === undefined ? {} : { [name]: value };
}

/** A slow operation from its fields, its command, the statement it is of, and the command that opened its cursor. */
function slowQueryOf(
  fields: RecordFields,
  command: unknown,
  statement: string | undefined,
  origin: unknown,
): SlowQuery {
  const getMore = 'getMore' in recordOf(command);
  const read = getMore && isRecord(origin) ? origin : command;
  const { kind, query } = readCommand(read, getMore ? undefined : statement);
  const plan = textOf(fields.numbers['planSummary']);
  return {
    source: fields.source,
    time: fields.time,
    namespace: fields.namespace,
    kind,
    getMore,
    millis: fields.millis,
    ...optionalNumber('docsExamined', fields.numbers['docsExamined']),
    ...optionalNumber('keysExamined', fields.numbers['keysExamined']),
    ...optionalNumber('returned', fields.numbers['nreturned']),
    ...optionalText('plan', plan),
    inMemorySort: fields.numbers['hasSortStage'] === true,
    ...optionalText('application', fields.application),
    ...optionalText('client', fields.client),
    ...optionalText('users', fields.users),
    query,
    shape: queryShape(kind, query),
    command: commandLine(read),
    record: fields.record,
  };
}

/** A document of `system.profile` as a slow operation (rule 1). */
export function fromProfileDocument(document: unknown): SlowQuery {
  const fields = recordOf(document);
  return slowQueryOf(
    {
      source: 'profiler',
      time: dateOf(fields['ts']) ?? 0,
      namespace: textOf(fields['ns']) ?? '',
      millis: numberOf(fields['millis']) ?? 0,
      numbers: fields,
      ...optionalText('application', textOf(fields['appName'])),
      ...optionalText('client', textOf(fields['client'])),
      ...optionalText('users', usersText(fields['allUsers'])),
      record: fields,
    },
    fields['command'] ?? fields['query'],
    textOf(fields['op']),
    fields['originatingCommand'],
  );
}

function parsedLine(line: string): JsonRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    // A line that is not JSON is not a slow query: it gives nothing (rule 2).
    return undefined;
  }
}

/** Whether a line is the command of a batch of updates or deletes, whose statements have lines of their own. */
function isBatchOfWrites(namespace: string, command: JsonRecord): boolean {
  return namespace.endsWith('.$cmd') && ('update' in command || 'delete' in command);
}

/** A "Slow query" line of the server log as a slow operation, or `undefined` when it is not one (rule 2). */
export function fromLogLine(line: string): SlowQuery | undefined {
  const entry = parsedLine(line);
  const attributes = entry?.['attr'];
  if (entry?.['msg'] !== 'Slow query' || !isRecord(attributes)) {
    return undefined;
  }
  const namespace = textOf(attributes['ns']) ?? '';
  const command = recordOf(attributes['command']);
  if (isBatchOfWrites(namespace, command)) {
    return undefined;
  }
  const type = textOf(attributes['type']);
  return slowQueryOf(
    {
      source: 'log',
      time: dateOf(entry['t']) ?? 0,
      namespace,
      millis: numberOf(attributes['durationMillis']) ?? 0,
      numbers: attributes,
      ...optionalText('application', textOf(attributes['appName'])),
      ...optionalText('client', textOf(attributes['remote'])),
      record: entry,
    },
    command,
    type === 'update' || type === 'remove' ? type : undefined,
    attributes['originatingCommand'],
  );
}

/** The commands of the profiler, of the monitor and of the drivers, left out of the result (rule 6). */
const monitoringKinds = new Set([
  'profile',
  'getLog',
  'hello',
  'isMaster',
  'ismaster',
  'ping',
  'currentOp',
  'serverStatus',
  'dbStats',
  'collStats',
  'listDatabases',
  'buildInfo',
  'getParameter',
  'endSessions',
  'saslStart',
  'saslContinue',
  'killCursors',
]);

/** Whether an operation is the profiler's own, the monitor's or a driver's: left out of the result (rule 6). */
export function isNoise(operation: SlowQuery): boolean {
  return (
    /\.system\.profile$/u.test(operation.namespace) ||
    /^(local|config)\./u.test(operation.namespace) ||
    monitoringKinds.has(operation.kind)
  );
}
