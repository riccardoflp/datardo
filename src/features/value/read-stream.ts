/**
 * Feature: value.read-stream — reads the entries of a stream a page at a time, newest first with `XREVRANGE` or
 * oldest first with `XRANGE`, all of them or those between two IDs or two dates, with `XLEN` in the same pipeline.
 * The next page starts after the last ID shown, left out with `(`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { shown } from './format';
import { readText } from './text';
import {
  compactItems,
  engineRead,
  fieldsOf,
  keyOf,
  pageSize,
  replyBytes,
  replyItems,
  replyNumber,
  replyText,
  textOf,
  type Word,
} from './types';

/** The order of the entries shown. */
export type StreamOrder = 'newest' | 'oldest';

/** What a read of a stream is started with. */
export interface StreamArgs {
  readonly form: 'full' | 'compact';
  readonly order: StreamOrder;
  /** **From** and **To** as typed; empty is the end of the stream. */
  readonly from: string;
  readonly to: string;
  /** The last ID shown, for **Load more**. */
  readonly after?: string;
}

/** The arguments of a read, from JSON. */
export function streamArgs(args: Json): StreamArgs {
  const fields = fieldsOf(args);
  const after = fields['after'];
  return {
    form: fields['form'] === 'compact' ? 'compact' : 'full',
    order: fields['order'] === 'oldest' ? 'oldest' : 'newest',
    from: textOf(fields['from']),
    to: textOf(fields['to']),
    ...(typeof after === 'string' ? { after } : {}),
  };
}

/** The first part of an ID before the year 2000 (946,684,800,000 ms, Datardo's choice) is not a time. */
export const earliestTime = 946_684_800_000;

/** Milliseconds since 1970 UTC of a date and time typed in the local time zone: `2026-11-18 12:00`. */
function localTime(typed: string): number | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/u.exec(typed);
  if (parts === null) {
    return undefined;
  }
  const [year, month, day, hours, minutes, seconds] = parts
    .slice(1)
    .map((part: string | undefined) => Number(part ?? '0'));
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, seconds ?? 0);
  return date.getMonth() === (month ?? 1) - 1 && date.getDate() === day ? date.getTime() : undefined;
}

/**
 * A bound as sent: an ID (`1700000000000-0`), the first part of one (`1700000000000`), or a date and time in the
 * local time zone as its milliseconds; `''` for the end of the stream; undefined when it is none of these.
 */
export function streamBound(typed: string): string | undefined {
  const text = typed.trim();
  if (text === '' || /^\d+(?:-\d+)?$/u.test(text)) {
    return text;
  }
  const time = localTime(text);
  return time === undefined ? undefined : String(time);
}

function rangeCommand(key: Uint8Array, asked: StreamArgs, from: string, to: string): readonly Word[] {
  const count = ['COUNT', String(asked.form === 'compact' ? compactItems : pageSize)];
  if (asked.form === 'compact') {
    return ['XREVRANGE', key, '+', '-', ...count];
  }
  const after = asked.after === undefined ? undefined : `(${asked.after}`;
  if (asked.order === 'newest') {
    return ['XREVRANGE', key, after ?? (to === '' ? '+' : to), from === '' ? '-' : from, ...count];
  }
  return ['XRANGE', key, after ?? (from === '' ? '-' : from), to === '' ? '+' : to, ...count];
}

/** Feature: value.read-stream — `XLEN <key>` and the page; a bound that is neither an ID nor a date is refused. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = streamArgs(args);
  const from = streamBound(asked.from);
  const to = streamBound(asked.to);
  if (from === undefined || to === undefined) {
    return refuse('value.read-stream/invalid', readText.streamBound);
  }
  const at = keyOf(context);
  return engineRead(at, [['XLEN', at.key], rangeCommand(at.key, asked, from, to)]);
}

/** An entry of a stream: its ID and its pairs, in their order, a name repeated as often as it is. */
export interface StreamEntry {
  readonly id: string;
  readonly fields: readonly (readonly [Uint8Array, Uint8Array])[];
}

/** A page of a stream. */
export interface StreamPage {
  readonly count: number;
  readonly entries: readonly StreamEntry[];
  readonly more: boolean;
}

/** The pairs of an entry: a flat list of names and values, or a map. */
function entryPairs(reply: unknown): readonly (readonly [Uint8Array, Uint8Array])[] {
  const map = fieldsOf(reply)['entries'];
  const flat = Array.isArray(map) ? (map as readonly unknown[]).flatMap((pair) => replyItems(pair)) : replyItems(reply);
  const pairs: (readonly [Uint8Array, Uint8Array])[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) {
    pairs.push([replyBytes(flat[index]) ?? new Uint8Array(), replyBytes(flat[index + 1]) ?? new Uint8Array()]);
  }
  return pairs;
}

/** The entries of a reply of `XRANGE` or `XREVRANGE`. */
export function streamEntries(reply: unknown): readonly StreamEntry[] {
  return replyItems(reply).map((entry) => {
    const [id, pairs] = replyItems(entry);
    return { id: replyText(id) ?? '', fields: entryPairs(pairs) };
  });
}

/** Feature: value.read-stream — the length and the entries, in the order shown. */
export function parse(replies: readonly unknown[], args: Json = null): StreamPage {
  const asked = streamArgs(args);
  const entries = streamEntries(replies[1]);
  return { count: replyNumber(replies[0]) ?? 0, entries, more: asked.form === 'full' && entries.length >= pageSize };
}

/** The arguments of **Load more**: the same read after the last ID shown. */
export function nextPage(asked: StreamArgs, page: StreamPage): StreamArgs | undefined {
  const last = page.entries.at(-1);
  return page.more && last !== undefined ? { ...asked, after: last.id } : undefined;
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

/** The **Time** column: the first part of the ID as a local date and time, or `—` before the year 2000. */
export function entryTime(id: string): string {
  const time = Number(id.split('-')[0]);
  if (!Number.isFinite(time) || time < earliestTime) {
    return '—';
  }
  const date = new Date(time);
  const day = `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** The **Fields** column: the pairs on one line, each part in its compact form: `type=signup user=7`. */
export function fieldsLine(entry: StreamEntry): string {
  return entry.fields
    .map(([name, value]) => `${shown(name, undefined, 'compact').text}=${shown(value, undefined, 'compact').text}`)
    .join(' ');
}
