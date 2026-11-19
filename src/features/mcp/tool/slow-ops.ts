/**
 * The slow operations `slow_queries` groups by query shape (`mcp.performance-tools`), read from a profiler document
 * (`system.profile`) or a line of the server log (`getLog: "global"`, the `Slow query` lines). The monitor's cards that
 * read them (`monitor.profiler`, M30) are not on this branch: this is a stand-in that reads the same fields, to be
 * replaced by theirs. The shapes keep the keys and the operators, never a value: `{ a: ?, s: { $gt: ? } }`.
 */
import type { Json } from '../../../shared/engine-request';
import { isJsonObject, isSubdocument, wrapperType, type JsonObject } from '../../query/mongosh/ejson';
import { counted } from '../output-limits';
import { hiddenValue } from '../read-data';
import { createIndexCommand, suggestIndex } from './explain';
import { dateIn, listOf, numberIn, recordOf, shellText, textIn } from './mongo';

/** One slow operation. */
export interface SlowOp {
  /** When it ended, in milliseconds. */
  readonly at: number;
  readonly kind: string;
  readonly getMore: boolean;
  readonly ns: string;
  readonly millis: number;
  readonly docsExamined: number;
  readonly keysExamined: number;
  readonly nreturned: number;
  readonly plan?: string;
  readonly sortStage: boolean;
  readonly app?: string;
  readonly filter?: JsonObject;
  readonly sort?: JsonObject;
  readonly shape: string;
}

/** The fields of a command that are not its query. */
const noise = new Set([
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
  'apiStrict',
  'apiDeprecationErrors',
  '$audit',
  '$client',
  'mayBypassWriteBlocking',
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

/** A command without the fields of its session and of its driver. */
export function withoutNoise(command: unknown): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(recordOf(command)).filter(([key]) => !noise.has(key)));
}

function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/u.test(key) ? key : JSON.stringify(key);
}

/** The shape of a value: `?` for every value, the keys, operators and field paths (`"$total"`) kept. */
export function queryShape(value: unknown, keepNumbers = false): string {
  if (Array.isArray(value)) {
    const parts = [...new Set((value as unknown[]).map((each) => queryShape(each, keepNumbers)))];
    return parts.length === 0 ? '[]' : parts.length === 1 && parts[0] === hiddenValue ? '[?]' : `[${parts.join(', ')}]`;
  }
  if (isJsonObject(value as Json)) {
    const object = value as JsonObject;
    if (!isSubdocument(object)) {
      return wrapperType(object) === 'regex'
        ? '/?/'
        : keepNumbers && numberIn(object) !== undefined
          ? shellText(object)
          : hiddenValue;
    }
    const entries = Object.entries(object);
    if (entries.length === 0) {
      return '{}';
    }
    const keep = (key: string): boolean => keepNumbers || ['$sort', '$project', 'sort', 'projection'].includes(key);
    return `{ ${entries.map(([key, each]) => `${keyText(key)}: ${queryShape(each, keep(key))}`).join(', ')} }`;
  }
  if (typeof value === 'string') {
    return value.startsWith('$') ? JSON.stringify(value) : hiddenValue;
  }
  return keepNumbers && (typeof value === 'number' || typeof value === 'boolean') ? String(value) : hiddenValue;
}

interface CommandRead {
  readonly kind: string;
  readonly filter?: JsonObject;
  readonly sort?: JsonObject;
  readonly shape: string;
}

function objectOf(value: unknown): JsonObject | undefined {
  return isSubdocument(value as Json) ? (value as JsonObject) : undefined;
}

function shapeOfParts(
  kind: string,
  parts: { filter?: JsonObject; sort?: JsonObject; projection?: JsonObject; update?: unknown },
): string {
  const shown = [
    ...(parts.filter === undefined ? [] : [queryShape(parts.filter)]),
    ...(parts.sort === undefined ? [] : [`sort ${queryShape(parts.sort, true)}`]),
    ...(parts.projection === undefined ? [] : [`project ${queryShape(parts.projection, true)}`]),
    ...(parts.update === undefined ? [] : [`update ${queryShape(parts.update)}`]),
  ];
  return shown.length > 0 ? shown.join(' · ') : ['find', 'count', 'distinct'].includes(kind) ? '{}' : '';
}

/** The kind of a command and its query, as its shape. */
export function readCommand(command: unknown, op?: string): CommandRead {
  const c = recordOf(command);
  if (op === 'update' || op === 'remove') {
    const filter = objectOf(c['q']);
    const kind = op === 'update' ? 'update' : 'delete';
    return {
      kind,
      ...(filter === undefined ? {} : { filter }),
      shape: shapeOfParts(kind, {
        ...(filter === undefined ? {} : { filter }),
        ...(op === 'update' ? { update: c['u'] } : {}),
      }),
    };
  }
  const first = Object.keys(c).find((key) => !noise.has(key)) ?? '';
  if (first === 'aggregate') {
    const pipeline = listOf(c['pipeline']).map(recordOf);
    const match = objectOf(pipeline[0]?.['$match']);
    const sort = objectOf((match === undefined ? pipeline[0] : pipeline[1])?.['$sort']);
    return {
      kind: 'aggregate',
      ...(match === undefined ? {} : { filter: match }),
      ...(sort === undefined ? {} : { sort }),
      shape: queryShape(pipeline),
    };
  }
  const filterKey: Readonly<Record<string, string>> = {
    find: 'filter',
    count: 'query',
    distinct: 'query',
    findAndModify: 'query',
    findandmodify: 'query',
  };
  const key = filterKey[first];
  if (key === undefined) {
    const kind = first === '' ? (op ?? 'command') : first;
    return { kind, shape: shapeOfParts(kind, {}) };
  }
  const kind = first === 'findandmodify' ? 'findAndModify' : first;
  const filter = objectOf(c[key]);
  const sort = objectOf(c['sort']);
  const projection = objectOf(c['projection']);
  const parts = {
    ...(filter === undefined ? {} : { filter }),
    ...(sort === undefined ? {} : { sort }),
    ...(projection === undefined ? {} : { projection }),
    ...(kind === 'findAndModify' ? { update: c['update'] } : {}),
  };
  return {
    kind,
    ...(filter === undefined ? {} : { filter }),
    ...(sort === undefined ? {} : { sort }),
    shape: shapeOfParts(kind, parts),
  };
}

function slowOp(
  fields: Omit<SlowOp, keyof CommandRead | 'getMore'>,
  command: unknown,
  op: string | undefined,
  originating: unknown,
): SlowOp {
  const getMore = 'getMore' in recordOf(command);
  const read = readCommand(getMore && originating !== undefined ? originating : command, op);
  return { ...fields, ...read, getMore };
}

/** An operation of `system.profile`. */
export function fromProfileDocument(document: unknown): SlowOp {
  const entry = recordOf(document);
  const plan = textIn(entry['planSummary']);
  const app = textIn(entry['appName']);
  return slowOp(
    {
      at: dateIn(entry['ts']) ?? 0,
      ns: textIn(entry['ns']) ?? '',
      millis: numberIn(entry['millis']) ?? 0,
      docsExamined: numberIn(entry['docsExamined']) ?? 0,
      keysExamined: numberIn(entry['keysExamined']) ?? 0,
      nreturned: numberIn(entry['nreturned']) ?? 0,
      ...(plan === undefined ? {} : { plan }),
      sortStage: entry['hasSortStage'] === true,
      ...(app === undefined ? {} : { app }),
    },
    entry['command'] ?? entry['query'],
    textIn(entry['op']),
    entry['originatingCommand'],
  );
}

function parsedLine(line: string): Readonly<Record<string, unknown>> {
  try {
    return recordOf(JSON.parse(line));
  } catch {
    // A line of the log that is not JSON (MongoDB before 4.4) is not a slow operation that can be read.
    return {};
  }
}

/** A `Slow query` line of the server log (MongoDB 4.4 and later), or `undefined` for any other line. */
export function fromLogLine(line: string): SlowOp | undefined {
  const entry = parsedLine(line);
  const attr = recordOf(entry['attr']);
  if (entry['msg'] !== 'Slow query') {
    return undefined;
  }
  const ns = textIn(attr['ns']) ?? '';
  const command = recordOf(attr['command']);
  if (ns.endsWith('.$cmd') && ('update' in command || 'delete' in command)) {
    return undefined;
  }
  const type = textIn(attr['type']);
  const plan = textIn(attr['planSummary']);
  const app = textIn(attr['appName']);
  return slowOp(
    {
      at: dateIn(entry['t']) ?? 0,
      ns,
      millis: numberIn(attr['durationMillis']) ?? 0,
      docsExamined: numberIn(attr['docsExamined']) ?? 0,
      keysExamined: numberIn(attr['keysExamined']) ?? 0,
      nreturned: numberIn(attr['nreturned']) ?? 0,
      ...(plan === undefined ? {} : { plan }),
      sortStage: attr['hasSortStage'] === true,
      ...(app === undefined ? {} : { app }),
    },
    command,
    type === 'update' || type === 'remove' ? type : undefined,
    attr['originatingCommand'],
  );
}

/** Whether an operation is one of the monitoring tools' own (this tool's `profile` and `getLog` among them). */
export function isNoise(op: SlowOp): boolean {
  return (
    ['hello', 'isMaster', 'ismaster', 'ping', 'profile', 'getLog', 'currentOp', 'serverStatus', 'buildInfo'].includes(
      op.kind,
    ) ||
    op.ns.startsWith('admin.') ||
    op.ns.startsWith('local.') ||
    op.ns.startsWith('config.')
  );
}

/** The operations of one shape. */
export interface SlowOpGroup {
  readonly kind: string;
  readonly ns: string;
  readonly shape: string;
  readonly count: number;
  readonly getMores: number;
  readonly totalMs: number;
  readonly maxMs: number;
  readonly docsExamined: number;
  readonly keysExamined: number;
  readonly nreturned: number;
  readonly plans: readonly string[];
  readonly sortStage: boolean;
  readonly last: number;
  readonly apps: readonly string[];
  readonly suggestion?: Readonly<Record<string, 1 | -1>>;
}

function merged(group: SlowOpGroup | undefined, op: SlowOp): SlowOpGroup {
  const base: SlowOpGroup = group ?? {
    kind: op.kind,
    ns: op.ns,
    shape: op.shape,
    count: 0,
    getMores: 0,
    totalMs: 0,
    maxMs: 0,
    docsExamined: 0,
    keysExamined: 0,
    nreturned: 0,
    plans: [],
    sortStage: false,
    last: 0,
    apps: [],
  };
  return {
    ...base,
    count: base.count + 1,
    getMores: base.getMores + (op.getMore ? 1 : 0),
    totalMs: base.totalMs + op.millis,
    maxMs: Math.max(base.maxMs, op.millis),
    docsExamined: base.docsExamined + op.docsExamined,
    keysExamined: base.keysExamined + op.keysExamined,
    nreturned: base.nreturned + op.nreturned,
    plans: op.plan === undefined || base.plans.includes(op.plan) ? base.plans : [...base.plans, op.plan],
    sortStage: base.sortStage || op.sortStage,
    last: Math.max(base.last, op.at),
    apps: op.app === undefined || base.apps.includes(op.app) ? base.apps : [...base.apps, op.app],
  };
}

/** The operations grouped by namespace, kind and shape, the slowest in total first, with an index that could help. */
export function groupOps(ops: readonly SlowOp[]): readonly SlowOpGroup[] {
  const groups = new Map<string, SlowOpGroup>();
  const examples = new Map<string, SlowOp>();
  for (const op of ops) {
    const key = `${op.ns}\u0000${op.kind}\u0000${op.shape}`;
    groups.set(key, merged(groups.get(key), op));
    const example = examples.get(key);
    if (example === undefined || (example.getMore && !op.getMore) || (!op.getMore && op.millis > example.millis)) {
      examples.set(key, op);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const example = examples.get(key);
      const scanned = group.docsExamined / Math.max(group.nreturned, 1);
      const helps = group.plans.some((plan) => plan.includes('COLLSCAN')) || group.sortStage || scanned >= 10;
      const suggestion = helps && example !== undefined ? suggestIndex(example.filter ?? {}, example.sort) : undefined;
      return suggestion === undefined ? group : { ...group, suggestion };
    })
    .sort((one, other) => other.totalMs - one.totalMs || other.count - one.count);
}

function ms(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} ms`;
}

/** A group as text, its values left out. */
export function groupText(group: SlowOpGroup, index: number): string {
  const collection = group.ns.slice(group.ns.indexOf('.') + 1);
  const runs = group.count - group.getMores;
  const perReturned = Math.round(group.docsExamined / Math.max(group.nreturned, 1));
  const plan = [
    ...(group.plans.length === 0 ? [] : [`plan ${group.plans.join(' | ')}`]),
    ...(group.sortStage ? ['in-memory sort'] : []),
  ];
  return [
    `${String(index)}. ${group.kind} ${group.ns}${group.shape === '' ? '' : `: ${group.shape}`}`,
    `   ${counted(runs === 0 ? group.count : runs, 'operation')}${group.getMores === 0 ? '' : ` + ${counted(group.getMores, 'next batch', 'next batches')}`}, total ${ms(group.totalMs)}, avg ${ms(group.totalMs / group.count)}, max ${ms(group.maxMs)}`,
    `   examined ${counted(group.docsExamined, 'document')} and ${counted(group.keysExamined, 'key')} for ${group.nreturned.toLocaleString('en-US')} returned${group.docsExamined >= Math.max(group.nreturned, 1) * 10 ? ` (${perReturned.toLocaleString('en-US')} per document returned)` : ''}`,
    ...(plan.length === 0 ? [] : [`   ${plan.join(', ')}`]),
    ...(group.suggestion === undefined
      ? []
      : [
          `   index that could help: ${shellText(group.suggestion)}  →  ${createIndexCommand(collection, group.suggestion)}`,
        ]),
    `   last ${new Date(group.last).toISOString()}${group.apps.length === 0 ? '' : `, apps: ${group.apps.join(', ')}`}`,
  ].join('\n');
}

/** Whether a namespace is in the filter: a database (`shop`) or a collection (`shop.orders`). */
export function inNamespace(ns: string, filter: string | undefined): boolean {
  if (filter === undefined) {
    return true;
  }
  return filter.includes('.')
    ? ns === filter
    : ns.slice(0, ns.indexOf('.') < 0 ? ns.length : ns.indexOf('.')) === filter;
}
