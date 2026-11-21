/**
 * What the main process answers to `mcp.undo-history` and `mcp.undo-write` (`mcp.debugging-tools`), from the undo
 * history: the operations newest first, and what one operation kept, without the values of keys.
 */
import { describe, expect, it } from 'vitest';
import { undoHistoryReply, undoWriteReply } from '../../../src/features/mcp/tool/undo-replies';
import { connectionId } from '../../../src/shared/ids';
import type { OperationId, UndoEntry } from '../../../src/shared/state/undo';
import { cache, local } from './harness';

function entry(id: string, time: number, more: Partial<UndoEntry> = {}): UndoEntry {
  return {
    id: id as OperationId,
    time,
    connection: local.id,
    connectionName: 'Old name',
    title: 'Delete document',
    inserted: 0,
    updated: 0,
    deleted: 1,
    size: 100,
    engine: 'mongodb',
    database: 'shop',
    collection: 'orders',
    ...more,
  } as UndoEntry;
}

function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

describe('mcp.debugging-tools', () => {
  it('gives the operations newest first, the connection by its name now, and the total', () => {
    const reply = undoHistoryReply(
      [
        entry('a', 1000),
        entry('b', 3000, { undone: 4000 }),
        entry('c', 2000, {
          engine: 'redis',
          database: 3,
          connection: cache.id,
          inserted: 1,
          updated: 1,
          deleted: 0,
        }),
        entry('d', 500, { connection: connectionId('c-gone') }),
      ],
      [local, cache],
      3,
    );
    expect(reply.total).toBe(4);
    expect(reply.entries.map((each) => each.id)).toEqual(['b', 'c', 'a']);
    expect(reply.entries[0]).toMatchObject({ connectionName: local.name, undoneAt: 4000, collection: 'orders' });
    expect(reply.entries[1]).toMatchObject({ connectionName: cache.name, redisDatabase: 3, keys: 2 });
    expect(undoHistoryReply([entry('d', 500, { connection: connectionId('c-gone') })], []).entries[0]).toMatchObject({
      connectionName: 'Old name',
    });
  });

  it('gives the documents an operation kept, deleted or not, up to the limit', () => {
    const reply = undoWriteReply(
      {
        docs: [
          { id: 1, before: { _id: 1, a: 1 }, after: null },
          { id: 2, before: { _id: 2 }, after: { _id: 2, b: 1 } },
          { id: 3, before: null, after: { _id: 3 } },
        ],
      },
      2,
    );
    expect(reply).toEqual({
      total: 3,
      documents: [
        { id: 1, before: { _id: 1, a: 1 }, deleted: true },
        { id: 2, before: { _id: 2 }, deleted: false },
      ],
    });
  });

  it('gives the keys an operation kept by name, type, size and expiry, never their values', () => {
    const reply = undoWriteReply(
      {
        keys: [
          {
            key: base64('orders:42'),
            before: { type: 'hash', dump: base64('secret-dump-value'), pttl: 5000 },
            after: null,
          },
          { key: base64('fresh'), before: null, after: { type: 'string' } },
        ],
      },
      20,
    );
    expect(reply).toEqual({
      total: 2,
      keys: [
        { key: 'orders:42', existed: true, type: 'hash', bytes: 17, ttlMs: 5000 },
        { key: 'fresh', existed: false },
      ],
    });
    expect(JSON.stringify(reply)).not.toContain('secret');
  });
});
