/**
 * Feature: value.read-list — reads the elements of a list a page at a time with `LRANGE`, from the head, from the
 * tail (shown last element first) or from an index, with `LLEN` in the same pipeline. A list has no filter: `LRANGE`
 * reads by place only, and a page shows what was at its indexes when it was read.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { refuse } from '../../shared/feature';
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
  textOf,
  type Word,
} from './types';

/** Where the pages of a list start. */
export type ListFrom = 'head' | 'tail' | 'index';

/** What a read of a list is started with. */
export interface ListArgs {
  readonly form: 'full' | 'compact';
  readonly from: ListFrom;
  /** The index typed in **Go to index**, for `from: 'index'`. */
  readonly index: string;
  /** The page from where the reading starts: 0 for the first. */
  readonly page: number;
}

/** The arguments of a read, from JSON. */
export function listArgs(args: Json): ListArgs {
  const fields = fieldsOf(args);
  const from = fields['from'];
  const page = fields['page'];
  return {
    form: fields['form'] === 'compact' ? 'compact' : 'full',
    from: from === 'tail' || from === 'index' ? from : 'head',
    index: textOf(fields['index'], '0'),
    page: typeof page === 'number' ? page : 0,
  };
}

/** An index typed as a whole number, negative from the tail; undefined when it is not one. */
export function indexOf(typed: string): number | undefined {
  return /^\s*-?\d+\s*$/u.test(typed) ? Number.parseInt(typed, 10) : undefined;
}

/** The first and last index `LRANGE` is sent, as Redis reads them (negative from the tail). */
export function listRange(asked: ListArgs, index: number): readonly [number, number] {
  if (asked.form === 'compact') {
    return [0, compactItems - 1];
  }
  if (asked.from === 'tail') {
    const stop = -(asked.page * pageSize) - 1;
    return [stop - pageSize + 1, stop];
  }
  const start = (asked.from === 'index' ? index : 0) + asked.page * pageSize;
  return start < 0 ? [start, Math.min(start + pageSize - 1, -1)] : [start, start + pageSize - 1];
}

/** Feature: value.read-list — `LLEN <key>` and `LRANGE <key> <start> <stop>`; an index that is not a whole number is refused. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = listArgs(args);
  const index = asked.from === 'index' ? indexOf(asked.index) : 0;
  if (index === undefined) {
    return refuse('value.read-list/invalid', readText.index);
  }
  const at = keyOf(context);
  const [start, stop] = listRange(asked, index);
  const commands: readonly (readonly Word[])[] = [
    ['LLEN', at.key],
    ['LRANGE', at.key, String(start), String(stop)],
  ];
  return engineRead(at, commands);
}

/** An element of a list with its index from the head, from 0. */
export interface ListElement {
  readonly index: number;
  readonly element: Uint8Array;
}

/** A page of a list: the length read with it, its elements in the order shown, and whether more can be loaded. */
export interface ListPage {
  readonly count: number;
  readonly elements: readonly ListElement[];
  readonly more: boolean;
  /** For **Go to index** beyond the ends: *No element at index 5000: the list has 1,204.* */
  readonly beyond?: string;
}

/** Feature: value.read-list — the elements with their indexes, from the head, counted from the `LLEN` read with them. */
export function parse(replies: readonly unknown[], args: Json = null): ListPage {
  const asked = listArgs(args);
  const index = indexOf(asked.index) ?? 0;
  const count = replyNumber(replies[0]) ?? 0;
  const [start] = listRange(asked, index);
  const first = start < 0 ? count + start : start;
  const read = replyItems(replies[1]).map((each, place) => ({
    index: Math.max(first, 0) + place,
    element: replyBytes(each) ?? new Uint8Array(),
  }));
  const elements = asked.from === 'tail' ? [...read].reverse() : read;
  const last = read.at(-1)?.index ?? first - 1;
  const more = asked.form === 'full' && (asked.from === 'tail' ? first > 0 : last + 1 < count);
  const beyond =
    asked.from === 'index' && asked.page === 0 && read.length === 0
      ? readText.noElementAt(asked.index.trim(), count)
      : undefined;
  return { count, elements, more, ...(beyond === undefined ? {} : { beyond }) };
}
