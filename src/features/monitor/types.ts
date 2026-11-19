/**
 * What the features of the Monitor page share: the connection a feature is started on and how it is now, the
 * arguments it is started with, the slow operations and their query parts, and the suggested index of a query.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { isRecord, recordOf, type JsonRecord } from './parts/ejson';

/** The sections of the Monitor page, in the order of the section bar. */
export type MonitorSection = 'operations' | 'slow-queries' | 'stats' | 'replication' | 'sharding';

/** The sections in the order of the section bar. */
export const monitorSections: readonly MonitorSection[] = [
  'operations',
  'slow-queries',
  'stats',
  'replication',
  'sharding',
];

/** The connection a feature of the page works on, and how it is now (D14). */
export interface MonitorConnection {
  readonly id: ConnectionId;
  /** Its name, or its identifier when it is no longer saved. */
  readonly name: string;
  readonly readOnly: boolean;
  /** Whether the server it reaches is a mongos, as connecting found it. */
  readonly mongos: boolean;
}

/** The arguments a feature was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Answers): JsonRecord {
  return recordOf(answers['args']);
}

/** A text argument, or `undefined`. */
export function textArg(args: unknown, name: string): string | undefined {
  const value = recordOf(args)[name];
  return typeof value === 'string' ? value : undefined;
}

/** A number argument, or `undefined`. */
export function numberArg(args: unknown, name: string): number | undefined {
  const value = recordOf(args)[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A yes-or-no argument: `true` only when it is `true`. */
export function isOn(args: unknown, name: string): boolean {
  return recordOf(args)[name] === true;
}

/** The connection a feature works on: `args.connection`, else its target's, else the current connection. */
export function monitorConnection(context: Context, args: unknown): MonitorConnection | undefined {
  const named = textArg(args, 'connection');
  const id =
    named === undefined ? (targetConnection(context.target) ?? context.state.nav.current) : connectionId(named);
  if (id === undefined) {
    return undefined;
  }
  const saved = savedConnection(context.state.connections, id);
  const server = context.state.connections.live[id]?.server;
  return {
    id,
    name: saved?.name ?? id,
    readOnly: saved?.readOnly ?? false,
    mongos: server?.engine === 'mongodb' && server.topology.kind === 'sharded',
  };
}

/** The connection a feature works on; every control of the page names one, so a start without one is a fault. */
export function requiredConnection(context: Context, args: unknown): MonitorConnection {
  const connection = monitorConnection(context, args);
  if (connection === undefined) {
    throw new Error(`${context.feature} is started on a connection.`);
  }
  return connection;
}

/** The connection of a Read's arguments. */
export function readConnection(args: unknown): ConnectionId {
  return connectionId(textArg(args, 'connection') ?? '');
}

/** The parts of a query an operation ran, as Extended JSON: what makes its shape and what is opened again. */
export interface QueryParts {
  readonly filter?: Json;
  readonly sort?: Json;
  readonly projection?: Json;
  readonly pipeline?: readonly Json[];
  /** The update of an `update` or a `findAndModify`: its operators or its pipeline. */
  readonly update?: Json;
}

/** Where a slow operation was read. */
export type SlowQuerySource = 'profiler' | 'log';

/** One slow operation the profiler or the server log recorded (glossary, "slow query"). */
export interface SlowQuery {
  readonly source: SlowQuerySource;
  /** When it ran, in milliseconds since 1970. */
  readonly time: number;
  readonly namespace: string;
  /** `find`, `aggregate`, `count`, `distinct`, `findAndModify`, `update`, `delete`, `insert`, or the command's name. */
  readonly kind: string;
  /** A next batch of the cursor of a query, counted with that query. */
  readonly getMore: boolean;
  readonly millis: number;
  readonly docsExamined?: number;
  readonly keysExamined?: number;
  readonly returned?: number;
  readonly plan?: string;
  /** Whether it sorted in memory. */
  readonly inMemorySort: boolean;
  readonly application?: string;
  readonly client?: string;
  /** The users, as `name@database` joined by `, `. */
  readonly users?: string;
  readonly query: QueryParts;
  /** The query shape (`monitor.query-shape`). */
  readonly shape: string;
  /** The command on one line, without the fields that are not the query, at most 300 characters then `…`. */
  readonly command: string;
  /** The whole profiler document or log entry, for the inspector island. */
  readonly record: Json;
}

/** A field of the keys of an index, with its direction (`1`, `-1`) or its kind (`"text"`, `"hashed"`). */
export interface IndexKeyField {
  readonly field: string;
  readonly value: number | string;
}

/** The keys of an index, in order: `{ status: 1, createdAt: -1 }`. */
export type IndexKey = readonly IndexKeyField[];

/** The keys of a suggested index, each ascending or descending (glossary, "suggested index"). */
export type SuggestedIndex = readonly { readonly field: string; readonly value: 1 | -1 }[];

/** The keys of an index from its key document, in the order of its fields. */
export function indexKeyOf(key: unknown): IndexKey {
  if (!isRecord(key)) {
    return [];
  }
  return Object.entries(key).map(([field, value]) => {
    const record = recordOf(value);
    const written =
      record['$numberInt'] ?? record['$numberLong'] ?? record['$numberDouble'] ?? record['$numberDecimal'];
    const number = typeof value === 'number' ? value : typeof written === 'string' ? Number(written) : undefined;
    return { field, value: number ?? (typeof value === 'string' ? value : JSON.stringify(value)) };
  });
}

function keyName(field: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(field) ? field : JSON.stringify(field);
}

/** The keys of an index in mongosh syntax: `{ status: 1, createdAt: -1 }`, `{ customerId: 1, _id: "hashed" }`. */
export function indexKeyText(key: IndexKey): string {
  if (key.length === 0) {
    return '{}';
  }
  const fields = key.map(
    (each) =>
      `${keyName(each.field)}: ${typeof each.value === 'number' ? String(each.value) : JSON.stringify(each.value)}`,
  );
  return `{ ${fields.join(', ')} }`;
}

/** The keys of an index as the document `createIndex` is sent, with whole numbers of Extended JSON. */
export function indexKeyDocument(key: IndexKey): Json {
  return Object.fromEntries(
    key.map((each) => [each.field, typeof each.value === 'number' ? { $numberInt: String(each.value) } : each.value]),
  );
}

/** The name the server gives an index with these keys: `status_1_createdAt_-1`. */
export function defaultIndexName(key: IndexKey): string {
  return key.map((each) => `${each.field}_${String(each.value)}`).join('_');
}

/** Whether two index keys are the same fields in the same order with the same values. */
export function isSameKey(one: IndexKey, other: IndexKey): boolean {
  return (
    one.length === other.length &&
    one.every((each, index) => {
      const same = other[index];
      return same !== undefined && each.field === same.field && each.value === same.value;
    })
  );
}
