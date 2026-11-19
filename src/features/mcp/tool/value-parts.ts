/**
 * How `redis_read_value` reads a part of a value, by the key's type: the commands of the part, and the lines and the
 * `from` of the next part from their replies (`mcp.redis-key-tools`).
 */
import type { ConnectionRequest } from '../../../shared/engine-request';
import { groupThousands } from '../../../shared/text-units';
import { STRING_PART, counted } from '../output-limits';
import { ToolProblem } from './program';
import { keyText, redisCall, replyItems, replyNumber, replyText, utf8Text, valueText } from './redis';

/** What a part is read from: the key, where the part starts, how many items, and the pattern of a hash or a set. */
export interface PartAsked {
  readonly connection: ConnectionRequest['connection'];
  readonly database: number;
  readonly key: Uint8Array;
  readonly type: string;
  readonly from?: string;
  readonly count: number;
  readonly match?: string;
}

/** The lines of a part and where the next part starts, or that the value ends there. */
export interface PartRead {
  readonly head: string;
  readonly lines: readonly string[];
  readonly next?: string;
}

/** The most items of one page of a hash or a set that are shown. */
export const mostShown = 100;

const wholeSentence = 'from must be a whole number for a string, a list or a sorted set.';

function wholeFrom(asked: PartAsked): number {
  const from = asked.from ?? '0';
  if (!/^\d+$/u.test(from)) {
    throw new ToolProblem(wholeSentence);
  }
  return Number(from);
}

function cursorFrom(asked: PartAsked): string {
  const from = asked.from ?? '0';
  if (!/^\d+$/u.test(from)) {
    throw new ToolProblem('from must be the cursor of the next part, a whole number, for a hash or a set.');
  }
  return from;
}

function streamFrom(asked: PartAsked): string {
  const from = asked.from ?? '-';
  if (!/^(?:-|\(?\d+(?:-\d+)?)$/u.test(from)) {
    throw new ToolProblem('from must be an entry ID like 1700000000000-0 for a stream.');
  }
  return from;
}

/** The commands of the part, in the order {@link partOf} reads their replies. */
export function partRequests(asked: PartAsked): readonly ConnectionRequest[] {
  const call = (...words: readonly (string | Uint8Array)[]) => redisCall(asked.connection, asked.database, words);
  const { key, count } = asked;
  const match = asked.match === undefined ? [] : ['MATCH', asked.match];
  switch (asked.type) {
    case 'string': {
      const from = wholeFrom(asked);
      return [call('STRLEN', key), call('GETRANGE', key, String(from), String(from + STRING_PART - 1))];
    }
    case 'hash':
      return [call('HLEN', key), call('HSCAN', key, cursorFrom(asked), ...match, 'COUNT', String(count))];
    case 'set':
      return [call('SCARD', key), call('SSCAN', key, cursorFrom(asked), ...match, 'COUNT', String(count))];
    case 'list': {
      const from = wholeFrom(asked);
      return [call('LLEN', key), call('LRANGE', key, String(from), String(from + count - 1))];
    }
    case 'zset': {
      const from = wholeFrom(asked);
      return [call('ZCARD', key), call('ZRANGE', key, String(from), String(from + count - 1), 'WITHSCORES')];
    }
    default:
      return [call('XLEN', key), call('XRANGE', key, streamFrom(asked), '+', 'COUNT', String(count))];
  }
}

/** The length of the bytes that end before a character of several bytes cut at the end. */
export function wholeCharacters(bytes: Uint8Array): number {
  if (utf8Text(bytes) !== undefined) {
    return bytes.length;
  }
  for (let back = 1; back <= 3 && back < bytes.length; back += 1) {
    if (utf8Text(bytes.subarray(0, bytes.length - back)) !== undefined) {
      return bytes.length - back;
    }
  }
  return bytes.length;
}

function stringPart(asked: PartAsked, length: number, reply: unknown): PartRead {
  const from = wholeFrom(asked);
  const got = reply instanceof Uint8Array ? reply : new Uint8Array();
  const kept = from + got.length < length ? got.subarray(0, wholeCharacters(got)) : got;
  const last = from + kept.length - 1;
  const value = utf8Text(kept);
  const written = value === undefined ? valueText(kept) : JSON.stringify(value);
  return {
    head: `${keyText(asked.key)} (string, ${counted(length, 'byte')}), bytes ${groupThousands(from)}–${groupThousands(Math.max(from, last))}:`,
    lines: [written],
    ...(from + kept.length < length ? { next: String(from + kept.length) } : {}),
  };
}

function nameOf(reply: unknown): string {
  const text = reply instanceof Uint8Array ? utf8Text(reply) : undefined;
  return text === undefined ? valueText(reply instanceof Uint8Array ? reply : new Uint8Array()) : text;
}

function bytesOf(reply: unknown): Uint8Array {
  return reply instanceof Uint8Array ? reply : new TextEncoder().encode(replyText(reply));
}

function pairs(items: readonly unknown[]): readonly (readonly [unknown, unknown])[] {
  if (items.every((item) => Array.isArray(item))) {
    return items.map((item) => [replyItems(item)[0], replyItems(item)[1]] as const);
  }
  const result: (readonly [unknown, unknown])[] = [];
  for (let index = 0; index + 1 < items.length; index += 2) {
    result.push([items[index], items[index + 1]]);
  }
  return result;
}

function scanPart(asked: PartAsked, length: number, reply: unknown, word: string): PartRead {
  const [cursor, found] = replyItems(reply);
  const next = replyText(cursor);
  const lines =
    asked.type === 'hash'
      ? pairs(replyItems(found)).map(([field, value]) => `- ${nameOf(field)}: ${valueText(bytesOf(value))}`)
      : replyItems(found).map((member) => `- ${valueText(bytesOf(member))}`);
  const hidden = lines.length - mostShown;
  return {
    head: `${keyText(asked.key)} (${asked.type}, ${counted(length, word)}), from cursor ${cursorFrom(asked)}:`,
    lines: [
      ...lines.slice(0, mostShown),
      ...(hidden > 0 ? [`${groupThousands(hidden)} more in this page are not shown: narrow them with match.`] : []),
    ],
    ...(next === '0' || next === '' ? {} : { next }),
  };
}

function rangePart(asked: PartAsked, length: number, reply: unknown): PartRead {
  const from = wholeFrom(asked);
  const items = replyItems(reply);
  const lines =
    asked.type === 'list'
      ? items.map((item, index) => `- [${String(from + index)}] ${valueText(bytesOf(item))}`)
      : pairs(items).map(([member, score]) => `- ${valueText(bytesOf(member))} · score ${replyText(score)}`);
  const word = asked.type === 'list' ? 'element' : 'member';
  const shown = lines.length;
  return {
    head: `${keyText(asked.key)} (${asked.type}, ${counted(length, word)}), from ${groupThousands(from)}:`,
    lines,
    ...(from + shown < length && shown > 0 ? { next: String(from + shown) } : {}),
  };
}

function entryLine(entry: unknown): readonly [string, string] {
  const [id, fields] = replyItems(entry);
  const shown = pairs(replyItems(fields)).map(([field, value]) => `${nameOf(field)}: ${valueText(bytesOf(value))}`);
  return [replyText(id), `- ${replyText(id)}: { ${shown.join(', ')} }`];
}

function streamPart(asked: PartAsked, length: number, reply: unknown): PartRead {
  const entries = replyItems(reply).map(entryLine);
  const last = entries.at(-1)?.[0];
  return {
    head: `${keyText(asked.key)} (stream, ${counted(length, 'entry', 'entries')}), from ${streamFrom(asked)}:`,
    lines: entries.map(([, line]) => line),
    ...(entries.length === asked.count && last !== undefined ? { next: `(${last}` } : {}),
  };
}

/** The part, from the replies of {@link partRequests}. */
export function partOf(asked: PartAsked, replies: readonly unknown[]): PartRead {
  const length = replyNumber(replies[0]) ?? 0;
  const reply = replies[1];
  switch (asked.type) {
    case 'string':
      return stringPart(asked, length, reply);
    case 'hash':
      return scanPart(asked, length, reply, 'field');
    case 'set':
      return scanPart(asked, length, reply, 'member');
    case 'list':
    case 'zset':
      return rangePart(asked, length, reply);
    default:
      return streamPart(asked, length, reply);
  }
}
