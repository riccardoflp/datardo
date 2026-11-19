/**
 * Feature: key.export-text
 *
 * The format of an exported key (D37): the Redis commands that create it again, one a line, with its type, its bytes
 * and its expiry, every argument written by `value.quote`, so that Datardo and `redis-cli` read the same bytes back.
 */
import type { KeyName } from './types';
import { quoted } from './types';

/** A pair of a field and a value, of a hash or of a stream's entry. */
export type BytePair = readonly [Uint8Array, Uint8Array];

/** An entry of a stream: its ID (`1700000000000-0`) and its fields. */
export interface StreamEntry {
  readonly id: string;
  readonly fields: readonly BytePair[];
}

/** The value of a key, its items in the order the server gave them. */
export type ExportedValue =
  | { readonly type: 'string'; readonly bytes: Uint8Array }
  | { readonly type: 'hash'; readonly pairs: readonly BytePair[] }
  | { readonly type: 'list'; readonly elements: readonly Uint8Array[] }
  | { readonly type: 'set'; readonly members: readonly Uint8Array[] }
  /** Each member with its score as the server gave it: `1.5`, `3`, `inf`, `-inf`. */
  | { readonly type: 'zset'; readonly members: readonly (readonly [Uint8Array, string])[] }
  | { readonly type: 'stream'; readonly entries: readonly StreamEntry[] }
  /** What `DUMP` answered, for a key of a module's type and a stream without entries. */
  | { readonly type: 'dump'; readonly payload: Uint8Array };

/** One key to export. */
export interface ExportedKey {
  readonly name: KeyName;
  readonly value: ExportedValue;
  /** The date of expiry in milliseconds since 1970 UTC; absent for a persistent key. */
  readonly expiresAt?: number;
}

/** A string longer than this is written as `SET` and `APPEND` parts of this size (Datardo's choice). */
export const stringPart = 1_048_576;

/** At most this many pairs, elements or members a line (Datardo's choice). */
export const itemsPerLine = 100;

const encoder = new TextEncoder();

function line(words: readonly (string | Uint8Array)[]): string {
  return words.map((word) => (typeof word === 'string' ? word : quoted(word))).join(' ');
}

function inLines<Item>(
  items: readonly Item[],
  head: readonly (string | Uint8Array)[],
  words: (item: Item) => readonly (string | Uint8Array)[],
): readonly string[] {
  const lines: string[] = [];
  for (let start = 0; start < items.length; start += itemsPerLine) {
    lines.push(line([...head, ...items.slice(start, start + itemsPerLine).flatMap(words)]));
  }
  return lines;
}

function stringLines(name: KeyName, bytes: Uint8Array): readonly string[] {
  const lines = [line(['SET', name, bytes.subarray(0, stringPart)])];
  for (let start = stringPart; start < bytes.length; start += stringPart) {
    lines.push(line(['APPEND', name, bytes.subarray(start, start + stringPart)]));
  }
  return lines;
}

function valueLines(name: KeyName, value: ExportedValue): readonly string[] {
  switch (value.type) {
    case 'string':
      return stringLines(name, value.bytes);
    case 'hash':
      return inLines(value.pairs, ['HSET', name], ([field, each]) => [field, each]);
    case 'list':
      return inLines(value.elements, ['RPUSH', name], (element) => [element]);
    case 'set':
      return inLines(value.members, ['SADD', name], (member) => [member]);
    case 'zset':
      return inLines(value.members, ['ZADD', name], ([member, score]) => [encoder.encode(score), member]);
    case 'stream':
      return value.entries.map((entry) =>
        line(['XADD', name, encoder.encode(entry.id), ...entry.fields.flatMap(([field, each]) => [field, each])]),
      );
    case 'dump':
      return [line(['RESTORE', name, '0', value.payload])];
  }
}

/** A score as the server gives it in RESP3, a number, written as `ZADD` reads it back: `1.5`, `3`, `inf`, `-inf`. */
export function scoreText(score: number): string {
  if (Number.isNaN(score)) {
    return 'nan';
  }
  return score === Number.POSITIVE_INFINITY ? 'inf' : score === Number.NEGATIVE_INFINITY ? '-inf' : String(score);
}

/**
 * Feature: key.export-text — the lines of one key: its value as `SET`, `HSET`, `RPUSH`, `SADD`, `ZADD`, `XADD` or
 * `RESTORE` lines, then `PEXPIREAT` when it has an expiry.
 */
export function exportText(key: ExportedKey): readonly string[] {
  const lines = valueLines(key.name, key.value);
  return key.expiresAt === undefined ? lines : [...lines, line(['PEXPIREAT', key.name, String(key.expiresAt)])];
}

/** The text of a file of keys, in the order given: UTF-8, a line feed after each line, no heading. */
export function exportFileText(keys: readonly ExportedKey[]): string {
  return keys
    .map((key) =>
      exportText(key)
        .map((each) => `${each}\n`)
        .join(''),
    )
    .join('');
}
