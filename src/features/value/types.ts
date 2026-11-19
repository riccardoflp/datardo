/**
 * What the cards of the value area share: the types of values, the key a feature was started on, bytes read as UTF-8,
 * the requests and steps of a key, the replies of Redis read as bytes and numbers, and what the undo history keeps.
 * Bytes are never assumed to be text (R5.5).
 */
import type { ConnectionView } from '../../shared/connection';
import type { ConnectionRequest, Json, RedisRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { After, Context, EngineStep, ReadRequest, Undo } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import type { Target } from '../../shared/target';
import { isVersionAtLeast } from '../connection/server-info';
import { quoted } from './quote';
import { byteUnits, characterLength, type ByteUnit } from '../../shared/utf8';

export { byteUnits, characterLength, type ByteUnit };

/** The six types whose values Datardo shows; `zset` is a sorted set. */
export type ValueType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

/** The six types, in the order the cards list them. */
export const valueTypes: readonly ValueType[] = ['string', 'hash', 'list', 'set', 'zset', 'stream'];

/** Whether `TYPE` answered one of the six types (not `none`, not a module's type). */
export function isValueType(type: string): type is ValueType {
  return (valueTypes as readonly string[]).includes(type);
}

/** A page is 200 items (Datardo's choice). */
export const pageSize = 200;

/** The compact form shows the first 20 items (Datardo's choice). */
export const compactItems = 20;

/** How long the server has to answer each command of this area, in ms (R9.2; Datardo's choice). */
export const timeLimitMs = 10_000;

/** A command writes at most 500 names, members or IDs (Datardo's choice). */
export const namesPerCommand = 500;

/** The key a feature of this area was started on: its connection, its database and its name as bytes. */
export interface KeyAt {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly key: Uint8Array;
}

/** The key of a target, when the target is a key. */
export function keyAt(target: Target): KeyAt | undefined {
  return target.kind === 'key'
    ? { connection: target.connection, database: target.database, key: target.key }
    : undefined;
}

/** The key a feature was started on; a feature of this area is only ever started on a key. */
export function keyOf(context: Context): KeyAt {
  const at = keyAt(context.target);
  if (at === undefined) {
    throw new Error(`${context.feature} is started on a key.`);
  }
  return at;
}

/** A word of a command: text sent as UTF-8, or bytes. */
export type Word = string | Uint8Array;

/** A command to the key's database, with the area's time limit. */
export function keyCommand(at: KeyAt, words: readonly Word[]): RedisRequest {
  return { ...redisCommand(at.database, ...words), timeLimitMs };
}

/** The commands of a Read, in the order its `parse` reads the replies. */
export function engineRead(at: KeyAt, commands: readonly (readonly Word[])[]): ReadRequest {
  const requests: ConnectionRequest[] = commands.map((words) => ({
    connection: at.connection,
    request: keyCommand(at, words),
  }));
  return { kind: 'engine', requests };
}

/** The text of a command as a step shows it: each word by `value.quote`. */
export function commandText(words: readonly Word[]): string {
  return words.map((word) => quoted(typeof word === 'string' ? utf8(word) : word, 'step')).join(' ');
}

/** A step that writes to the key's database. */
export function writeStep(at: KeyAt, words: readonly Word[]): EngineStep {
  return {
    kind: 'engine',
    text: commandText(words),
    writes: true,
    connection: at.connection,
    request: keyCommand(at, words),
  };
}

/** Text as UTF-8 bytes. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Whether two values have the same bytes. */
export function isSameBytes(one: Uint8Array, other: Uint8Array): boolean {
  return one.length === other.length && one.every((byte, index) => byte === other[index]);
}

/** Whether the bytes are strictly valid UTF-8. */
export function isUtf8(bytes: Uint8Array): boolean {
  return byteUnits(bytes).every((unit) => unit.kind === 'character');
}

/** A control character other than tab, line feed and carriage return: it reads as text and is not. */
export function isControl(codePoint: number): boolean {
  return (
    (codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
    (codePoint >= 0x7f && codePoint <= 0x9f)
  );
}

/** UTF-8 as text; a byte that starts no character is `�`. */
export function utf8Text(bytes: Uint8Array): string {
  return byteUnits(bytes)
    .map((unit) => (unit.kind === 'byte' ? '�' : String.fromCodePoint(unit.codePoint)))
    .join('');
}

/** The bytes without the start of a character that the end of a part cuts (at most 3 bytes). */
export function withoutCutCharacter(bytes: Uint8Array): Uint8Array {
  for (let back = 1; back <= Math.min(3, bytes.length); back += 1) {
    const byte = bytes[bytes.length - back] ?? 0;
    if ((byte & 0xc0) !== 0x80) {
      const wanted = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1;
      return wanted > back ? bytes.subarray(0, bytes.length - back) : bytes;
    }
  }
  return bytes;
}

/** A name in a message: its text when it is UTF-8 without control characters, each other byte as `\xNN`. */
export function nameText(bytes: Uint8Array): string {
  return byteUnits(bytes)
    .map((unit) =>
      unit.kind === 'byte' || isControl(unit.codePoint)
        ? Array.from(bytes.subarray(unit.start, unit.start + (unit.kind === 'byte' ? 1 : unit.length)), hexEscape).join(
            '',
          )
        : String.fromCodePoint(unit.codePoint),
    )
    .join('');
}

function hexEscape(byte: number): string {
  return `\\x${byte.toString(16).padStart(2, '0')}`;
}

/** Bytes as hexadecimal digits, the form bytes take inside JSON (`TabShows.keyHex`). */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Bytes written as hexadecimal digits inside JSON: `{ hex: '00ff' }`. */
export function bytesJson(bytes: Uint8Array): Json {
  return { hex: hexOf(bytes) };
}

/** Bytes from an answer or an argument: bytes as they are, or `{ hex }`; undefined for anything else. */
export function bytesOf(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) {
    return value;
  }
  const hex = fieldsOf(value)['hex'];
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})*$/iu.test(hex)) {
    return undefined;
  }
  return Uint8Array.from(hex.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The fields of an object given as an answer or an argument; none for anything else. */
export function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

/** A text of an answer or an argument, or `otherwise`. */
export function textOf(value: unknown, otherwise = ''): string {
  return typeof value === 'string' ? value : otherwise;
}

/** The bytes of a reply: a bulk string, or a number written as Redis writes it. */
export function replyBytes(reply: unknown): Uint8Array | undefined {
  if (reply instanceof Uint8Array) {
    return reply;
  }
  return typeof reply === 'number' ? utf8(String(reply)) : undefined;
}

/** The text of a reply that is text (a status, a cursor, a type, an ID). */
export function replyText(reply: unknown): string | undefined {
  if (reply instanceof Uint8Array) {
    return new TextDecoder().decode(reply);
  }
  return typeof reply === 'number' || typeof reply === 'string' ? String(reply) : undefined;
}

/** The number of a reply: an integer, or a number written as text (RESP2). */
export function replyNumber(reply: unknown): number | undefined {
  const value = typeof reply === 'number' ? reply : Number(replyText(reply) ?? Number.NaN);
  return Number.isNaN(value) ? undefined : value;
}

/** The items of a reply that is an array; none for anything else. */
export function replyItems(reply: unknown): readonly unknown[] {
  return Array.isArray(reply) ? (reply as readonly unknown[]) : [];
}

/** The saved connection of a key, and what the server is. */
export function connectionOfKey(context: Context, at: KeyAt): ConnectionView | undefined {
  return savedConnection(context.state.connections, at.connection);
}

/** Whether the server of the key is at least this version; true while the version is not known. */
export function serverIsAtLeast(context: Context, at: KeyAt, least: readonly number[]): boolean {
  const server = context.state.connections.live[at.connection]?.server;
  return server?.engine !== 'redis' || server.redisVersion === '' || isVersionAtLeast(server.redisVersion, least);
}

/** The Redis version that has `HPTTL` and `HPEXPIRE`: an expiry for each field of a hash. */
export const fieldExpiryVersion: readonly number[] = [7, 4];

/**
 * What is typed in **Filter fields** or **Filter members** as a pattern, as `key.pattern` makes one: empty is no
 * filter; a text with `*`, `?`, `[` or `\` is a pattern as typed; any other text is found anywhere, `*<text>*`.
 */
export function filterPattern(typed: string): string | undefined {
  if (typed === '') {
    return undefined;
  }
  return /[*?[\\]/u.test(typed) ? typed : `*${typed}*`;
}

/** What the undo history keeps before a write of this area: the whole key, by `DUMP` and `PTTL` (`undo.record`). */
export function keyKept(at: KeyAt, title: string): Undo {
  return { keeps: { kind: 'redis-keys', title, database: at.database, keys: [hexOf(at.key)] } };
}

/** What follows every write of this area: the view reads the count and the page again. */
export function readAgain(at: KeyAt): After {
  return { kind: 'refresh', connection: at.connection };
}

/** The words split into commands of at most 500 items each, after the words every command starts with. */
export function inCommands(start: readonly Word[], items: readonly Word[]): readonly (readonly Word[])[] {
  const commands: (readonly Word[])[] = [];
  for (let index = 0; index < items.length; index += namesPerCommand) {
    commands.push([...start, ...items.slice(index, index + namesPerCommand)]);
  }
  return commands;
}
