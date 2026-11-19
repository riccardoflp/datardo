import { describe, expect, it } from 'vitest';
import { afterReply, plan } from '../../../src/features/key/persist';
import { rowMenu } from '../../../src/features/key/show';
import { hexOf } from '../../../src/features/key/types';
import { cacheReadOnly, commandsOf, connected, keyContext, name, onKey, planOf, recordedReplies } from './context';

const context = keyContext('key.persist', onKey('orders:42'));

describe('key.persist', () => {
  it('sends PERSIST orders:42 and says orders:42 no longer expires', () => {
    const persisted = plan(context, {});
    expect(commandsOf(persisted)).toEqual(['PERSIST orders:42']);
    expect(planOf(persisted).after[0]).toMatchObject({ text: 'orders:42 no longer expires.' });
  });

  it('is not in the menu of a key without an expiry', () => {
    expect(rowMenu(false, false).map((entry) => entry.feature)).not.toContain('key.persist');
    expect(rowMenu(false, true).map((entry) => entry.feature)).toContain('key.persist');
  });

  it('says orders:42 is already persistent when PERSIST answers 0 on a key that exists', () => {
    expect(recordedReplies('persist-persistent')).toEqual([0]);
    expect(afterReply(0, name('orders:42'), -1)).toEqual({
      kind: 'notify',
      level: 'info',
      text: 'orders:42 is already persistent.',
    });
    expect(afterReply(0, name('orders:42'), -2)).toMatchObject({ kind: 'refuse', code: 'key.persist/gone' });
    expect(afterReply(1, name('orders:42'))).toEqual({ kind: 'done' });
  });

  it('keeps the key with its time left for the undo, recorded as Make orders:42 persistent', () => {
    const persisted = planOf(plan(context, {}));
    expect(persisted.title).toBe('Make orders:42 persistent');
    expect(persisted.undo).toEqual({ keeps: { engine: 'redis', database: 0, keys: [hexOf(name('orders:42'))] } });
  });

  it('has no Make persistent on a read-only connection', () => {
    expect(rowMenu(true, true).map((entry) => entry.feature)).not.toContain('key.persist');
    const readOnly = keyContext('key.persist', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.persist/read-only' });
  });
});
