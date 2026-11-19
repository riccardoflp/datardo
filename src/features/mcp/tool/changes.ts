/**
 * The text of `watch_changes` and `write_history` (`mcp.debugging-tools`): a change stream's events, the oplog's
 * entries, the updates' fields set and unset, and the sentences of the server's refusals. Values arrive as canonical
 * Extended JSON: a timestamp is `{ $timestamp: { t, i } }`, a date `{ $date: … }`.
 */
import type { Json } from '../../../shared/engine-request';
import { clippedValue } from '../output-limits';
import { listOf, numberIn, recordOf, shellText, textIn, dateIn } from './mongo';
import { codeOf, notAuthorized } from './deployment';
import { isFailed } from '../types';

type Entry = Readonly<Record<string, unknown>>;

/** The events of a change stream that only MongoDB 6.0 and later send, with `showExpandedEvents`. */
export const expandedEvents: readonly string[] = [
  'create',
  'createIndexes',
  'dropIndexes',
  'modify',
  'shardCollection',
  'refineCollectionShardKey',
  'reshardCollection',
];

/** The operations `operationTypes` may name. */
export const changeEvents: readonly string[] = [
  'insert',
  'update',
  'replace',
  'delete',
  'drop',
  'rename',
  'dropDatabase',
  'invalidate',
  ...expandedEvents,
];

/** The operations `write_history` may name, with their letter in the oplog. */
export const oplogOperations: Readonly<Record<string, string>> = {
  insert: 'i',
  update: 'u',
  delete: 'd',
  command: 'c',
};

/** A value on one line, cut at `LONGEST_VALUE` (or `most`) characters. */
export function clipped(value: unknown, most?: number): string {
  return clippedValue(shellText(value ?? null), most);
}

/** The seconds of a `{ $timestamp: { t, i } }`, or `undefined`. */
export function timestampSeconds(value: unknown): number | undefined {
  return numberIn(recordOf(recordOf(value)['$timestamp'])['t']);
}

/** A time to the millisecond, in UTC: `2026-11-17T10:20:30.123Z`. */
export function isoText(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/** The time of an event or of an oplog entry: its wall clock, else its timestamp's seconds; `?` when it has neither. */
export function timeOf(wall: unknown, timestamp: unknown): string {
  const date = dateIn(wall);
  if (date !== undefined) {
    return isoText(date);
  }
  const seconds = timestampSeconds(timestamp);
  return seconds === undefined ? '?' : isoText(seconds * 1000);
}

/** The fields an update sets and unsets, from its oplog entry (`$v: 2` diff, or `$set` and `$unset`). */
export interface UpdateChanges {
  readonly set: Readonly<Record<string, unknown>>;
  readonly unset: readonly string[];
  readonly truncated: readonly string[];
}

function walkDiff(
  diff: Entry,
  prefix: string,
  into: { set: Record<string, unknown>; unset: string[]; truncated: string[] },
): void {
  for (const [key, value] of Object.entries(diff)) {
    if (key === 'u' || key === 'i') {
      for (const [field, set] of Object.entries(recordOf(value))) {
        into.set[`${prefix}${field}`] = set;
      }
    } else if (key === 'd') {
      into.unset.push(...Object.keys(recordOf(value)).map((field) => `${prefix}${field}`));
    } else if (key === 'l') {
      into.truncated.push(`${prefix.slice(0, -1)} to ${String(numberIn(value) ?? 0)}`);
    } else if (/^u\d+$/u.test(key)) {
      into.set[`${prefix}${key.slice(1)}`] = value;
    } else if (key.startsWith('s')) {
      walkDiff(recordOf(value), `${prefix}${key.slice(1)}.`, into);
    }
  }
}

/** The changes of an update's `o`; `undefined` for a replacement. */
export function updateChanges(o: Entry): UpdateChanges | undefined {
  const into = { set: {} as Record<string, unknown>, unset: [] as string[], truncated: [] as string[] };
  if (typeof o['diff'] === 'object' && o['diff'] !== null) {
    walkDiff(recordOf(o['diff']), '', into);
  } else if (o['$set'] !== undefined || o['$unset'] !== undefined) {
    Object.assign(into.set, recordOf(o['$set']));
    into.unset.push(...Object.keys(recordOf(o['$unset'])));
  } else {
    return undefined;
  }
  return into;
}

function namespaceOf(ns: unknown): string {
  const record = recordOf(ns);
  return [textIn(record['db']), textIn(record['coll'])].filter((part) => part !== undefined).join('.');
}

function updateDescriptionLines(description: Entry): readonly string[] {
  const set = recordOf(description['updatedFields']);
  const removed = listOf(description['removedFields']).map(String);
  const truncated = listOf(description['truncatedArrays']).map(recordOf);
  return [
    ...(Object.keys(set).length === 0 ? [] : [`  set: ${clipped(set)}`]),
    ...(removed.length === 0 ? [] : [`  unset: ${removed.join(', ')}`]),
    ...(truncated.length === 0
      ? []
      : [
          `  truncated: ${truncated.map((each) => `${String(each['field'])} to ${String(numberIn(each['newSize']) ?? 0)}`).join(', ')}`,
        ]),
  ];
}

/** One event of a change stream: time, operation, namespace, `_id`, then what changed. */
export function eventText(change: Entry): string {
  const op = textIn(change['operationType']) ?? '?';
  const id = recordOf(change['documentKey'])['_id'];
  const lines = [
    `${timeOf(change['wallTime'], change['clusterTime'])} ${op} ${namespaceOf(change['ns'])}${id === undefined ? '' : ` _id: ${clipped(id, 200)}`}`,
  ];
  if (change['updateDescription'] !== undefined) {
    lines.push(...updateDescriptionLines(recordOf(change['updateDescription'])));
  }
  if (change['to'] !== undefined) {
    lines.push(`  to: ${namespaceOf(change['to'])}`);
  }
  if (change['operationDescription'] !== undefined) {
    lines.push(`  description: ${clipped(change['operationDescription'])}`);
  }
  if (change['fullDocumentBeforeChange'] !== undefined && change['fullDocumentBeforeChange'] !== null) {
    lines.push(`  before: ${clipped(change['fullDocumentBeforeChange'])}`);
  }
  if (change['fullDocument'] !== undefined && change['fullDocument'] !== null) {
    lines.push(`  ${op === 'update' ? 'after' : 'document'}: ${clipped(change['fullDocument'])}`);
  } else if (op === 'update' && change['fullDocument'] === null) {
    lines.push('  after: (the document no longer exists)');
  }
  return lines.join('\n');
}

/** The sentence of a change stream that failed, for the model to act on. */
export function watchProblem(reply: unknown, name: string, how: { resumed: boolean; since: boolean }): string {
  const text = isFailed(reply) ? reply.message : String(reply);
  const code = codeOf(reply);
  if (code === 40573 || /only supported on replica sets/iu.test(text)) {
    return `Change streams need a replica set or a sharded cluster: ${name} is a standalone server. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)`;
  }
  if (code === 286 || code === 280 || /no longer be in the oplog|history.*lost/iu.test(text)) {
    const start = how.resumed ? 'The resume token is' : how.since ? 'since is' : 'The starting point is';
    return `${start} older than the oplog: those changes are no longer there. Call again without ${how.resumed ? 'resumeAfter' : 'since'} to watch from now on (write_history shows what the oplog still has). (${text})`;
  }
  if (notAuthorized(reply)) {
    return `Not authorized to open a change stream on ${name}: it needs the changeStream and find actions on the watched collections (e.g. the read role on the database; readAnyDatabase for the whole deployment). (${text})`;
  }
  if (how.resumed && code !== undefined) {
    return `Invalid resume token: the change stream could not start after it. Pass the token exactly as watch_changes returned it. (${text})`;
  }
  return `The change stream failed: ${text}`;
}

/** The sentence of an oplog that cannot be read for want of a role. */
export function oplogAuthSentence(name: string): string {
  return `Not authorized to read the oplog of ${name}: reading local.oplog.rs needs a role such as clusterMonitor or readAnyDatabase (or read on the local database). Atlas shared tiers (M0, Flex) don't allow it at all; watch_changes may still work.`;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * The oplog filter of the writes (`codes`: i, u, d, c) to a database, a collection or one document of it (by `_id`,
 * in `o._id` or `o2._id`): the entries themselves, or the `applyOps` of a transaction containing them.
 */
export function writesFilter(
  codes: readonly string[],
  where: { database?: string; collection?: string; id?: Json },
): Json {
  const { database, collection, id } = where;
  const namespace: Json | undefined =
    collection !== undefined && database !== undefined
      ? `${database}.${collection}`
      : database === undefined
        ? undefined
        : { $regex: `^${escaped(database)}\\.` };
  const op: Record<string, Json> = {};
  if (namespace !== undefined) {
    op['ns'] =
      collection !== undefined && codes.includes('c') ? { $in: [namespace, `${database ?? ''}.$cmd`] } : namespace;
  }
  if (id !== undefined) {
    op['$or'] = [{ 'o._id': id }, { 'o2._id': id }];
  }
  return {
    $or: [
      { op: { $in: [...codes] }, ...op },
      { op: 'c', 'o.applyOps': { $elemMatch: { op: { $in: [...codes] }, ...op } } },
    ],
  };
}

/** `3.2 h`, `45 min`, `12.0 days`, `30 s` between two times in milliseconds. */
export function spanText(from: number, to: number): string {
  const seconds = Math.max(0, (to - from) / 1000);
  if (seconds < 120) {
    return `${String(Math.round(seconds))} s`;
  }
  if (seconds < 3600) {
    return `${String(Math.round(seconds / 60))} min`;
  }
  return seconds < 3 * 86_400 ? `${(seconds / 3600).toFixed(1)} h` : `${(seconds / 86_400).toFixed(1)} days`;
}

const opWords: Readonly<Record<string, string>> = { i: 'insert', u: 'update', d: 'delete', c: 'command', n: 'noop' };

function updateLines(o: Entry, sub: string): readonly string[] {
  const change = updateChanges(o);
  if (change === undefined) {
    return [`${sub}replaced with: ${clipped(o)}`];
  }
  const lines = [
    ...(Object.keys(change.set).length === 0 ? [] : [`${sub}set: ${clipped(change.set)}`]),
    ...(change.unset.length === 0 ? [] : [`${sub}unset: ${change.unset.join(', ')}`]),
    ...(change.truncated.length === 0 ? [] : [`${sub}truncated: ${change.truncated.join(', ')}`]),
  ];
  return lines.length === 0 ? [`${sub}no change`] : lines;
}

/** One operation of the oplog: time, operation, namespace, `_id`, then the document, the change or the command. */
export function oplogRowText(entry: Entry, inTransaction: boolean): string {
  const op = textIn(entry['op']) ?? '?';
  const o = recordOf(entry['o']);
  const id = op === 'u' ? recordOf(entry['o2'])['_id'] : op === 'c' ? undefined : o['_id'];
  const indent = inTransaction ? '  ' : '';
  const time = inTransaction ? '' : `${timeOf(entry['wall'], entry['ts'])} `;
  const sub = `${indent}  `;
  const head = `${indent}${time}${opWords[op] ?? op} ${textIn(entry['ns']) ?? ''}${id === undefined ? '' : ` _id: ${clipped(id, 200)}`}`;
  const body =
    op === 'i'
      ? [`${sub}document: ${clipped(o)}`]
      : op === 'u'
        ? updateLines(o, sub)
        : op === 'c'
          ? [`${sub}${clipped(o)}`]
          : [];
  return [head, ...body].join('\n');
}

/** The heading of the operations of one `applyOps` entry: a transaction, or a batched write. */
export function transactionHeading(entry: Entry): string {
  const lsid = recordOf(entry['lsid']);
  const partial = entry['partialTxn'] === true || (timestampSeconds(recordOf(entry['prevOpTime'])['ts']) ?? 0) > 0;
  const transaction = entry['txnNumber'] !== undefined || entry['lsid'] !== undefined;
  return [
    transaction ? 'transaction' : 'batched write (one command applied as applyOps)',
    ...(lsid['id'] === undefined ? [] : [`lsid ${shellText(lsid['id'])}`]),
    ...(entry['txnNumber'] === undefined ? [] : [`txnNumber ${shellText(entry['txnNumber'])}`]),
    ...(partial ? ['part of a larger transaction'] : []),
  ].join(', ');
}
