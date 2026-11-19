/**
 * Feature: value.count — reads the size of a value in its own unit (bytes, fields, elements, members, entries), for
 * the key's lines and the notes of the pages. Sent in the same pipeline as the first page, and again after each write;
 * never while more pages are loaded.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { counted, itemWords, readText } from './text';
import { engineRead, fieldsOf, isValueType, keyOf, replyNumber, type KeyAt, type ValueType, type Word } from './types';

/** The command that counts each type. */
const counters: Readonly<Record<ValueType, string>> = {
  string: 'STRLEN',
  hash: 'HLEN',
  list: 'LLEN',
  set: 'SCARD',
  zset: 'ZCARD',
  stream: 'XLEN',
};

/** The command that counts the items of a key of a type: `HLEN user:7`. */
export function countCommand(at: KeyAt, type: ValueType): readonly Word[] {
  return [counters[type], at.key];
}

/** The type a Read of the area was started for: `args.type`. */
export function typeArg(args: Json): ValueType {
  const type = fieldsOf(args)['type'];
  if (typeof type !== 'string' || !isValueType(type)) {
    throw new Error(`A value of the type ${String(type)} has no count.`);
  }
  return type;
}

/** Feature: value.count — `STRLEN`, `HLEN`, `LLEN`, `SCARD`, `ZCARD` or `XLEN` by `args.type`. */
export function request(context: Context, args: Json): ReadRequest {
  const at = keyOf(context);
  return engineRead(at, [countCommand(at, typeArg(args))]);
}

/** What a count gives. */
export interface ValueCount {
  readonly count: number;
}

/** Feature: value.count — the number the server answered. */
export function parse(replies: readonly unknown[]): ValueCount {
  return { count: replyNumber(replies[0]) ?? 0 };
}

/** The count as the key's lines show it: **1,204 bytes**, **2 fields**, **1 element**, **1,000 entries**. */
export function countText(type: ValueType, count: number): string {
  const [one, many] = itemWords[type];
  return counted(count, one, many);
}

/** The note of a table with a filter: *38 fields found of 1,204*, *1 field found of 12*. */
export function foundText(type: ValueType, found: number, total: number): string {
  return readText.found(countText(type, found), countText(type, total).replace(/ \S+$/u, ''));
}

/** The note of the compact form: *First 20 of 1,204 fields.* */
export function firstItemsText(type: ValueType, shownCount: number, total: number): string {
  return readText.firstItems(shownCount, countText(type, total));
}
