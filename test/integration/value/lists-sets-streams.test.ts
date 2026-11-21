/**
 * The values of lists, sets, sorted sets and streams against the test Redis (M15): each write runs through the runner
 * as the key tab starts it, with the arguments the window gives and its confirmation accepted, and the server is looked
 * at afterwards. Each runs on a key of 100,000 items, reading a page of it and not the whole value, and Undo
 * (`undo.last`) gives back the same `DUMP`. A read-only connection is refused before anything is sent. The reads give a
 * page at a time. The keys are `m15:it:*` in the databases 4 and 5 of a shared server.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ListPage } from '../../../src/features/value/read-list';
import type { SortedSetPage } from '../../../src/features/value/read-sorted-set';
import type { StreamPage } from '../../../src/features/value/read-stream';
import type { ScanPage } from '../../../src/features/value/read-hash';
import type { GroupsRead } from '../../../src/features/value/stream-groups';
import { hexOf } from '../../../src/features/value/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { cacheId, liveKeys, readOnlyId, type LiveKeys } from '../key/live';

const database = 4;
const other = 5;
const many = 100_000;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const hex = (value: string): Json => ({ hex: hexOf(bytes(value)) });
const typedText = (value: string): Json => ({ text: value, format: 'text' });
const onKey = (name: string, connection = cacheId): Target => ({ kind: 'key', connection, database, key: bytes(name) });
const marker = (): string => 'ab'.repeat(16);
let live: LiveKeys;

async function unlinkMatching(number: number, pattern: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = (await live.command(number, 'SCAN', cursor, 'MATCH', pattern, 'COUNT', '1000')) as [
      Uint8Array,
      Uint8Array[],
    ];
    if (keys.length > 0) {
      await live.command(number, 'UNLINK', ...keys);
    }
    cursor = new TextDecoder().decode(next);
  } while (cursor !== '0');
}

const text = (reply: unknown): string =>
  reply instanceof Uint8Array ? new TextDecoder().decode(reply) : String(reply);
const dump = async (name: string): Promise<string> => hexOf((await live.command(database, 'DUMP', name)) as Uint8Array);
const recorded = (): number => live.state().undo.entries.length;

/** Fills a key with 100,000 items on the server itself, in one script. */
async function fill(name: string, script: string): Promise<void> {
  await live.command(database, 'EVAL', `for i = 1, ${String(many)} do ${script} end`, '1', name);
}

async function undoLast(): Promise<void> {
  expect(await live.start('undo.last', { kind: 'app' }, null)).toEqual({ kind: 'done' });
}

/**
 * The value as it can be compared: its `DUMP`, or for a set its members in order, since a set restored keeps its members
 * in another order inside its table.
 */
async function valueOf(name: string): Promise<string> {
  if (text(await live.command(database, 'TYPE', name)) !== 'set') {
    return dump(name);
  }
  const members = (await live.command(database, 'SMEMBERS', name)) as Uint8Array[];
  return members.map(hexOf).sort().join(',');
}

/** Runs a write, then Undo, and says whether the key came back the same: its `DUMP`, or a set's members. */
async function writtenAndUndone(name: string, write: () => Promise<void>): Promise<void> {
  const before = await valueOf(name);
  await write();
  expect(await valueOf(name)).not.toBe(before);
  await undoLast();
  expect(await valueOf(name)).toBe(before);
}

async function read<T>(feature: string, name: string, args: Json): Promise<T> {
  const outcome = await live.start(feature, onKey(name), args, 'table');
  if (outcome.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(outcome)}`);
  }
  return outcome.result as T;
}

beforeAll(async () => {
  live = await liveKeys();
});

beforeEach(async () => {
  await unlinkMatching(database, 'm15:it:*');
  await unlinkMatching(other, 'm15:it:*');
  live.answers.length = 0;
  live.confirmed.length = 0;
});

afterAll(async () => {
  await unlinkMatching(database, 'm15:it:*');
  await unlinkMatching(other, 'm15:it:*');
  await live.close();
});

describe('value.read-list', () => {
  it('reads 200 elements of a list of 100,000 from the head, from the tail and from index 5000', async () => {
    await fill('m15:it:list', "redis.call('RPUSH', KEYS[1], 'e' .. i)");
    const head = await read<ListPage>('value.read-list', 'm15:it:list', {
      form: 'full',
      from: 'head',
      index: '0',
      page: 0,
    });
    expect([head.count, head.elements.length, head.more]).toEqual([many, 200, true]);
    expect(text(head.elements[0]?.element)).toBe('e1');
    const tail = await read<ListPage>('value.read-list', 'm15:it:list', {
      form: 'full',
      from: 'tail',
      index: '0',
      page: 0,
    });
    expect([tail.elements[0]?.index, text(tail.elements[0]?.element)]).toEqual([many - 1, 'e100000']);
    const at = await read<ListPage>('value.read-list', 'm15:it:list', {
      form: 'full',
      from: 'index',
      index: '5000',
      page: 0,
    });
    expect([at.elements[0]?.index, text(at.elements[0]?.element)]).toEqual([5000, 'e5001']);
  });
});

describe('value.read-set', () => {
  it('scans a set of 100,000 members a page at a time, with a filter', async () => {
    await fill('m15:it:set', "redis.call('SADD', KEYS[1], 'm' .. i)");
    const page = await read<ScanPage<Uint8Array>>('value.read-set', 'm15:it:set', {
      form: 'full',
      cursor: '0',
      filter: '',
    });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.length).toBeLessThan(1000);
    expect(page.cursor).not.toBe('0');
    const found = await read<ScanPage<Uint8Array>>('value.read-set', 'm15:it:set', {
      form: 'full',
      cursor: '0',
      filter: 'm99999',
    });
    expect(found.items.every((item) => text(item).startsWith('m99999'))).toBe(true);
  });
});

describe('value.read-sorted-set', () => {
  it('reads 200 members of 100,000 by rank, highest first, and a range of scores with its count', async () => {
    await fill('m15:it:zset', "redis.call('ZADD', KEYS[1], i, 'm' .. i)");
    const base = { form: 'full', order: 'lowest', min: '', max: '', page: 0, older: false };
    const lowest = await read<SortedSetPage>('value.read-sorted-set', 'm15:it:zset', base);
    expect([lowest.count, lowest.members.length, lowest.members[0]?.score]).toEqual([many, 200, '1']);
    const highest = await read<SortedSetPage>('value.read-sorted-set', 'm15:it:zset', { ...base, order: 'highest' });
    expect(highest.members[0]?.score).toBe('100000');
    const ranged = await read<SortedSetPage>('value.read-sorted-set', 'm15:it:zset', { ...base, min: '10', max: '19' });
    expect([ranged.inRange, ranged.members.length, ranged.members[0]?.rank]).toEqual([10, 10, undefined]);
  });
});

describe('value.read-stream', () => {
  it('reads the newest 200 entries of 100,000, then the next page, and Oldest first', async () => {
    await fill('m15:it:stream', "redis.call('XADD', KEYS[1], i .. '-1', 'n', i)");
    const base = { form: 'full', order: 'newest', from: '', to: '' };
    const newest = await read<StreamPage>('value.read-stream', 'm15:it:stream', base);
    expect([newest.count, newest.entries.length, newest.more, newest.entries[0]?.id]).toEqual([
      many,
      200,
      true,
      '100000-1',
    ]);
    const next = await read<StreamPage>('value.read-stream', 'm15:it:stream', { ...base, after: '99801-1' });
    expect(next.entries[0]?.id).toBe('99800-1');
    const oldest = await read<StreamPage>('value.read-stream', 'm15:it:stream', {
      ...base,
      order: 'oldest',
      from: '5',
    });
    expect(oldest.entries[0]?.id).toBe('5-1');
  });
});

describe('value.push-element', () => {
  it('pushes to the tail and to the head of a list of 100,000, and Undo gives back the same DUMP', async () => {
    await fill('m15:it:list', "redis.call('RPUSH', KEYS[1], 'e' .. i)");
    await writtenAndUndone('m15:it:list', async () => {
      const args = { element: typedText('welcome'), end: 'tail' };
      expect(await live.start('value.push-element', onKey('m15:it:list'), args, 'toolbar')).toEqual({ kind: 'done' });
      expect(text(await live.command(database, 'LINDEX', 'm15:it:list', '-1'))).toBe('welcome');
    });
    live.answers.push({ element: '00 ff', elementFormat: 'hex', end: 'head' });
    expect(await live.start('value.push-element', onKey('m15:it:list'), null, 'toolbar')).toEqual({ kind: 'done' });
    expect(hexOf((await live.command(database, 'LINDEX', 'm15:it:list', '0')) as Uint8Array)).toBe('00ff');
  });

  it('is refused on a read-only connection, and on a list deleted meanwhile', async () => {
    await live.command(database, 'RPUSH', 'm15:it:list', 'a');
    const args = { element: typedText('welcome'), end: 'tail' };
    expect(await live.start('value.push-element', onKey('m15:it:list', readOnlyId), args)).toMatchObject({
      kind: 'refused',
      code: 'value.push-element/read-only',
    });
    expect(await live.start('value.push-element', onKey('m15:it:gone'), args)).toMatchObject({
      kind: 'refused',
      code: 'value.push-element/gone',
    });
    expect(await live.command(database, 'LLEN', 'm15:it:list')).toBe(1);
    expect(await live.command(database, 'EXISTS', 'm15:it:gone')).toBe(0);
  });
});

describe('value.edit-element', () => {
  it('changes the element at index 50000 of 100,000, refuses one changed meanwhile, and Undo', async () => {
    await fill('m15:it:list', "redis.call('RPUSH', KEYS[1], 'e' .. i)");
    await writtenAndUndone('m15:it:list', async () => {
      const args = { index: 50000, loaded: hex('e50001'), value: typedText('changed') };
      expect(await live.start('value.edit-element', onKey('m15:it:list'), args, 'editor')).toEqual({ kind: 'done' });
      expect(text(await live.command(database, 'LINDEX', 'm15:it:list', '50000'))).toBe('changed');
    });
    const stale = { index: 3, loaded: hex('other'), value: typedText('x') };
    expect(await live.start('value.edit-element', onKey('m15:it:list'), stale, 'editor')).toMatchObject({
      kind: 'refused',
      code: 'value.edit-element/changed',
    });
    expect(await live.start('value.edit-element', onKey('m15:it:list', readOnlyId), stale)).toMatchObject({
      kind: 'refused',
      code: 'value.edit-element/read-only',
    });
  });
});

describe('value.remove-elements', () => {
  it('removes the rows at two indexes of 100,000, and only those of equal elements, and Undo', async () => {
    await fill('m15:it:list', "redis.call('RPUSH', KEYS[1], 'same')");
    await writtenAndUndone('m15:it:list', async () => {
      const args = {
        elements: [
          { index: 0, element: hex('same') },
          { index: 70000, element: hex('same') },
        ],
        marker: marker(),
      };
      expect(await live.start('value.remove-elements', onKey('m15:it:list'), args, 'selection-bar')).toEqual({
        kind: 'done',
      });
      expect(live.confirmed).toEqual(['Remove 2 elements from m15:it:list']);
      expect(await live.command(database, 'LLEN', 'm15:it:list')).toBe(many - 2);
      expect(await live.command(database, 'LPOS', 'm15:it:list', `__datardo_removed__:${marker()}`)).toBeNull();
    });
  });

  it('removes nothing when the element is no longer the one shown, and is refused on a read-only connection', async () => {
    await live.command(database, 'RPUSH', 'm15:it:list', 'a', 'b');
    const args = { elements: [{ index: 1, element: hex('c') }], marker: marker() };
    expect(await live.start('value.remove-elements', onKey('m15:it:list'), args, 'row-menu')).toMatchObject({
      kind: 'refused',
      code: 'value.remove-elements/changed',
    });
    expect(await live.start('value.remove-elements', onKey('m15:it:list', readOnlyId), args)).toMatchObject({
      kind: 'refused',
      code: 'value.remove-elements/read-only',
    });
    expect(await live.command(database, 'LLEN', 'm15:it:list')).toBe(2);
  });
});

describe('value.trim-list', () => {
  it('keeps the first 100 of 100,000 elements after its confirmation, and Undo', async () => {
    await fill('m15:it:list', "redis.call('RPUSH', KEYS[1], 'e' .. i)");
    await writtenAndUndone('m15:it:list', async () => {
      live.answers.push({ from: '0', to: '99' });
      expect(await live.start('value.trim-list', onKey('m15:it:list'), null, 'toolbar')).toEqual({ kind: 'done' });
      expect(live.confirmed).toEqual(['Trim m15:it:list to 0…99']);
      expect(await live.command(database, 'LLEN', 'm15:it:list')).toBe(100);
    });
    expect(
      await live.start('value.trim-list', onKey('m15:it:list', readOnlyId), { from: '0', to: '99' }),
    ).toMatchObject({
      kind: 'refused',
      code: 'value.trim-list/read-only',
    });
  });
});

describe('value.add-member', () => {
  it('adds a member to a set of 100,000, refuses one that is there, and Undo', async () => {
    await fill('m15:it:set', "redis.call('SADD', KEYS[1], 'm' .. i)");
    await writtenAndUndone('m15:it:set', async () => {
      live.answers.push({ member: 'redis', memberFormat: 'text' });
      expect(await live.start('value.add-member', onKey('m15:it:set'), null, 'toolbar')).toEqual({ kind: 'done' });
      expect(await live.command(database, 'SISMEMBER', 'm15:it:set', 'redis')).toBe(1);
    });
    expect(await live.start('value.add-member', onKey('m15:it:set'), { member: typedText('m7') })).toMatchObject({
      kind: 'refused',
      code: 'value.add-member/exists',
    });
    expect(
      await live.start('value.add-member', onKey('m15:it:set', readOnlyId), { member: typedText('x') }),
    ).toMatchObject({ kind: 'refused', code: 'value.add-member/read-only' });
  });
});

describe('value.remove-members', () => {
  it('removes two members of 100,000 with one SREM, deletes the key with its last one, and Undo', async () => {
    await fill('m15:it:set', "redis.call('SADD', KEYS[1], 'm' .. i)");
    await writtenAndUndone('m15:it:set', async () => {
      const args = { members: [hex('m1'), hex('m2')] };
      expect(await live.start('value.remove-members', onKey('m15:it:set'), args, 'selection-bar')).toEqual({
        kind: 'done',
      });
      expect(await live.command(database, 'SCARD', 'm15:it:set')).toBe(many - 2);
    });
    await live.command(database, 'SADD', 'm15:it:one', 'only');
    expect(await live.start('value.remove-members', onKey('m15:it:one'), { members: [hex('only')] })).toEqual({
      kind: 'done',
    });
    expect(await live.command(database, 'EXISTS', 'm15:it:one')).toBe(0);
    await undoLast();
    expect(await live.command(database, 'SISMEMBER', 'm15:it:one', 'only')).toBe(1);
    expect(
      await live.start('value.remove-members', onKey('m15:it:set', readOnlyId), { members: [hex('m1')] }),
    ).toMatchObject({ kind: 'refused', code: 'value.remove-members/read-only' });
  });
});

describe('value.add-scored-member', () => {
  it('adds a member with its score to a sorted set of 100,000, refuses one that is there, and Undo', async () => {
    await fill('m15:it:zset', "redis.call('ZADD', KEYS[1], i, 'm' .. i)");
    await writtenAndUndone('m15:it:zset', async () => {
      live.answers.push({ member: 'ada', memberFormat: 'text', score: '1.5' });
      expect(await live.start('value.add-scored-member', onKey('m15:it:zset'), null, 'toolbar')).toEqual({
        kind: 'done',
      });
      expect(text(await live.command(database, 'ZSCORE', 'm15:it:zset', 'ada'))).toBe('1.5');
    });
    const there = { member: typedText('m7'), score: '0' };
    expect(await live.start('value.add-scored-member', onKey('m15:it:zset'), there)).toMatchObject({
      kind: 'refused',
      code: 'value.add-scored-member/exists',
    });
    expect(await live.start('value.add-scored-member', onKey('m15:it:zset', readOnlyId), there)).toMatchObject({
      kind: 'refused',
      code: 'value.add-scored-member/read-only',
    });
  });
});

describe('value.change-score', () => {
  it('changes the score of a member of 100,000, refuses a member removed meanwhile, and Undo', async () => {
    await fill('m15:it:zset', "redis.call('ZADD', KEYS[1], i, 'm' .. i)");
    await writtenAndUndone('m15:it:zset', async () => {
      const args = { member: hex('m7'), loaded: '7', score: '2.5' };
      expect(await live.start('value.change-score', onKey('m15:it:zset'), args, 'editor')).toEqual({ kind: 'done' });
      expect(text(await live.command(database, 'ZSCORE', 'm15:it:zset', 'm7'))).toBe('2.5');
    });
    const gone = { member: hex('nobody'), loaded: '1', score: '2' };
    expect(await live.start('value.change-score', onKey('m15:it:zset'), gone, 'editor')).toMatchObject({
      kind: 'refused',
      code: 'value.change-score/gone-item',
    });
    expect(await live.command(database, 'ZSCORE', 'm15:it:zset', 'nobody')).toBeNull();
    const args = { member: hex('m7'), loaded: '7', score: '3' };
    expect(await live.start('value.change-score', onKey('m15:it:zset', readOnlyId), args)).toMatchObject({
      kind: 'refused',
      code: 'value.change-score/read-only',
    });
  });
});

describe('value.remove-scored-members', () => {
  it('removes two members of 100,000 with one ZREM, and Undo', async () => {
    await fill('m15:it:zset', "redis.call('ZADD', KEYS[1], i, 'm' .. i)");
    await writtenAndUndone('m15:it:zset', async () => {
      const args = { members: [hex('m1'), hex('m2')] };
      expect(await live.start('value.remove-scored-members', onKey('m15:it:zset'), args, 'row-menu')).toEqual({
        kind: 'done',
      });
      expect(await live.command(database, 'ZCARD', 'm15:it:zset')).toBe(many - 2);
    });
    expect(
      await live.start('value.remove-scored-members', onKey('m15:it:zset', readOnlyId), { members: [hex('m1')] }),
    ).toMatchObject({ kind: 'refused', code: 'value.remove-scored-members/read-only' });
  });
});

describe('value.add-entry', () => {
  it('adds an entry to a stream of 100,000 with *, refuses an ID not after the last one, and Undo', async () => {
    await fill('m15:it:stream', "redis.call('XADD', KEYS[1], i .. '-1', 'n', i)");
    await writtenAndUndone('m15:it:stream', async () => {
      const pairs = [{ field: typedText('type'), value: typedText('signup') }];
      expect(await live.start('value.add-entry', onKey('m15:it:stream'), { id: '*', pairs }, 'toolbar')).toEqual({
        kind: 'done',
      });
      expect(await live.command(database, 'XLEN', 'm15:it:stream')).toBe(many + 1);
    });
    const pairs = [{ field: typedText('type'), value: typedText('late') }];
    expect(await live.start('value.add-entry', onKey('m15:it:stream'), { id: '5-0', pairs })).toMatchObject({
      kind: 'refused',
      code: 'value.add-entry/invalid',
      message: 'The ID must be greater than the last one, 100000-1.',
    });
    expect(await live.start('value.add-entry', onKey('m15:it:stream'), { id: '200000-0', pairs }, 'row-menu')).toEqual({
      kind: 'done',
    });
    expect(await live.command(database, 'XLEN', 'm15:it:stream')).toBe(many + 1);
    expect(await live.start('value.add-entry', onKey('m15:it:stream', readOnlyId), { id: '*', pairs })).toMatchObject({
      kind: 'refused',
      code: 'value.add-entry/read-only',
    });
  });

  it('creates no stream when the key was deleted meanwhile', async () => {
    const pairs = [{ field: typedText('type'), value: typedText('signup') }];
    expect(await live.start('value.add-entry', onKey('m15:it:gone'), { id: '*', pairs })).toMatchObject({
      kind: 'refused',
      code: 'value.add-entry/gone',
    });
    expect(await live.command(database, 'EXISTS', 'm15:it:gone')).toBe(0);
  });
});

describe('value.delete-entries', () => {
  it('deletes two entries of 100,000 with one XDEL after its confirmation, and Undo', async () => {
    await fill('m15:it:stream', "redis.call('XADD', KEYS[1], i .. '-1', 'n', i)");
    await writtenAndUndone('m15:it:stream', async () => {
      const args = { ids: ['1-1', '2-1'] };
      expect(await live.start('value.delete-entries', onKey('m15:it:stream'), args, 'selection-bar')).toEqual({
        kind: 'done',
      });
      expect(live.confirmed).toEqual(['Delete 2 entries from m15:it:stream']);
      expect(await live.command(database, 'XLEN', 'm15:it:stream')).toBe(many - 2);
    });
    expect(
      await live.start('value.delete-entries', onKey('m15:it:stream', readOnlyId), { ids: ['1-1'] }),
    ).toMatchObject({
      kind: 'refused',
      code: 'value.delete-entries/read-only',
    });
  });
});

describe('value.trim-stream', () => {
  it('keeps the newest 1,000 of 100,000 entries, then those from an ID, and Undo', async () => {
    await fill('m15:it:stream', "redis.call('XADD', KEYS[1], i .. '-1', 'n', i)");
    await writtenAndUndone('m15:it:stream', async () => {
      live.answers.push({ by: 'newest', count: '1000' });
      expect(await live.start('value.trim-stream', onKey('m15:it:stream'), null, 'toolbar')).toEqual({ kind: 'done' });
      expect(live.confirmed).toEqual(['Trim m15:it:stream to 1,000 entries']);
      expect(await live.command(database, 'XLEN', 'm15:it:stream')).toBe(1000);
    });
    const from = { by: 'from', from: '99001-0' };
    expect(await live.start('value.trim-stream', onKey('m15:it:stream'), from, 'toolbar')).toEqual({ kind: 'done' });
    expect(await live.command(database, 'XLEN', 'm15:it:stream')).toBe(1000);
    expect(
      await live.start('value.trim-stream', onKey('m15:it:stream', readOnlyId), { by: 'newest', count: '10' }),
    ).toMatchObject({ kind: 'refused', code: 'value.trim-stream/read-only' });
  });
});

describe('value.stream-groups', () => {
  it('reads the groups of a stream, the consumers of one and its entries pending, and writes nothing', async () => {
    await fill('m15:it:stream', "redis.call('XADD', KEYS[1], i .. '-1', 'n', i)");
    await live.command(database, 'XGROUP', 'CREATE', 'm15:it:stream', 'mailers', '0');
    await live.command(
      database,
      'XREADGROUP',
      'GROUP',
      'mailers',
      'worker-1',
      'COUNT',
      '3',
      'STREAMS',
      'm15:it:stream',
      '>',
    );
    const before = recorded();
    const groups = await read<GroupsRead>('value.stream-groups', 'm15:it:stream', { part: 'groups', group: '' });
    expect(groups.part === 'groups' && [groups.stream.entries, groups.groups.map((group) => group.name)]).toEqual([
      many,
      ['mailers'],
    ]);
    const group = await read<GroupsRead>('value.stream-groups', 'm15:it:stream', { part: 'group', group: 'mailers' });
    expect(group.part === 'group' && [group.consumers.map((each) => each.name), group.pendingCount]).toEqual([
      ['worker-1'],
      3,
    ]);
    expect(group.part === 'group' && group.pending.map((each) => each.id)).toEqual(['1-1', '2-1', '3-1']);
    expect(recorded()).toBe(before);
  });
});
