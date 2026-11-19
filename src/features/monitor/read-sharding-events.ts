/**
 * Feature: monitor.read-sharding-events
 *
 * The last migrations, splits, merges and balancer rounds, newest first:
 * `db.getSiblingDB("config").changelog.find(<filter>).sort({ time: -1 }).limit(100).maxTimeMS(15000)` and, when no
 * namespace is asked for, the same of `config.actionlog` (the balancer's rounds, which are not about one collection),
 * merged by time. Started with `{ connection, text, show }`, `show` being `balancer` (to start with) or `every`.
 * Ported from Mongoster's `src/sharding.ts › shardingEvents`, `shardingEvent`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { dateOf, int, isRecord, listOf, numberOf, recordOf, textOf, type JsonRecord } from './parts/ejson';
import { failureOf, shortMessage, type PartRead } from './parts/failure';
import { clusterTimeLimitMs, collectionCall, engineRead, escapeRegularExpression } from './parts/requests';
import { countText, counted } from './parts/units';
import { clipped, shellText } from './oplog-summary';
import { text } from './text';
import { readConnection, textArg } from './types';

/** How many events are read from each collection, and kept. */
export const eventsAtMost = 100;

/** The events of **Migrations, splits, balancer**. */
export const balancerEvents =
  '^(moveChunk|moveRange|split|multi-split|merge|autoMerge|balancer|rangeDeletion|cleanUpOrphaned)';

/** The choices of **Show**. */
export type EventScope = 'balancer' | 'every';

/** An event of the cluster. */
export interface ShardingEvent {
  readonly key: string;
  /** In milliseconds since 1970; 0 when the entry has none. */
  readonly time: number;
  readonly what: string;
  readonly namespace: string;
  readonly shard?: string;
  readonly summary: string;
  readonly failure: boolean;
  /** Whether it comes from `config.actionlog`. */
  readonly action: boolean;
  readonly entry: Json;
}

const words = text.sharding.events;

function scopeOf(args: Json): EventScope {
  return textArg(args, 'show') === 'every' ? 'every' : 'balancer';
}

/** The filter of **Show** and of the text: the namespace itself with a dot, else every collection of the database. */
export function eventsFilter(typed: string, scope: EventScope): Json {
  const name = typed.trim();
  const what = scope === 'balancer' ? { what: { $regex: balancerEvents } } : {};
  if (name === '') {
    return what;
  }
  return { ...what, ns: name.includes('.') ? name : { $regex: `^${escapeRegularExpression(name)}\\.` } };
}

function eventsCall(collection: string, filter: Json): ReturnType<typeof collectionCall> {
  return collectionCall({
    database: 'config',
    collection,
    method: 'find',
    arguments: [filter, { sort: { time: int(-1) }, limit: int(eventsAtMost) }],
    limit: eventsAtMost,
    timeLimitMs: clusterTimeLimitMs,
  });
}

/** Feature: monitor.read-sharding-events — `config.changelog`, and `config.actionlog` when no namespace is asked. */
export function request(_context: Context, args: Json): ReadRequest {
  const typed = textArg(args, 'text') ?? '';
  return engineRead(readConnection(args), [
    eventsCall('changelog', eventsFilter(typed, scopeOf(args))),
    ...(typed.trim() === '' ? [eventsCall('actionlog', {})] : []),
  ]);
}

function range(min: Json | undefined, max: Json | undefined): string {
  return min === undefined ? '' : `${shellText(min)} → ${shellText(max ?? null)}`;
}

function moveParts(details: JsonRecord): readonly string[] {
  const from = textOf(details['from']);
  const to = textOf(details['to']);
  const cloned = numberOf(recordOf(details['counts'])['cloned']);
  const note = textOf(details['note']);
  return [
    range(details['min'], details['max']),
    from === undefined && to === undefined ? '' : `${from ?? '?'} → ${to ?? '?'}`,
    cloned === undefined ? '' : words.documentsCopied(countText(cloned)),
    note !== undefined && note !== 'success' ? note : '',
  ];
}

function roundParts(details: JsonRecord): readonly string[] {
  const moved = numberOf(details['chunksMoved']);
  const candidates = numberOf(details['candidateChunks']);
  const time = numberOf(details['executionTimeMillis']);
  return [
    moved === undefined ? '' : counted(moved, words.chunkMoved, words.chunksMoved),
    candidates === undefined ? '' : counted(candidates, words.candidate, words.candidates),
    time === undefined ? '' : words.milliseconds(countText(time)),
  ];
}

function detailParts(what: string, details: JsonRecord): readonly string[] {
  if (/^(moveChunk|moveRange)/u.test(what)) {
    return moveParts(details);
  }
  switch (what) {
    case 'split': {
      const point = recordOf(details['left'])['max'];
      const before = recordOf(details['before']);
      return [point === undefined ? '' : words.at(shellText(point)), range(before['min'], before['max'])];
    }
    case 'multi-split': {
      const chunk = recordOf(details['chunk']);
      const number = numberOf(details['number']);
      const total = numberOf(details['of']);
      const of = words.of(number === undefined ? '?' : String(number), total === undefined ? '?' : String(total));
      return [of, range(chunk['min'], chunk['max'])];
    }
    case 'balancer.round':
      return roundParts(details);
    default:
      return Object.keys(details).length === 0 ? [] : [shellText(details)];
  }
}

function errorMessageOf(details: JsonRecord): string | undefined {
  const message = details['errmsg'] ?? details['errMsg'] ?? details['error'];
  if (message === undefined || message === null || message === '' || message === false) {
    return undefined;
  }
  return typeof message === 'string' ? message : shellText(message);
}

/** Whether an event is a failure: an `.error`, an error message, a migration not noted `success`, an error flag. */
function isFailure(what: string, details: JsonRecord, message: string | undefined): boolean {
  const note = textOf(details['note']);
  return (
    what.endsWith('.error') ||
    message !== undefined ||
    (/^moveChunk\.(from|to)$/u.test(what) && note !== undefined && note !== 'success') ||
    details['errorOccured'] === true ||
    details['errorOccurred'] === true
  );
}

/** An event, from an entry of `config.changelog` or of `config.actionlog`. */
export function shardingEvent(entry: Json, action = false): ShardingEvent {
  const fields = recordOf(entry);
  const details = recordOf(fields['details']);
  const what = textOf(fields['what']) ?? '';
  const message = errorMessageOf(details);
  const summary = [...detailParts(what, details), message ?? ''].filter((part) => part !== '').join(' · ');
  const shard = textOf(fields['shard']) ?? textOf(fields['server']);
  return {
    key: shellText(fields['_id'] ?? null),
    time: dateOf(fields['time']) ?? 0,
    what,
    namespace: textOf(fields['ns']) ?? '',
    ...(shard === undefined || shard === '' ? {} : { shard }),
    summary: clipped(summary),
    failure: isFailure(what, details, message),
    action,
    entry,
  };
}

/** Feature: monitor.read-sharding-events — the 100 most recent events, newest first, or the error of the read. */
export function parse(replies: readonly unknown[]): PartRead<readonly ShardingEvent[]> {
  const names = ['config.changelog', 'config.actionlog'];
  for (const [index, reply] of replies.entries()) {
    const failure = failureOf(reply);
    if (failure !== undefined) {
      const message = words.failed(names[index] ?? names[0] ?? '', shortMessage(failure.message));
      return { kind: 'failed', failure: { ...failure, message } };
    }
  }
  const [changes, actions] = replies;
  const events = [
    ...listOf(changes)
      .filter(isRecord)
      .map((entry) => shardingEvent(entry)),
    ...listOf(actions)
      .filter(isRecord)
      .map((entry) => shardingEvent(entry, true)),
  ];
  return { kind: 'read', value: [...events].sort((one, other) => other.time - one.time).slice(0, eventsAtMost) };
}
