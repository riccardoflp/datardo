import { describe, expect, it } from 'vitest';
import { plan as copy } from '../../../src/features/pubsub/copy';
import { exportedText } from '../../../src/features/pubsub/export';
import {
  clearedKept,
  emptyKept,
  keptMost,
  keptWithLink,
  messagesAfter,
  pausedKept,
  resumedKept,
} from '../../../src/features/pubsub/keep';
import { view as messages } from '../../../src/features/pubsub/messages';
import type { Arrived, Kept, Row } from '../../../src/features/pubsub/types';
import { appLink, arrived, now, offset, pageOf, planOf, pubsubContext, pubsubState } from './context';

function numbers(rows: readonly Row[]): readonly number[] {
  return rows.map((row) => row.number);
}

function upTo(count: number): readonly Arrived[] {
  return Array.from({ length: count }, (_, index) => arrived('orders', `m${String(index + 1)}`, now + index));
}

/** The list with these numbers listed and held, as the examples write it, and the next number after them. */
function keptOf(listed: readonly number[], held: readonly number[], paused: boolean): Kept {
  const all = messagesAfter(emptyKept, upTo(Math.max(0, ...listed, ...held)), 100);
  const rows = all.listed;
  return {
    ...all,
    listed: rows.filter((row) => listed.includes(row.number)),
    held: rows.filter((row) => held.includes(row.number)),
    paused,
  };
}

const one = arrived('orders', 'x');

describe('pubsub.keep', () => {
  it('lists the message that arrives when not paused: listed 1, 2 and 3 arrives gives listed 1, 2, 3', () => {
    const after = messagesAfter(keptOf([1, 2], [], false), [one], 3);
    expect(numbers(after.listed)).toEqual([1, 2, 3]);
    expect(after.dropped).toBe(0);
  });

  it('drops the oldest beyond the limit: listed 1, 2, 3 and 4 arrives gives listed 2, 3, 4 and dropped 1', () => {
    const after = messagesAfter(keptOf([1, 2, 3], [], false), [one], 3);
    expect(numbers(after.listed)).toEqual([2, 3, 4]);
    expect(after.dropped).toBe(1);
  });

  it('holds what arrives while paused: listed 1, 2 and 3 arrives gives listed 1, 2 and held 3', () => {
    const after = messagesAfter(keptOf([1, 2], [], true), [one], 3);
    expect(numbers(after.listed)).toEqual([1, 2]);
    expect(numbers(after.held)).toEqual([3]);
  });

  it('drops from the list first: listed 1, 2, held 3 and 4 arrives gives listed 2, held 3, 4, dropped 1', () => {
    const after = messagesAfter(keptOf([1, 2], [3], true), [one], 3);
    expect(numbers(after.listed)).toEqual([2]);
    expect(numbers(after.held)).toEqual([3, 4]);
    expect(after.dropped).toBe(1);
  });

  it('moves the held messages to the list when resumed: listed 2, held 3, 4 gives listed 2, 3, 4', () => {
    const after = resumedKept(keptOf([2], [3, 4], true));
    expect(numbers(after.listed)).toEqual([2, 3, 4]);
    expect(after.held).toEqual([]);
    expect(after.paused).toBe(false);
  });

  it('drops from the held messages when the list is empty: held 3, 4, 5 and 6 arrives gives held 4, 5, 6', () => {
    const before = { ...keptOf([], [3, 4, 5], true), dropped: 2 };
    const after = messagesAfter(before, [one], 3);
    expect(numbers(after.held)).toEqual([4, 5, 6]);
    expect(after.dropped).toBe(3);
  });

  it('numbers each message from 1 with the time it was received, so that two equal messages stay two', () => {
    const after = messagesAfter(emptyKept, [arrived('orders', 'same', now), arrived('orders', 'same', now + 5)]);
    expect(after.listed).toEqual([
      expect.objectContaining({ number: 1, receivedAt: now }),
      expect.objectContaining({ number: 2, receivedAt: now + 5 }),
    ]);
  });

  it('drops the oldest with the 10,001st message, and the line under the table says so', () => {
    const full = messagesAfter(emptyKept, upTo(keptMost));
    expect(full.dropped).toBe(0);
    const after = messagesAfter(full, [one]);
    expect(after.listed).toHaveLength(10_000);
    expect(after.listed[0]?.number).toBe(2);
    const page = pageOf({ kept: after, subscriptions: [] });
    expect(messages({ page, now, range: { start: 0, count: 1 } }).dropped).toBe(
      'The list keeps the last 10,000 messages: 1 older one was dropped.',
    );
  });

  it('puts a message that was dropped in no export and in no copy', () => {
    const after = messagesAfter(keptOf([1, 2, 3], [], false), [arrived('orders', 'newest')], 3);
    const exported = exportedText(after.listed, 'jsonl', offset);
    expect(exported).not.toContain('"m1"');
    expect(exported).toContain('"newest"');
    const state = pubsubState([pageOf({ kept: after, selected: [1] })]);
    expect(
      planOf(copy(pubsubContext('pubsub.copy', state), { args: { variant: 'message', rows: [1] } })).steps,
    ).toEqual([]);
  });

  it('empties the list and the held messages on Clear, sets dropped to 0, and goes on numbering', () => {
    const cleared = clearedKept({ ...keptOf([1, 2], [3], true), dropped: 4 });
    expect(cleared).toEqual(expect.objectContaining({ listed: [], held: [], dropped: 0, paused: true }));
    expect(messagesAfter(cleared, [one]).held[0]?.number).toBe(4);
  });

  it('counts rows of events for the limit with Events of on', () => {
    const event = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
    const linked: Kept = { ...emptyKept, link: appLink };
    const after = messagesAfter(
      linked,
      [arrived('app:orders', event), arrived('app:tenant1::orders', event), arrived('app:orders::abc', event)],
      2,
    );
    expect(after.listed).toHaveLength(1);
    expect(after.dropped).toBe(0);
    expect(pausedKept(after).paused).toBe(true);
  });

  it('builds the rows again when Events of is turned on or off', () => {
    const event = '{"e":"i","d":{"_id":"abc"}}';
    const plain = messagesAfter(emptyKept, [arrived('app:orders', event), arrived('app:orders::abc', event)]);
    expect(plain.listed).toHaveLength(2);
    const linked = keptWithLink(plain, appLink);
    expect(linked.listed).toHaveLength(1);
    expect(linked.link).toEqual(appLink);
    const off = keptWithLink(linked, undefined);
    expect(numbers(off.listed)).toEqual([1, 2]);
    expect(off.link).toBeUndefined();
  });
});
