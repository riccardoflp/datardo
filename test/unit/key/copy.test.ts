import { describe, expect, it } from 'vitest';
import { afterReply, plan } from '../../../src/features/key/copy';
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

const context = keyContext('key.copy', onKey('orders:42'));

describe('key.copy', () => {
  it('reads EXISTS orders:42-old, then sends COPY orders:42 orders:42-old', () => {
    expect(plan(context, {})).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Copy orders:42',
        fields: [
          { key: 'to', default: 'orders:42' },
          { key: 'database', default: '0' },
        ],
      },
    });
    expect(plan(context, { to: 'orders:42-old', database: '0' })).toEqual({
      kind: 'read',
      need: {
        key: 'exists',
        read: 'key.copy:read',
        args: { connection: cache.id, database: 0, key: hexOf(name('orders:42-old')) },
      },
    });
    const copied = plan(context, { to: 'orders:42-old', database: '0', exists: false });
    expect(commandsOf(copied)).toEqual(['COPY orders:42 orders:42-old']);
    expect(planOf(copied).after[0]).toMatchObject({ text: 'Copied orders:42 to orders:42-old.' });
  });

  it('sends COPY orders:42 orders:42 DB 1 to db1, after EXISTS in db1', () => {
    expect(plan(context, { to: 'orders:42', database: '1' })).toMatchObject({ need: { args: { database: 1 } } });
    const copied = plan(context, { to: 'orders:42', database: '1', exists: false });
    expect(commandsOf(copied)).toEqual(['COPY orders:42 orders:42 DB 1']);
    expect(planOf(copied).title).toBe('Copy orders:42 to db1');
    expect(planOf(copied).after[0]).toMatchObject({ text: 'Copied orders:42 to orders:42 in db1.' });
  });

  it('keeps the expiry: COPY copies the time left, and nothing sets another', () => {
    const steps = commandsOf(plan(context, { to: 'orders:42-old', database: '0', exists: false }));
    expect(steps.some((step) => /EXPIRE|PERSIST/u.test(step))).toBe(false);
  });

  it('asks before replacing, and sends COPY orders:42 orders:42 DB 1 REPLACE on Replace', () => {
    const replacing = planOf(plan(context, { to: 'orders:42', database: '1', exists: true }));
    expect(replacing.danger).toEqual({
      kind: 'confirm',
      text: [
        'A key named orders:42 already exists in db1. Replace it?',
        'Its value and its expiry are lost. It can be undone from the Undo history.',
      ].join('\n'),
      button: 'Replace',
    });
    expect(replacing.steps.map((step) => step.text)).toEqual(['COPY orders:42 orders:42 DB 1 REPLACE']);
  });

  it('refuses the same name in the same database', () => {
    expect(plan(context, { to: 'orders:42', database: '0' })).toEqual({
      kind: 'refuse',
      code: 'key.copy/invalid',
      message: 'Enter a different name or choose another database.',
    });
  });

  it('keeps the copy in db1 for the undo, and nothing of db0', () => {
    const copied = planOf(plan(context, { to: 'orders:42', database: '1', exists: false }));
    expect(copied.undo).toEqual({ keeps: { kind: 'keys', database: 1, keys: undoNames([hexOf(name('orders:42'))]) } });
  });

  it('says This server has no COPY command on ERR unknown command, and on a server older than 6.2', () => {
    const unknown = { kind: 'error', message: "ERR unknown command 'COPY', with args beginning with: " } as const;
    expect(afterReply(unknown, name('orders:42'), name('orders:42-old'))).toEqual({
      kind: 'refuse',
      code: 'key.copy/unsupported',
      message: 'This server has no COPY command.',
    });
    const old = keyContext('key.copy', onKey('orders:42'), connected(cache, '6.0.9'));
    expect(plan(old, {})).toMatchObject({ code: 'key.copy/unsupported' });
  });

  it('says Not copied when COPY answers 0', () => {
    const [notCopied] = recordedReplies('copy-taken');
    expect(afterReply(notCopied ?? null, name('orders:42'), name('orders:42-old'))).toEqual({
      kind: 'refuse',
      code: 'key.copy/not-copied',
      message: 'Not copied: orders:42 no longer exists, or a key named orders:42-old was created meanwhile.',
    });
  });

  it('refuses on a read-only connection', () => {
    const readOnly = keyContext('key.copy', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.copy/read-only' });
  });
});
