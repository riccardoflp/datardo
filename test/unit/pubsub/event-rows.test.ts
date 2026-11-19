import { describe, expect, it } from 'vitest';
import { rebuiltRows, rowsAfter } from '../../../src/features/pubsub/event-rows';
import { view as inspect } from '../../../src/features/pubsub/inspect';
import { emptyKept, messagesAfter } from '../../../src/features/pubsub/keep';
import { oplogEvent } from '../../../src/features/pubsub/oplog-event';
import type { Arrived, Row } from '../../../src/features/pubsub/types';
import { messagesOf } from '../../../src/features/pubsub/types';
import { appLink, arrived, now, offset, pageOf } from './context';

const abc = '{"e":"u","d":{"_id":"abc"},"f":["qty"]}';
const xyz = '{"e":"u","d":{"_id":"xyz"},"f":["qty"]}';

/** The three messages of one update of `"abc"` of `orders`, from `at`, 1 ms apart. */
function threeOf(at: number, message = abc, id = 'abc'): readonly Arrived[] {
  return [
    arrived('app:orders', message, at),
    arrived('app:tenant1::orders', message, at + 1),
    arrived(`app:orders::${id}`, message, at + 2),
  ];
}

/** The rows of the messages, each made a row by rowsAfter in the order they arrive. */
function rowsOf(messages: readonly Arrived[]): readonly Row[] {
  let rows: readonly Row[] = [];
  messages.forEach((each, index) => {
    if (each.kind === 'message') {
      const message = { ...each, number: index + 1 };
      rows = rowsAfter(rows, { message, event: oplogEvent(message.channel, message.message, appLink) });
    }
  });
  return rows;
}

function channelCounts(rows: readonly Row[]): readonly number[] {
  return rows.map((row) => (row.kind === 'event' ? row.messages.length : 1));
}

describe('pubsub.event-rows', () => {
  it('makes the three messages of one event one row, with 3 channels', () => {
    expect(channelCounts(rowsOf(threeOf(now)))).toEqual([3]);
  });

  it('makes the same update made twice, 500 ms apart, 2 rows of 3 channels', () => {
    expect(channelCounts(rowsOf([...threeOf(now), ...threeOf(now + 500)]))).toEqual([3, 3]);
  });

  it('makes app:orders of two equal events, then app:orders::abc twice, 2 rows of 2 channels', () => {
    const messages = [
      arrived('app:orders', abc, now),
      arrived('app:orders', abc, now + 1),
      arrived('app:orders::abc', abc, now + 2),
      arrived('app:orders::abc', abc, now + 3),
    ];
    expect(channelCounts(rowsOf(messages))).toEqual([2, 2]);
  });

  it('makes app:orders, then app:orders::abc 3 seconds later, 2 rows of 1 channel', () => {
    expect(
      channelCounts(rowsOf([arrived('app:orders', abc, now), arrived('app:orders::abc', abc, now + 3000)])),
    ).toEqual([1, 1]);
  });

  it('keeps a message hello on app:news between the first and the second a row of its own', () => {
    const [first, second, third] = threeOf(now);
    const rows = rowsOf([first, arrived('app:news', 'hello', now), second, third].filter((each) => each !== undefined));
    expect(rows.map((row) => row.kind)).toEqual(['event', 'message']);
    expect(channelCounts(rows)).toEqual([3, 1]);
  });

  it('makes the events of "abc" and of "xyz", their messages interleaved, one row per document', () => {
    const one = threeOf(now);
    const other = threeOf(now, xyz, 'xyz');
    const interleaved = one.flatMap((each, index) => [each, other[index]]).filter((each) => each !== undefined);
    const rows = rowsOf(interleaved);
    expect(channelCounts(rows)).toEqual([3, 3]);
    expect(rows.map((row) => (row.kind === 'event' ? row.event.document : ''))).toEqual(['"abc"', '"xyz"']);
  });

  it('lists in the inspector island, for a row with 3 channels, the three channels with the time of each', () => {
    const kept = messagesAfter({ ...emptyKept, link: appLink }, threeOf(now));
    const shown = inspect({ page: pageOf({ kept, inspected: 1 }) });
    expect(shown?.kind === 'message' ? shown.channels?.items : undefined).toEqual([
      { channel: 'app:orders', received: '2025-11-17 18:20:00.000' },
      { channel: 'app:tenant1::orders', received: '2025-11-17 18:20:00.001' },
      { channel: 'app:orders::abc', received: '2025-11-17 18:20:00.002' },
    ]);
    expect(offset).toBe(60);
  });

  it('never makes more rows than messages, and puts every message in exactly one row', () => {
    const channels = ['app:orders', 'app:tenant1::orders', 'app:orders::abc', 'app:news', 'app:orders::xyz'];
    const messages = Array.from({ length: 200 }, (_, index) =>
      arrived(channels[(index * 7) % channels.length] ?? '', index % 3 === 0 ? xyz : abc, now + index * 97),
    );
    const rows = rowsOf(messages);
    expect(rows.length).toBeLessThanOrEqual(messages.length);
    expect(messagesOf(rows).map((each) => each.number)).toEqual(messages.map((_, index) => index + 1));
  });

  it('shows every message as its own row again with Events of off, in the order they arrived, and builds them again on', () => {
    const rows = rowsOf([...threeOf(now), arrived('app:news', 'hello', now + 10)]);
    const off = rebuiltRows(rows, undefined);
    expect(off.map((row) => [row.kind, row.number])).toEqual([
      ['message', 1],
      ['message', 2],
      ['message', 3],
      ['message', 4],
    ]);
    expect(channelCounts(rebuiltRows(off, appLink))).toEqual([3, 1]);
  });
});
