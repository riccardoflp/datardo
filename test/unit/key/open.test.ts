import { describe, expect, it } from 'vitest';
import { plan, read } from '../../../src/features/key/open';
import { hexOf } from '../../../src/features/key/types';
import { view as pinned } from '../../../src/features/tree/pinned';
import { inputOf } from '../tree/context';
import type { ReadRequest } from '../../../src/shared/feature';
import { stateWith } from '../connection/context';
import {
  cache,
  cacheReadOnly,
  connected,
  keyContext,
  name,
  onDatabase,
  onKey,
  planOf,
  recordedReplies,
  requestWords,
} from './context';

const keyTab = { kind: 'key', connection: cache.id, database: 0, key: 'orders:42', separator: ':' } as const;

describe('key.open', () => {
  it('reads TYPE orders:42, then opens a tab of the key orders:42 of db0', () => {
    const context = keyContext('key.open', onKey('orders:42'));
    expect(plan(context, {})).toEqual({
      kind: 'read',
      need: {
        key: 'type',
        read: 'key.open:read',
        args: { connection: cache.id, database: 0, key: hexOf(name('orders:42')) },
      },
    });
    const asked = read.request(context, { connection: cache.id, database: 0, key: hexOf(name('orders:42')) });
    expect((asked as Extract<ReadRequest, { kind: 'engine' }>).requests.map(requestWords)).toEqual(['TYPE orders:42']);
    expect(read.parse(recordedReplies('type-hash'), null)).toBe('hash');
    const opened = planOf(plan(context, { type: 'hash' }));
    expect(opened.steps).toEqual([
      {
        kind: 'app',
        action: 'tab.open',
        args: { shows: keyTab, background: false },
        text: 'open the key tab orders:42 of db0 on Cache local',
      },
    ]);
    expect(opened.undo).toEqual({ cannot: expect.any(String) as string });
  });

  it('makes the tab of orders:42 active when it is open, and opens no other', () => {
    const context = keyContext('key.open', onKey('orders:42'), connected(cache, '7.4.1', [keyTab]));
    expect(planOf(plan(context, { type: 'hash' })).steps).toEqual([
      expect.objectContaining({ action: 'tab.activate', args: { tab: 't1' } }),
    ]);
  });

  it('opens nothing for a row marked gone, and says the key no longer exists', () => {
    const context = keyContext('key.open', onKey('orders:42'));
    expect(read.parse(recordedReplies('type-none'), null)).toBe('none');
    expect(plan(context, { type: 'none' })).toEqual({
      kind: 'refuse',
      code: 'key.open/gone',
      message: 'The key orders:42 no longer exists: it was deleted or it expired.',
    });
  });

  it('asks the name from Open key…, and says there is no key nothing:here in db0', () => {
    const context = keyContext('key.open', onDatabase());
    expect(plan(context, {})).toMatchObject({ kind: 'ask', question: { fields: [{ key: 'name' }] } });
    expect(plan(context, { name: 'nothing:here', type: 'none' })).toEqual({
      kind: 'refuse',
      code: 'key.open/not-found',
      message: 'There is no key named nothing:here in db0.',
    });
  });

  it('opens the key on a read-only connection', () => {
    const context = keyContext('key.open', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(context, { type: 'hash' }).kind).toBe('run');
  });

  it('opens a key of the type ReJSON-RL', () => {
    expect(plan(keyContext('key.open', onKey('doc')), { type: 'ReJSON-RL' }).kind).toBe('run');
  });

  it('refuses when Cache local is not connected', () => {
    const context = keyContext('key.open', onKey('orders:42'), stateWith([cache]));
    expect(plan(context, {})).toEqual({
      kind: 'refuse',
      code: 'key.open/not-connected',
      message: 'Cache local is not connected.',
    });
  });

  it('opens a name that is not text with its bytes in hexadecimal', () => {
    const bytes = Uint8Array.of(0x75, 0x73, 0x65, 0x72, 0x3a, 0xff);
    const step = planOf(plan(keyContext('key.open', onKey(bytes)), { type: 'string' })).steps[0];
    expect(step).toMatchObject({ args: { shows: { key: '"user:\\xff"', keyHex: '757365723aff' } } });
  });

  it('a click on a pinned key of the tree opens its key tab', () => {
    const pins = [{ kind: 'key' as const, database: 0, keyHex: hexOf(name('user:7')) }];
    const [node] = pinned(inputOf({ connections: [cache], pins }));
    expect(node?.click).toMatchObject({
      element: 'key.open@tree',
      feature: 'tab.open',
      args: { shows: { kind: 'key', connection: cache.id, database: 0, key: 'user:7' } },
    });
  });
});
