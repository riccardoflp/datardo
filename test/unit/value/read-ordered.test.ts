import { describe, expect, it } from 'vitest';
import * as readList from '../../../src/features/value/read-list';
import * as readSortedSet from '../../../src/features/value/read-sorted-set';
import * as readStream from '../../../src/features/value/read-stream';
import { keyContext, readCommands, refusalOf, utf8 } from './context';
import { recordedRead } from './replies';

const text = (value: Uint8Array): string => new TextDecoder().decode(value);

describe('value.read-list', () => {
  const context = keyContext('value.read-list', { key: 'queue:mail' });

  it('opens with LLEN and LRANGE 0 199; Load more sends LRANGE 200 399', () => {
    expect(readCommands(readList.request(context, {}))).toEqual(['LLEN queue:mail', 'LRANGE queue:mail 0 199']);
    expect(readCommands(readList.request(context, { page: 1 }))).toEqual([
      'LLEN queue:mail',
      'LRANGE queue:mail 200 399',
    ]);
  });

  it('reads from the tail with LRANGE -200 -1, the last element first', () => {
    expect(readCommands(readList.request(context, { from: 'tail' }))).toEqual([
      'LLEN queue:mail',
      'LRANGE queue:mail -200 -1',
    ]);
    const elements = Array.from({ length: 200 }, (_, index) => utf8(String(1004 + index)));
    const page = readList.parse([1204, elements], { from: 'tail' });
    expect(page.elements[0]?.index).toBe(1203);
    expect(text(page.elements[0]?.element ?? new Uint8Array())).toBe('1203');
  });

  it('goes to index 5000 with LRANGE 5000 5199, and -1 shows the last element', () => {
    expect(readCommands(readList.request(context, { from: 'index', index: '5000' }))).toEqual([
      'LLEN queue:mail',
      'LRANGE queue:mail 5000 5199',
    ]);
    const last = recordedRead('list-index');
    expect(readList.parse([5, [utf8('x')]], { from: 'index', index: '-1' }).elements[0]?.index).toBe(4);
    expect(readList.parse(last.replies, last.args).elements.map((each) => each.index)).toEqual([2, 3, 4]);
  });

  it('says there is no element beyond the ends', () => {
    expect(readList.parse([1204, []], { from: 'index', index: '5000' }).beyond).toBe(
      'No element at index 5000: the list has 1,204.',
    );
  });

  it('refuses abc in Go to index', () => {
    expect(refusalOf(readList.request(context, { from: 'index', index: 'abc' }) as never)).toEqual({
      code: 'value.read-list/invalid',
      message: 'Enter an index, for example 0, 5000 or -1.',
    });
  });

  it('has no Load more on a list of 150 elements', () => {
    const elements = Array.from({ length: 150 }, () => utf8('x'));
    expect(readList.parse([150, elements], {}).more).toBe(false);
    expect(readList.parse([1204, Array.from({ length: 200 }, () => utf8('x'))], {}).more).toBe(true);
  });

  it('shows two equal elements as two rows, each with its index', () => {
    const head = recordedRead('list-head');
    const page = readList.parse(head.replies, head.args);
    expect(page.elements.map((each) => [each.index, text(each.element)]).slice(0, 4)).toEqual([
      [0, 'a'],
      [1, 'b'],
      [2, 'a'],
      [3, 'c'],
    ]);
    expect(Array.from(page.elements[4]?.element ?? [])).toEqual([0x00, 0xff]);
  });
});

describe('value.read-sorted-set', () => {
  const context = keyContext('value.read-sorted-set', { key: 'board' });

  it('opens with ZCARD and ZRANGE 0 199 WITHSCORES, the lowest score first', () => {
    expect(readCommands(readSortedSet.request(context, {}))).toEqual(['ZCARD board', 'ZRANGE board 0 199 WITHSCORES']);
    const lowest = recordedRead('zset-lowest');
    const page = readSortedSet.parse(lowest.replies, lowest.args);
    expect(page.members.map((each) => [text(each.member), each.score, each.rank])).toEqual([
      ['dave', '-inf', 0],
      ['bob', '2.5', 1],
      ['alice', '10', 2],
      ['carol', 'inf', 3],
    ]);
  });

  it('reads Highest first with REV', () => {
    expect(readCommands(readSortedSet.request(context, { order: 'highest' }))).toEqual([
      'ZCARD board',
      'ZRANGE board 0 199 REV WITHSCORES',
    ]);
    const highest = recordedRead('zset-highest');
    expect(readSortedSet.parse(highest.replies, highest.args).members[0]?.score).toBe('inf');
  });

  it('reads a range of scores with BYSCORE and ZCOUNT, lowest and highest first', () => {
    expect(readCommands(readSortedSet.request(context, { min: '10', max: '(20' }))).toEqual([
      'ZCARD board',
      'ZRANGE board 10 (20 BYSCORE LIMIT 0 200 WITHSCORES',
      'ZCOUNT board 10 (20',
    ]);
    expect(readCommands(readSortedSet.request(context, { min: '10', max: '(20', order: 'highest' }))[1]).toBe(
      'ZRANGE board (20 10 BYSCORE REV LIMIT 0 200 WITHSCORES',
    );
  });

  it('reads only Min score 10 as 10 +inf, without a Rank', () => {
    expect(readCommands(readSortedSet.request(context, { min: '10' }))[1]).toBe(
      'ZRANGE board 10 +inf BYSCORE LIMIT 0 200 WITHSCORES',
    );
    const range = recordedRead('zset-range');
    const page = readSortedSet.parse(range.replies, range.args);
    expect(page.inRange).toBe(3);
    expect(page.members.every((each) => each.rank === undefined)).toBe(true);
    expect(readSortedSet.rangeNote(page)).toBe('3 members of 4');
  });

  it('refuses ten in Min score', () => {
    expect(refusalOf(readSortedSet.request(context, { min: 'ten' }) as never)).toEqual({
      code: 'value.read-sorted-set/invalid',
      message: 'Enter a number, -inf or +inf; put ( before it to leave it out.',
    });
  });

  it('reads with ZREVRANGE on a server that refused REV', () => {
    const older = recordedRead('zset-older');
    expect(readCommands(readSortedSet.request(context, older.args))[1]).toBe('ZREVRANGE board 0 199 WITHSCORES');
    expect(readSortedSet.parse(older.replies, older.args).members.map((each) => text(each.member))).toEqual([
      'carol',
      'alice',
      'bob',
      'dave',
    ]);
  });
});

describe('value.read-stream', () => {
  const context = keyContext('value.read-stream', { key: 'events' });

  it('opens with XLEN and XREVRANGE + - COUNT 200, the newest entry first', () => {
    expect(readCommands(readStream.request(context, {}))).toEqual(['XLEN events', 'XREVRANGE events + - COUNT 200']);
    const newest = recordedRead('stream-newest');
    const page = readStream.parse(newest.replies, newest.args);
    expect(page.count).toBe(3);
    expect(page.entries.map((each) => each.id)).toEqual(['1763400000002-0', '1763400000001-0', '1763400000000-0']);
  });

  it('loads more after the last ID shown', () => {
    expect(readCommands(readStream.request(context, { after: '1700000000000-0' }))[1]).toBe(
      'XREVRANGE events (1700000000000-0 - COUNT 200',
    );
  });

  it('reads Oldest first with XRANGE, and From 1700000000000', () => {
    expect(readCommands(readStream.request(context, { order: 'oldest' }))[1]).toBe('XRANGE events - + COUNT 200');
    expect(readCommands(readStream.request(context, { order: 'oldest', from: '1700000000000' }))[1]).toBe(
      'XRANGE events 1700000000000 + COUNT 200',
    );
    const oldest = recordedRead('stream-oldest');
    expect(readStream.parse(oldest.replies, oldest.args).entries[0]?.id).toBe('1763400000000-0');
  });

  it('shows the time of an ID in the local time zone, and — before the year 2000', () => {
    const date = new Date(1_700_000_000_000);
    const two = (value: number): string => String(value).padStart(2, '0');
    const local = `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
    expect(readStream.entryTime('1700000000000-0')).toBe(local);
    expect(readStream.entryTime('5-0')).toBe('—');
  });

  it('shows type=signup user=7 in Fields', () => {
    const entry = { id: '1-0', fields: [[utf8('type'), utf8('signup')] as const, [utf8('user'), utf8('7')] as const] };
    expect(readStream.fieldsLine(entry)).toBe('type=signup user=7');
  });

  it('refuses a bound that is neither an ID nor a date', () => {
    expect(refusalOf(readStream.request(context, { from: 'yesterday' }) as never)).toEqual({
      code: 'value.read-stream/invalid',
      message: 'Enter an ID, for example 1700000000000-0, or a date and time.',
    });
  });
});
