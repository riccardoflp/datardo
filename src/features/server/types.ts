/**
 * What the features of the Server area share: the sections of the page, what a read of a part gives (its value, or the
 * sentence of `server.unavailable`), the controls the views return, and how the replies of Redis are read (bytes as
 * text, a map on RESP3 or a flat array on RESP2, numbers written as text).
 */
import type { Json, RedisRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { Target } from '../../shared/target';
import { groupThousands } from '../../shared/text-units';
import { sizeText } from '../connection/overview';
import { text } from './text';

export { sizeText };

/** The sections of the Server page, in the order of the section bar. */
export type ServerSection = 'overview' | 'clients' | 'slow-log' | 'memory' | 'replication' | 'configuration';

/** The sections in the order of the section bar. */
export const serverSections: readonly ServerSection[] = [
  'overview',
  'clients',
  'slow-log',
  'memory',
  'replication',
  'configuration',
];

/** How long the server may take for each command of the page, in ms (R9.2; Datardo's choice, as the tree's). */
export const serverTimeLimitMs = 5000;

/** The kinds of `server.unavailable`: the user lacks a permission, the server lacks the command, it is loading. */
export type UnavailableKind = 'not-allowed' | 'not-there' | 'loading' | 'other';

/** A command the server refused, as a part of the page says it (`server.unavailable`). */
export interface Unavailable {
  /** The command as the page sent it, with its subcommand and without its arguments: `CLIENT LIST`. */
  readonly command: string;
  readonly kind: UnavailableKind;
  readonly sentence: string;
  /** Whether the automatic refresh sends the command again; otherwise only **Refresh** and choosing the section do. */
  readonly retries: boolean;
}

/** What the read of one part of a section gave: its value, or the sentence of the command the server refused. */
export type PartRead<T> =
  { readonly kind: 'read'; readonly value: T } | { readonly kind: 'unavailable'; readonly unavailable: Unavailable };

/** A part that was read. */
export function readPart<T>(value: T): PartRead<T> {
  return { kind: 'read', value };
}

/** The value of a part, when it was read. */
export function valueOf<T>(part: PartRead<T> | undefined): T | undefined {
  return part?.kind === 'read' ? part.value : undefined;
}

/** The sentence of a part the server refused, for the error line of the part. */
export function sentenceOf(part: PartRead<unknown> | undefined): string | undefined {
  return part?.kind === 'unavailable' ? part.unavailable.sentence : undefined;
}

/** A name and its value, as the inspector island shows every field the server gave. */
export type NamedValue = readonly [string, string];

/** What the inspector island shows of the row or tile selected: every field with its value. */
export interface Inspection {
  readonly title: string;
  readonly fields: readonly NamedValue[];
}

/** How a number is colored: as the rest, or in the warning or the error color. */
export type Tone = 'ordinary' | 'warning' | 'error';

/** A line of a tile, with its color. */
export interface ToneLine {
  readonly text: string;
  readonly tone: Tone;
}

/** A control of the page: a feature it starts, or something the window does itself (copy a text). */
export type ServerControl =
  | {
      readonly kind: 'start';
      readonly label: string;
      /**
       * The control's identifier, written whole, as `data-feature` carries it; absent when the card of the feature it
       * starts lists no place for it here.
       */
      readonly element?: string;
      readonly feature: string;
      readonly target: Target;
      readonly args?: Json;
      readonly enabled: boolean;
      /** The sentence of its tooltip when it is disabled. */
      readonly disabledBecause?: string;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string };

/** A control that starts a feature. `element` is written whole by the caller, or `undefined` when it has none. */
export function startControl(
  label: string,
  element: string | undefined,
  feature: string,
  on: {
    readonly target: Target;
    readonly args?: Json;
    readonly disabledBecause?: string | undefined;
    /** Disabled with no sentence: while what it started runs. */
    readonly busy?: boolean;
  },
): ServerControl {
  return {
    kind: 'start',
    label,
    ...(element === undefined ? {} : { element }),
    feature,
    target: on.target,
    enabled: on.disabledBecause === undefined && on.busy !== true,
    ...(on.args === undefined ? {} : { args: on.args }),
    ...(on.disabledBecause === undefined ? {} : { disabledBecause: on.disabledBecause }),
  };
}

/** The target of a connection. */
export function connectionTarget(connection: ConnectionId): Target {
  return { kind: 'connection', connection };
}

/** A command of the page on the connection's ordinary client, in db0, with the page's time limit. */
export function serverCommand(...words: readonly (string | Uint8Array)[]): RedisRequest {
  return { ...redisCommand(0, ...words), timeLimitMs: serverTimeLimitMs };
}

const decoder = new TextDecoder();

/** A reply of text (bytes, or a string) as text; anything else as an empty text. */
export function textOf(reply: unknown): string {
  if (reply instanceof Uint8Array) {
    return decoder.decode(reply);
  }
  return typeof reply === 'string' ? reply : typeof reply === 'number' ? String(reply) : '';
}

/** Whether a value is an object (not an array, not bytes). */
export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

/**
 * The message of a request that failed, given to `parse` in place of its reply (`{ kind: 'error', message }`, as the
 * tree's reads take it), or an `Error`; `undefined` for a reply.
 */
export function failureOf(reply: unknown): string | undefined {
  if (reply instanceof Error) {
    return reply.message;
  }
  return isObject(reply) && reply['kind'] === 'error' && typeof reply['message'] === 'string'
    ? reply['message']
    : undefined;
}

/** The pairs of a reply of names and values: a map on RESP3, a flat array of names and values on RESP2. */
export function pairsOf(reply: unknown): readonly (readonly [string, unknown])[] {
  if (Array.isArray(reply)) {
    const items = reply as readonly unknown[];
    return items.flatMap((name, index) => (index % 2 === 0 ? [[textOf(name), items[index + 1]] as const] : []));
  }
  if (isObject(reply) && reply['kind'] === 'map' && Array.isArray(reply['entries'])) {
    const entries = reply['entries'] as readonly (readonly [unknown, unknown])[];
    return entries.map(([name, value]) => [textOf(name), value] as const);
  }
  return [];
}

/** A number of a reply: an integer or a double, or text that is a number (`63.42`, as RESP2 writes a double). */
export function numberOfReply(reply: unknown): number | undefined {
  if (typeof reply === 'number') {
    return reply;
  }
  return numberOfText(reply instanceof Uint8Array || typeof reply === 'string' ? textOf(reply) : undefined);
}

/** A number written as text, `-1`, `1.08`; `undefined` when it is missing or not a number. */
export function numberOfText(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+(\.\d+)?(e[+-]?\d+)?$/iu.test(value.trim())) {
    return undefined;
  }
  return Number(value);
}

/** The fields of the arguments of a read or of an intent, as an object. */
export function argsOf(args: unknown): Readonly<Record<string, unknown>> {
  return isObject(args) ? args : {};
}

/** A text field of the arguments, or the default. */
export function textArg(args: unknown, name: string, otherwise = ''): string {
  const value = argsOf(args)[name];
  return typeof value === 'string' ? value : otherwise;
}

/** A whole number field of the arguments, or the default. */
export function wholeArg(args: unknown, name: string, otherwise = 0): number {
  const value = argsOf(args)[name];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : otherwise;
}

/** The hexadecimal of bytes: how a key's name travels in the arguments of a read. */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The bytes of a hexadecimal text. */
export function bytesOfHex(hex: string): Uint8Array {
  const pairs = hex.match(/[0-9a-f]{2}/giu) ?? [];
  return Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16));
}

/** Bytes compared as bytes, the shorter first when one starts the other. */
export function compareBytes(one: Uint8Array, other: Uint8Array): number {
  const length = Math.min(one.length, other.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (one[index] ?? 0) - (other[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return one.length - other.length;
}

/** A number of bytes as a size (by 1,024, one decimal: `512 B`, `1.2 GB`), or `—` when it is missing. */
export function sizeOrMissing(bytes: number | undefined): string {
  return bytes === undefined ? text.missing : sizeText(bytes);
}

/** The tooltip of a size: *1,288,490,188 bytes*. */
export function bytesTooltip(bytes: number | undefined): string | undefined {
  return bytes === undefined ? undefined : text.bytes(groupThousands(bytes));
}

/** A count with a separator of thousands, or `—` when it is missing. */
export function countText(value: number | undefined): string {
  return value === undefined ? text.missing : groupThousands(value);
}

const timeUnits: readonly (readonly [number, string])[] = [
  [86_400, 'd'],
  [3600, 'h'],
  [60, 'min'],
  [1, 's'],
];

/**
 * A time in seconds with its two largest units among `d`, `h`, `min` and `s`: `3 d 5 h`, `4 h 12 min`, `12 min 5 s`,
 * `42 s`. A second unit of 0 is left out (`1 h`).
 */
export function timeText(seconds: number): string {
  let left = Math.max(0, Math.floor(seconds));
  const parts: string[] = [];
  for (const [size, unit] of timeUnits) {
    const count = Math.floor(left / size);
    left -= count * size;
    if (parts.length > 0 || count > 0) {
      parts.push(count > 0 ? `${groupThousands(count)} ${unit}` : '');
    }
  }
  const shown = parts.slice(0, 2).filter((part) => part !== '');
  return shown.length === 0 ? '0 s' : shown.join(' ');
}

/** A time in seconds, or `—` when it is missing. */
export function timeOrMissing(seconds: number | undefined): string {
  return seconds === undefined ? text.missing : timeText(seconds);
}

/** A percentage rounded to a whole number. */
export function wholePercent(value: number): number {
  return Math.round(value);
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The time of the day of an instant, as the toolbars write the time of the last read: `14:02:11`. */
export function clockText(milliseconds: number): string {
  const date = new Date(milliseconds);
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

/** The day of an instant, as the slow log writes it before the time of another day: `11-16`. */
export function dayText(milliseconds: number): string {
  const date = new Date(milliseconds);
  return `${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

/** Whether two instants are on the same day, where Datardo runs. */
export function isSameDay(one: number, other: number): boolean {
  const first = new Date(one);
  const second = new Date(other);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Whether a text holds another, without case: how the filters of the page look. */
export function holdsWithoutCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
