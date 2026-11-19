import { describe, expect, it } from 'vitest';
import { afterReply, plan } from '../../../src/features/key/new';
import { hexOf } from '../../../src/features/key/types';
import {
  cache,
  cacheReadOnly,
  commandsOf,
  connected,
  keyContext,
  name,
  onDatabase,
  planOf,
  recordedReplies,
  undoNames,
} from './context';

const context = keyContext('key.new', onDatabase());
const string = { name: 'orders:42', type: 'string', value: 'hello', expiry: 'none', exists: false };

describe('key.new', () => {
  it('opens the form with the Name orders: and the Type String in the tab of the namespace orders:', () => {
    const outcome = plan(context, { args: { namespace: 'orders:' } });
    expect(outcome).toMatchObject({ kind: 'ask', question: { title: 'New key in db0' } });
    const fields = outcome.kind === 'ask' ? outcome.question.fields : [];
    expect(fields.slice(0, 2)).toMatchObject([
      { key: 'name', default: 'orders:' },
      { key: 'type', default: 'string' },
    ]);
  });

  it('reads EXISTS orders:42, then sends SET orders:42 hello NX', () => {
    const { exists: _exists, ...typed } = string;
    expect(plan(context, typed)).toEqual({
      kind: 'read',
      need: {
        key: 'exists',
        read: 'key.new:read',
        args: { connection: cache.id, database: 0, key: hexOf(name('orders:42')) },
      },
    });
    expect(commandsOf(plan(context, string))).toEqual(['SET orders:42 hello NX']);
  });

  it('sends SET orders:42 hello NX EX 3600 with the expiry In 1h', () => {
    expect(commandsOf(plan(context, { ...string, expiry: 'in', duration: '1h' }))).toEqual([
      'SET orders:42 hello NX EX 3600',
    ]);
  });

  it('sends MULTI, HSET user:7 name Ada, EXPIRE user:7 3600, EXEC for a hash with the expiry In 1h', () => {
    const hash = {
      name: 'user:7',
      type: 'hash',
      field: 'name',
      value: 'Ada',
      expiry: 'in',
      duration: '1h',
      exists: false,
    };
    expect(commandsOf(plan(context, hash))).toEqual(['MULTI', 'HSET user:7 name Ada', 'EXPIRE user:7 3600', 'EXEC']);
  });

  it('sends ZADD board 0 ada for a sorted set with the default score', () => {
    expect(commandsOf(plan(context, { name: 'board', type: 'zset', value: 'ada', score: '0', exists: false }))).toEqual(
      ['ZADD board 0 ada'],
    );
  });

  it('sends XADD events * type signup for a stream with the default ID', () => {
    const stream = { name: 'events', type: 'stream', id: '*', field: 'type', value: 'signup', exists: false };
    expect(commandsOf(plan(context, stream))).toEqual(['XADD events * type signup']);
  });

  it('creates a string with an empty value, with SET orders:42 "" NX', () => {
    const created = planOf(plan(context, { ...string, value: '' }));
    expect(created.steps[0]?.text).toBe('SET orders:42 "" NX');
  });

  it('says a key named user:7 already exists, and writes nothing', () => {
    expect(recordedReplies('exists-taken')).toEqual([1]);
    expect(plan(context, { ...string, name: 'user:7', exists: true })).toEqual({
      kind: 'refuse',
      code: 'key.new/exists',
      message: 'A key named user:7 already exists.',
    });
  });

  it('is recorded as New hash user:7, keeping the key as missing, with Open in the notification', () => {
    const hash = { name: 'user:7', type: 'hash', field: 'name', value: 'Ada', exists: false };
    const created = planOf(plan(context, hash));
    expect(created.title).toBe('New hash user:7');
    expect(created.undo).toEqual({ keeps: { kind: 'keys', database: 0, keys: undoNames([hexOf(name('user:7'))]) } });
    expect(created.after[0]).toMatchObject({
      kind: 'notify',
      text: 'Created the hash user:7 in db0.',
      actions: [{ label: 'Open', feature: 'key.open' }],
    });
  });

  it('says on a read-only connection that Cache local is read-only', () => {
    const readOnly = keyContext('key.new', onDatabase(0, cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toEqual({
      kind: 'refuse',
      code: 'key.new/read-only',
      message: 'The connection Cache local is read-only.',
    });
  });

  it('refuses an empty name, a score that is not a number, a duration it cannot read and a date in the past', () => {
    expect(plan(context, { ...string, name: '' })).toMatchObject({
      code: 'key.new/invalid',
      message: 'Enter the name of the key.',
    });
    expect(plan(context, { name: 'board', type: 'zset', value: 'ada', score: 'high' })).toMatchObject({
      code: 'key.new/invalid',
    });
    expect(plan(context, { name: 'board', type: 'zset', value: 'ada', score: '-inf', exists: false }).kind).toBe('run');
    expect(plan(context, { ...string, expiry: 'in', duration: 'soon' })).toMatchObject({
      code: 'key.new/invalid',
      message: 'Enter a duration, for example 90, 15m, 2h or 7d.',
    });
    expect(plan(context, { ...string, expiry: 'on', date: '2020-01-01 00:00Z' })).toMatchObject({
      code: 'key.new/invalid',
      message: 'The date is in the past: the key would be deleted at once.',
    });
  });

  it('says Not created when SET … NX answers nil', () => {
    expect(recordedReplies('set-nx-taken')).toEqual([null]);
    expect(afterReply(null, name('orders:42'))).toEqual({
      kind: 'refuse',
      code: 'key.new/exists',
      message: 'Not created: a key named orders:42 was created meanwhile.',
    });
    expect(afterReply(name('OK'), name('orders:42'))).toEqual({ kind: 'done' });
  });
});
