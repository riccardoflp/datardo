import { describe, expect, it } from 'vitest';
import { afterReply, dateOfText, plan } from '../../../src/features/key/set-expiry';
import { hexOf } from '../../../src/features/key/types';
import { contextOf } from '../connection/context';
import { cacheReadOnly, commandsOf, connected, keyContext, name, onKey, planOf, recordedReplies } from './context';

const context = keyContext('key.set-expiry', onKey('orders:42'));
const durationError = 'Enter a duration, for example 90, 15m, 2h or 7d.';

describe('key.set-expiry', () => {
  it('sends EXPIRE orders:42 3600 for In 1h, and says orders:42 expires in 1 h', () => {
    const set = plan(context, { when: 'in', duration: '1h' });
    expect(commandsOf(set)).toEqual(['EXPIRE orders:42 3600']);
    expect(planOf(set).after[0]).toMatchObject({ text: 'orders:42 expires in 1 h.' });
  });

  it('sends PEXPIREAT orders:42 1796083200000 for On 2026-12-01 00:00:00 UTC', () => {
    expect(Date.UTC(2026, 11, 1)).toBe(1_796_083_200_000);
    expect(dateOfText('2026-12-01 00:00:00Z')).toBe(1_796_083_200_000);
    expect(commandsOf(plan(context, { when: 'on', date: '2026-12-01 00:00Z' }))).toEqual([
      'PEXPIREAT orders:42 1796083200000',
    ]);
  });

  it('refuses 0 and 1.5h, and sends nothing', () => {
    for (const duration of ['0', '1.5h']) {
      expect(plan(context, { when: 'in', duration })).toEqual({
        kind: 'refuse',
        code: 'key.set-expiry/invalid',
        message: durationError,
      });
    }
  });

  it('refuses a date one minute ago', () => {
    const now = Date.UTC(2026, 10, 18, 12, 0);
    const later = contextOf('key.set-expiry', connected(), onKey('orders:42'));
    expect(plan({ ...later, now }, { when: 'on', date: '2026-11-18 11:59Z' })).toEqual({
      kind: 'refuse',
      code: 'key.set-expiry/invalid',
      message: 'The date is in the past: the key would be deleted at once. Use Delete key instead.',
    });
  });

  it('says the key no longer exists when EXPIRE answers 0', () => {
    expect(recordedReplies('expire-gone')).toEqual([0]);
    expect(afterReply(0, name('orders:42'))).toEqual({
      kind: 'refuse',
      code: 'key.set-expiry/gone',
      message: 'The key orders:42 no longer exists: it was deleted or it expired.',
    });
  });

  it('keeps the key for the undo, which makes a key that was persistent persistent again', () => {
    const set = planOf(plan(context, { when: 'in', duration: '1h' }));
    expect(set.title).toBe('Set expiry of orders:42');
    expect(set.undo).toEqual({ keeps: { engine: 'redis', database: 0, keys: [hexOf(name('orders:42'))] } });
  });

  it('gives a key of the type ReJSON-RL an expiry', () => {
    expect(commandsOf(plan(keyContext('key.set-expiry', onKey('doc')), { when: 'in', duration: '90' }))).toEqual([
      'EXPIRE doc 90',
    ]);
  });

  it('asks In or On with the present expiry, starting On one hour from now for a persistent key', () => {
    expect(plan(context, {})).toMatchObject({
      kind: 'ask',
      question: { title: 'Set expiry of orders:42', text: 'Now: persistent' },
    });
    const readOnly = keyContext('key.set-expiry', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.set-expiry/read-only' });
  });
});
