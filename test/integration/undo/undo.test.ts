/**
 * The undo history against real servers (M11's exit criteria; R5.5): a plan that updates three documents of every BSON
 * type is recorded, undone from its notification and from the page, and the documents are equal to what they were,
 * type by type; inserts and deletes are undone; keys deleted or changed come back with their value and the time they
 * had left (`RESTORE … REPLACE`); the details of a row read the documents as they are now.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { entryTarget } from '../../../src/features/undo/types';
import type { OperationRead } from '../../../src/features/undo/reads/operation';
import { redisCommand, type Json } from '../../../src/shared/engine-request';
import type { UndoEntry } from '../../../src/shared/state/undo';
import type { Target } from '../../../src/shared/target';
import { testServers } from '../servers';
import { cacheId, live, localId, type Live } from './live';

const servers = testServers();
const database = 'undo_it';
const collection = 'orders';
const redisDatabase = servers.redisDatabases[0] ?? 15;
const target: Target = { kind: 'collection', connection: localId, database, collection };
let runner: Live;

/** A document of every type the undo history must keep (R5.5). */
function typed(n: number): Json {
  return {
    _id: { $oid: `65f1c0ffee00000000000${String(n).padStart(3, '0')}` },
    int: { $numberInt: String(n) },
    long: { $numberLong: '9007199254740993' },
    double: { $numberDouble: '1.5' },
    decimal: { $numberDecimal: '0.10' },
    bytes: { $binary: { base64: '/wBB', subType: '00' } },
    uuid: { $binary: { base64: 'q83vEjRWeJCrze8SNFZ4kA==', subType: '04' } },
    when: { $date: { $numberLong: '1700000000000' } },
    stamp: { $timestamp: { t: 1700000000, i: 1 } },
    pattern: { $regularExpression: { pattern: '^a', options: 'i' } },
    low: { $minKey: 1 },
    high: { $maxKey: 1 },
    nothing: null,
    yes: true,
    nested: { list: [{ $numberInt: '1' }, 'two', { $numberLong: '3' }] },
    status: 'new',
  };
}

const originals = [1, 2, 3].map(typed);
const ids = originals.map((document) => (document as { _id: Json })._id);

async function send(method: string, args: readonly Json[], more: Record<string, Json> = {}): Promise<unknown> {
  return runner.engines.send(
    { connection: localId, request: { engine: 'mongodb', database, collection, method, arguments: args, ...more } },
    AbortSignal.timeout(30_000),
  );
}

async function documents(): Promise<unknown> {
  return send('find', [{}], { sort: { _id: 1 } });
}

function newest(): UndoEntry {
  const [entry] = runner.state().undo.entries;
  if (entry === undefined) {
    throw new Error('Nothing was recorded.');
  }
  return entry;
}

async function updateThree(status: string): Promise<void> {
  const args = { connection: localId, database, collection, ids, set: { status } };
  expect(await runner.start('test.update-documents', target, args)).toEqual({ kind: 'done' });
}

beforeAll(async () => {
  runner = await live();
});

afterAll(async () => {
  await send('drop', []).catch(() => undefined);
  await runner.close();
});

beforeEach(async () => {
  await send('deleteMany', [{}]);
  await send('insertMany', [originals]);
});

describe('undo.revert', () => {
  it('puts back three updated documents of every type from the notification and from the page, type by type', async () => {
    await updateThree('paid');
    expect(((await documents()) as { status: string }[]).map((each) => each.status)).toEqual(['paid', 'paid', 'paid']);
    const action = runner.state().runner.notifications.at(-1)?.actions?.[0];
    expect(action?.element).toBe('undo.revert@notification');
    expect(await runner.start(action?.feature ?? '', action?.target ?? target, action?.args ?? null)).toEqual({
      kind: 'done',
    });
    expect(await documents()).toEqual(originals);
    await updateThree('sent');
    const entry = newest();
    expect(await runner.start('undo.revert', entryTarget(entry), { operation: entry.id }, 'table')).toEqual({
      kind: 'done',
    });
    expect(await documents()).toEqual(originals);
    expect(runner.state().undo.message?.text).toBe(
      `Undid "Update 3 documents": 3 documents in Local › ${database}.${collection}.`,
    );
  });

  it('deletes inserted documents, and inserts deleted ones again with their _id', async () => {
    const extra = { _id: { $numberInt: '42' }, name: 'extra' };
    await runner.start('test.insert-documents', target, {
      connection: localId,
      database,
      collection,
      documents: [extra],
    });
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await documents()).toEqual(originals);
    await runner.start('test.delete-documents', target, {
      connection: localId,
      database,
      collection,
      filter: { status: 'new' },
    });
    expect(await documents()).toEqual([]);
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await documents()).toEqual(originals);
  });
});

describe('undo.details', () => {
  it('reads the operation’s file and the documents as they are now', async () => {
    await updateThree('paid');
    const entry = newest();
    const result = await runner.start('undo.details', { kind: 'app' }, { operation: entry.id });
    expect(result.kind).toBe('read');
    const read = (result as { result: OperationRead }).result;
    expect(read.kind === 'read' ? [read.total, read.current.kind] : []).toEqual([3, 'documents']);
  });
});

describe('undo.record', () => {
  const prefix = `undo-it-${String(Date.now())}`;
  const keyTarget: Target = { kind: 'redis-database', connection: cacheId, database: redisDatabase };

  async function redis(...words: string[]): Promise<unknown> {
    return runner.engines.send(
      { connection: cacheId, request: redisCommand(redisDatabase, ...words) },
      AbortSignal.timeout(10_000),
    );
  }

  it('keeps keys with their dump and expiry: a deleted hash comes back with its fields and the time it had left', async () => {
    const key = `${prefix}:hash`;
    await redis('HSET', key, 'a', '1', 'b', '2');
    await redis('PEXPIRE', key, '90000');
    await runner.start('test.write-keys', keyTarget, { connection: cacheId, database: redisDatabase, keys: [key] });
    expect(await redis('EXISTS', key)).toBe(0);
    expect(newest()).toMatchObject({ engine: 'redis', database: redisDatabase, deleted: 1 });
    await runner.start('undo.last', { kind: 'app' }, null);
    const fields = (await redis('HGETALL', key)) as { entries: (readonly [Uint8Array, Uint8Array])[] };
    const decoder = new TextDecoder();
    expect(fields.entries.map(([name, value]) => `${decoder.decode(name)}=${decoder.decode(value)}`)).toEqual([
      'a=1',
      'b=2',
    ]);
    const left = (await redis('PTTL', key)) as number;
    expect(left).toBeGreaterThan(80_000);
    expect(left).toBeLessThanOrEqual(90_000);
    await redis('DEL', key);
  });

  it('deletes a key that the write created, when undone', async () => {
    const key = `${prefix}:new`;
    await runner.start('test.write-keys', keyTarget, {
      connection: cacheId,
      database: redisDatabase,
      keys: [key],
      value: 'x',
    });
    expect(newest()).toMatchObject({ engine: 'redis', inserted: 1 });
    await runner.start('undo.last', { kind: 'app' }, null);
    expect(await redis('EXISTS', key)).toBe(0);
  });
});
