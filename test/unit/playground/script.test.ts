/**
 * The script as the process of a run runs it, with a main process that answers its calls here: what it sends, what it
 * prints, and how it ends.
 */
import { describe, expect, it } from 'vitest';
import type { Json } from '../../../src/shared/engine-request';
import { rewritten } from '../../../src/features/playground/rewrite';
import type { FromRun, PlaygroundCall, ToRun } from '../../../src/features/playground/runtime';
import { runScript } from '../../../src/main/playground/script';

type Answer = (call: PlaygroundCall) => Json | Error;

interface Ran {
  readonly calls: PlaygroundCall[];
  readonly printed: string[];
  readonly end: Extract<FromRun, { readonly kind: 'done' | 'failed' }>;
}

/** Runs a script on `shop`, the calls answered by `answer`. */
function run(source: string, answer: Answer = () => null): Promise<Ran> {
  const script = rewritten(source);
  if (script.kind !== 'rewritten') {
    throw new Error(script.message);
  }
  const calls: PlaygroundCall[] = [];
  const printed: string[] = [];
  return new Promise((resolve) => {
    let receive: (message: ToRun) => void = () => undefined;
    receive = runScript({ code: script.code, database: 'shop', firstLine: 1 }, (message) => {
      switch (message.kind) {
        case 'call': {
          calls.push(message.call);
          const reply = answer(message.call);
          queueMicrotask(() => {
            receive(
              reply instanceof Error
                ? { kind: 'throw', id: message.id, error: { message: reply.message } }
                : { kind: 'reply', id: message.id, value: reply },
            );
          });
          break;
        }
        case 'print':
          printed.push(message.line);
          break;
        case 'done':
        case 'failed':
          resolve({ calls, printed, end: message });
      }
    });
  });
}

const paid = [{ _id: { $numberInt: '1' } }, { _id: { $numberInt: '2' } }, { _id: { $numberInt: '3' } }];

describe('playground.runtime', () => {
  it('reads a shaped cursor with one find: find().sort().limit(3).toArray().length is 3', async () => {
    const ran = await run(
      'db.orders.find({ status: "paid" }).sort({ total: -1 }).limit(3).toArray().length',
      () => paid,
    );
    expect(ran.end).toMatchObject({ kind: 'done', value: { kind: 'value', value: { $numberInt: '3' } } });
    expect(ran.calls).toHaveLength(1);
    expect(ran.calls[0]).toMatchObject({ on: 'cursor', method: 'toArray', collection: 'orders' });
    expect(ran.calls[0]?.cursor?.shape).toEqual([
      { method: 'sort', arguments: [{ total: { $numberInt: '-1' } }] },
      { method: 'limit', arguments: [{ $numberInt: '3' }] },
    ]);
  });

  it('answers use("shop") as the last statement with switched to db shop', async () => {
    const ran = await run('use("archive");\nuse("shop")');
    expect(ran.end).toMatchObject({ kind: 'done', value: { kind: 'text', text: 'switched to db shop' } });
  });

  it('counts archive.orders with getSiblingDB and leaves db as it was', async () => {
    const ran = await run('db.getSiblingDB("archive").orders.countDocuments();\ndb.getName()', () => ({
      $numberInt: '4',
    }));
    expect(ran.calls[0]).toMatchObject({ database: 'archive', collection: 'orders', method: 'countDocuments' });
    expect(ran.end).toMatchObject({ value: { kind: 'text', text: 'shop' } });
  });

  it('takes the stages of aggregate as separate arguments', async () => {
    const ran = await run('db.orders.aggregate({ $match: { status: "paid" } }, { $count: "n" }).toArray()', () => []);
    expect(ran.calls[0]?.cursor).toMatchObject({
      of: 'aggregate',
      arguments: [[{ $match: { status: 'paid' } }, { $count: 'n' }]],
    });
  });

  it('prints total NumberLong(5) { a: 1 }', async () => {
    const ran = await run('print("total", NumberLong(5), { a: 1 })');
    expect(ran.printed).toEqual(['total NumberLong(5) { a: 1 }']);
  });

  it('counts a find on the server, with no document read', async () => {
    const ran = await run('db.orders.find().count()', () => ({ $numberInt: '1204' }));
    expect(ran.calls).toHaveLength(1);
    expect(ran.calls[0]).toMatchObject({ on: 'cursor', method: 'count' });
    expect(ran.end).toMatchObject({ value: { kind: 'value', value: { $numberInt: '1204' } } });
  });

  it('refuses hint on an aggregation cursor', async () => {
    const ran = await run('db.orders.aggregate([{ $match: {} }]).hint({ status: 1 })');
    expect(ran.end).toMatchObject({
      kind: 'failed',
      error: { message: 'cursor.hint() is not available on this cursor', line: 1 },
    });
  });

  it('reads at most 201 documents of a cursor that is the last statement', async () => {
    const many = Array.from({ length: 201 }, (_, index) => ({ n: { $numberInt: String(index) } }));
    const ran = await run('db.orders.find()', () => many);
    expect(ran.calls).toHaveLength(1);
    expect(ran.calls[0]).toMatchObject({ method: 'toArray', arguments: [201] });
    expect(ran.end).toMatchObject({ value: { kind: 'documents', more: true } });
  });

  it('reads the same collection with getCollection and with brackets', async () => {
    const ran = await run('db.getCollection("order-items").findOne({});\ndb["order-items"].findOne({})');
    expect(ran.calls.map((call) => call.collection)).toEqual(['order-items', 'order-items']);
  });

  it('makes new ids, the time of the call, and keeps the decimals of NumberDecimal', async () => {
    const ran = await run('[ObjectId(), ObjectId(), ISODate(), NumberDecimal("1.10")]');
    const value = ran.end.kind === 'done' ? ran.end.value : undefined;
    const [first, second, date, decimal] = (value?.kind === 'value' ? value.value : []) as Json[];
    expect(first).not.toEqual(second);
    expect(Math.abs(Number((date as { $date: { $numberLong: string } }).$date.$numberLong) - Date.now())).toBeLessThan(
      5000,
    );
    expect(decimal).toEqual({ $numberDecimal: '1.10' });
  });

  it('has no setTimeout, require, process or fetch', async () => {
    for (const name of ['setTimeout', 'require', 'process', 'fetch']) {
      const ran = await run(name);
      expect(ran.end).toMatchObject({ kind: 'failed', error: { message: `ReferenceError: ${name} is not defined` } });
    }
  });

  it('keeps the BSON type of a value read through the script and back', async () => {
    const ran = await run('const o = db.orders.findOne({});\ndb.orders.insertOne(o)', (call) =>
      call.method === 'findOne'
        ? { n: { $numberInt: '7' }, total: { $numberDouble: '5.0' }, big: { $numberLong: '9' } }
        : {},
    );
    expect(ran.calls[1]?.arguments).toEqual([
      { n: { $numberInt: '7' }, total: { $numberDouble: '5.0' }, big: { $numberLong: '9' } },
    ]);
  });

  it('reports the line of a failed call, and the error of the server', async () => {
    const ran = await run('db.orders.findOne({});\n\ndb.orders.insertOne({})', (call) =>
      call.method === 'insertOne' ? new Error('E11000 duplicate key') : null,
    );
    expect(ran.calls[1]?.line).toBe(3);
    expect(ran.end).toMatchObject({ kind: 'failed', error: { message: 'E11000 duplicate key', line: 3 } });
  });

  it('reports the line of an error of the script', async () => {
    const ran = await run('const u = null;\nu.name');
    expect(ran.end).toMatchObject({ kind: 'failed', error: { line: 2 } });
    expect(ran.end.kind === 'failed' ? ran.end.error.message : '').toMatch(/^TypeError: /u);
  });
});
