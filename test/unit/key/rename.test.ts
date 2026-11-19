import { describe, expect, it } from 'vitest';
import { afterReply, plan } from '../../../src/features/key/rename';
import { hexOf } from '../../../src/features/key/types';
import {
  cache,
  cacheReadOnly,
  commandsOf,
  connected,
  keyContext,
  name,
  onKey,
  planOf,
  recordedReplies,
  undoNames,
} from './context';

const context = keyContext('key.rename', onKey('orders:42'));

describe('key.rename', () => {
  it('asks the new name, reads EXISTS orders:43, sends RENAMENX orders:42 orders:43 and says it renamed', () => {
    expect(plan(context, {})).toMatchObject({
      kind: 'ask',
      question: { title: 'Rename orders:42', fields: [{ key: 'name', default: 'orders:42' }] },
    });
    expect(plan(context, { name: 'orders:43' })).toEqual({
      kind: 'read',
      need: {
        key: 'exists',
        read: 'key.rename:read',
        args: { connection: cache.id, database: 0, key: hexOf(name('orders:43')) },
      },
    });
    const renamed = plan(context, { name: 'orders:43', exists: false });
    expect(commandsOf(renamed)).toEqual(['RENAMENX orders:42 orders:43']);
    expect(planOf(renamed).danger).toEqual({ kind: 'none' });
    expect(planOf(renamed).after[0]).toMatchObject({ kind: 'notify', text: 'Renamed orders:42 to orders:43.' });
  });

  it('keeps the expiry: RENAMENX moves the key with its time left, and sets none', () => {
    const steps = commandsOf(plan(context, { name: 'orders:43', exists: false }));
    expect(steps.some((step) => /EXPIRE|PERSIST/u.test(step))).toBe(false);
  });

  it('asks before replacing orders:43, and sends RENAME orders:42 orders:43 on Replace', () => {
    const replacing = planOf(plan(context, { name: 'orders:43', exists: true }));
    expect(replacing.danger).toEqual({
      kind: 'confirm',
      text: [
        'A key named orders:43 already exists. Replace it?',
        'Its value and its expiry are lost: orders:43 becomes what orders:42 is now. It can be undone from the Undo history.',
      ].join('\n'),
      button: 'Replace',
    });
    expect(replacing.steps.map((step) => step.text)).toEqual(['RENAME orders:42 orders:43']);
  });

  it('says Not renamed when RENAMENX answers 0, and gone on ERR no such key', () => {
    const [taken] = recordedReplies('renamenx-taken');
    expect(afterReply(taken ?? null, name('orders:42'), name('orders:43'))).toEqual({
      kind: 'refuse',
      code: 'key.rename/exists',
      message: 'Not renamed: a key named orders:43 was created meanwhile.',
    });
    const [noSuchKey] = recordedReplies('rename-gone');
    expect(afterReply(noSuchKey ?? null, name('orders:42'), name('orders:43'))).toEqual({
      kind: 'refuse',
      code: 'key.rename/gone',
      message: 'The key orders:42 no longer exists: it was deleted or it expired.',
    });
  });

  it('keeps both keys in the undo history, recorded as Rename orders:42 to orders:43', () => {
    const renamed = planOf(plan(context, { name: 'orders:43', exists: true }));
    expect(renamed.title).toBe('Rename orders:42 to orders:43');
    expect(renamed.undo).toEqual({
      keeps: { kind: 'keys', database: 0, keys: undoNames([hexOf(name('orders:42')), hexOf(name('orders:43'))]) },
    });
  });

  it('renames a key of the type ReJSON-RL as any other', () => {
    expect(commandsOf(plan(keyContext('key.rename', onKey('doc')), { name: 'doc2', exists: false }))).toEqual([
      'RENAMENX doc doc2',
    ]);
  });

  it('refuses an empty name or the same name, and on a read-only connection', () => {
    expect(plan(context, { name: 'orders:42' })).toMatchObject({
      code: 'key.rename/invalid',
      message: 'Enter a different name.',
    });
    expect(plan(context, { name: '' })).toMatchObject({ code: 'key.rename/invalid' });
    const readOnly = keyContext('key.rename', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ kind: 'refuse', code: 'key.rename/read-only' });
  });
});
