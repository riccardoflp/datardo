/**
 * Feature: value.read-sorted-set — reads the members of a sorted set with their scores, by rank, a page at a time,
 * lowest or highest first, all of them or those in a range of scores, with `ZCARD` (and `ZCOUNT` for a range) in the
 * same pipeline. A server that refuses `REV` and `BYSCORE` in `ZRANGE` is read with the older commands.
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
  replyText,
  textOf,
  type Word,
} from './types';

/** The order of the members shown. */
export type ScoreOrder = 'lowest' | 'highest';

/** What a read of a sorted set is started with. */
export interface SortedSetArgs {
  readonly form: 'full' | 'compact';
  readonly order: ScoreOrder;
  /** **Min score** and **Max score** as typed; empty for none. */
  readonly min: string;
  readonly max: string;
  readonly page: number;
  /** Read with `ZREVRANGE`, `ZRANGEBYSCORE` and `ZREVRANGEBYSCORE`: the server refused `REV` or `BYSCORE`. */
  readonly older: boolean;
}

/** The arguments of a read, from JSON. */
export function sortedSetArgs(args: Json): SortedSetArgs {
  const fields = fieldsOf(args);
  const page = fields['page'];
  return {
    form: fields['form'] === 'compact' ? 'compact' : 'full',
    order: fields['order'] === 'highest' ? 'highest' : 'lowest',
    min: textOf(fields['min']),
    max: textOf(fields['max']),
    page: typeof page === 'number' ? page : 0,
    older: fields['older'] === true,
  };
}

const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

/** A bound as sent: a number, `-inf`, `+inf`, or `(` before a number to leave it out; empty is the end. */
export function scoreBound(typed: string, side: 'min' | 'max'): string | undefined {
  const text = typed.trim().toLowerCase();
  if (text === '') {
    return side === 'min' ? '-inf' : '+inf';
  }
  if (text === '-inf' || text === '+inf') {
    return text;
  }
  if (text === 'inf') {
    return '+inf';
  }
  const value = text.startsWith('(') ? text.slice(1) : text;
  return number.test(value) ? typed.trim() : undefined;
}

/** Whether the read has a range of scores: a bound was typed. */
export function hasRange(asked: SortedSetArgs): boolean {
  return asked.min.trim() !== '' || asked.max.trim() !== '';
}

function rankCommand(key: Uint8Array, asked: SortedSetArgs): readonly Word[] {
  const start = asked.form === 'compact' ? 0 : asked.page * pageSize;
  const stop = String(start + (asked.form === 'compact' ? compactItems : pageSize) - 1);
  if (asked.order === 'lowest') {
    return ['ZRANGE', key, String(start), stop, 'WITHSCORES'];
  }
  return asked.older
    ? ['ZREVRANGE', key, String(start), stop, 'WITHSCORES']
    : ['ZRANGE', key, String(start), stop, 'REV', 'WITHSCORES'];
}

function scoreCommand(key: Uint8Array, asked: SortedSetArgs, min: string, max: string): readonly Word[] {
  const limit = ['LIMIT', String(asked.page * pageSize), String(pageSize)];
  if (asked.older) {
    return asked.order === 'lowest'
      ? ['ZRANGEBYSCORE', key, min, max, 'WITHSCORES', ...limit]
      : ['ZREVRANGEBYSCORE', key, max, min, 'WITHSCORES', ...limit];
  }
  return asked.order === 'lowest'
    ? ['ZRANGE', key, min, max, 'BYSCORE', ...limit, 'WITHSCORES']
    : ['ZRANGE', key, max, min, 'BYSCORE', 'REV', ...limit, 'WITHSCORES'];
}

/** Feature: value.read-sorted-set — `ZCARD`, the page by rank or by score, and `ZCOUNT` for a range; a bad bound is refused. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const at = keyOf(context);
  const asked = sortedSetArgs(args);
  if (asked.form === 'compact' || !hasRange(asked)) {
    return engineRead(at, [['ZCARD', at.key], rankCommand(at.key, asked)]);
  }
  const min = scoreBound(asked.min, 'min');
  const max = scoreBound(asked.max, 'max');
  if (min === undefined || max === undefined) {
    return refuse('value.read-sorted-set/invalid', readText.scoreBound);
  }
  return engineRead(at, [['ZCARD', at.key], scoreCommand(at.key, asked, min, max), ['ZCOUNT', at.key, min, max]]);
}

/** A member with its score as the server writes it, and its rank in the order shown when there is no range. */
export interface ScoredMember {
  readonly member: Uint8Array;
  readonly score: string;
  readonly rank?: number;
}

/** A page of a sorted set. */
export interface SortedSetPage {
  readonly count: number;
  /** With a range of scores: how many members it holds (`ZCOUNT`). */
  readonly inRange?: number;
  readonly members: readonly ScoredMember[];
  readonly more: boolean;
}

/** A score as the server writes it: `1.5`, `3`, `inf`, `-inf`. */
export function scoreText(reply: unknown): string {
  if (typeof reply === 'number') {
    if (reply === Number.POSITIVE_INFINITY) {
      return 'inf';
    }
    return reply === Number.NEGATIVE_INFINITY ? '-inf' : String(reply);
  }
  return replyText(reply) ?? '';
}

/** The pairs of a reply `WITHSCORES`: pairs in RESP3, one flat list in RESP2. */
export function scoredPairs(reply: unknown): readonly (readonly [Uint8Array, string])[] {
  const items = replyItems(reply);
  if (items.every((each) => Array.isArray(each))) {
    return items.map((pair) => {
      const [member, score] = replyItems(pair);
      return [replyBytes(member) ?? new Uint8Array(), scoreText(score)] as const;
    });
  }
  const pairs: (readonly [Uint8Array, string])[] = [];
  for (let index = 0; index + 1 < items.length; index += 2) {
    pairs.push([replyBytes(items[index]) ?? new Uint8Array(), scoreText(items[index + 1])]);
  }
  return pairs;
}

/** Feature: value.read-sorted-set — the members with their scores, and their ranks without a range. */
export function parse(replies: readonly unknown[], args: Json = null): SortedSetPage {
  const asked = sortedSetArgs(args);
  const count = replyNumber(replies[0]) ?? 0;
  const ranged = asked.form === 'full' && hasRange(asked);
  const first = asked.form === 'compact' ? 0 : asked.page * pageSize;
  const members = scoredPairs(replies[1]).map(([member, score], place) =>
    ranged ? { member, score } : { member, score, rank: first + place },
  );
  const inRange = ranged ? replyNumber(replies[2]) : undefined;
  const total = inRange ?? count;
  const more = asked.form === 'full' && first + members.length < total && members.length > 0;
  return { count, ...(inRange === undefined ? {} : { inRange }), members, more };
}

/** The note of a range of scores: *38 members of 1,204*. */
export function rangeNote(page: SortedSetPage): string | undefined {
  return page.inRange === undefined ? undefined : readText.inScores(page.inRange, page.count);
}
