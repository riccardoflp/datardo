import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { afterReply, plan } from '../../../src/features/key/delete';
import { rowMenu } from '../../../src/features/key/show';
import { hexOf } from '../../../src/features/key/types';
import { redisConnection } from '../connection/context';
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
} from './context';

const context = keyContext('key.delete', onKey('orders:42'));
const keysTab = { kind: 'keys', connection: cache.id, database: 0, separator: ':' } as const;
const keyTab = { kind: 'key', connection: cache.id, database: 0, key: 'orders:42', separator: ':' } as const;

describe('key.delete', () => {
  it('asks Delete key orders:42 from db0? with the type, the size and the undo, then sends UNLINK orders:42', () => {
    const deleted = planOf(plan(context, { args: { type: 'hash', size: 1228 } }));
    expect(deleted.danger).toEqual({
      kind: 'confirm',
      text: 'Delete key orders:42 from db0?\nA hash, 1.2 KB. It can be undone from the Undo history.',
      button: 'Delete',
    });
    expect(commandsOf(plan(context, {}))).toEqual(['UNLINK orders:42']);
    expect(deleted.after).toContainEqual({ kind: 'refresh', connection: cache.id });
  });

  it('runs nothing before the confirmation: the plan is confirmed first', () => {
    expect(planOf(plan(context, {})).danger.kind).toBe('confirm');
  });

  it('says the undo history is off for this connection when it is', () => {
    const noUndo = redisConnection({ keepsUndo: false });
    const off = planOf(plan(keyContext('key.delete', onKey('orders:42', noUndo), connected(noUndo)), {}));
    expect(off.danger).toMatchObject({
      text: "Delete key orders:42 from db0?\nThe undo history is off for this connection: this can't be undone.",
    });
    expect(off.undo).toEqual({ cannot: "The undo history is off for this connection: this can't be undone." });
  });

  it('says Key not found when UNLINK answers 0', () => {
    expect(recordedReplies('unlink-gone')).toEqual([0]);
    expect(afterReply(0)).toEqual({
      kind: 'notify',
      level: 'warning',
      text: 'Key not found: it may have been deleted already, or have expired.',
    });
  });

  it('keeps the key for the undo, recorded as Delete key orders:42, and closes its key tab', () => {
    const deleted = planOf(
      plan(keyContext('key.delete', onKey('orders:42'), connected(undefined, undefined, [keysTab, keyTab])), {}),
    );
    expect(deleted.title).toBe('Delete key orders:42');
    expect(deleted.undo).toEqual({ keeps: { engine: 'redis', database: 0, keys: [hexOf(name('orders:42'))] } });
    expect(deleted.after).toContainEqual(
      expect.objectContaining({ kind: 'start', feature: 'tab.close', args: { tab: 't2' } }),
    );
    expect(deleted.after[0]).toMatchObject({ text: 'Deleted key orders:42 from db0.' });
  });

  it('has no Delete key… on a read-only connection, and refuses there', () => {
    expect(rowMenu(true, true).map((entry) => entry.feature)).not.toContain('key.delete');
    const readOnly = keyContext('key.delete', onKey('orders:42', cacheReadOnly), connected(cacheReadOnly));
    expect(plan(readOnly, {})).toMatchObject({ code: 'key.delete/read-only' });
  });

  it('never sends DEL', () => {
    const folder = join(import.meta.dirname, '..', '..', '..', 'src', 'features', 'key');
    for (const file of ['delete.ts', 'delete-selected.ts', 'delete-by-pattern.ts', 'import.ts']) {
      expect(readFileSync(join(folder, file), 'utf8')).not.toMatch(/['"](DEL|FLUSHDB|FLUSHALL|KEYS)['"]/u);
    }
  });
});
