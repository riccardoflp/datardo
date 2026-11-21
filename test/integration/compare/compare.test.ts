/**
 * The comparison of two collections against the test replica set (M35): both sides read in batches and paired in the
 * main process, the BSON types told apart, a filter that is not valid refused before anything is read, a document
 * copied byte for byte, a side made like the other and undone as one operation, and a read-only side refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CompareResult } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Target } from '../../../src/shared/target';
import { liveCompare, localId, readOnlyId, type LiveCompare } from './live';

const database = 'm35_compare';
let live: LiveCompare;

function int(value: number): Json {
  return { $numberInt: String(value) };
}

const leftDocuments: readonly Json[] = [
  { _id: int(1), status: 'new', total: int(10) },
  { _id: int(2), n: int(1) },
  { _id: int(3), same: true },
  { _id: int(4), price: { $numberDecimal: '9.99' }, big: { $numberLong: '9007199254740993' }, small: int(7) },
  { _id: int(5), only: 'left' },
];

const rightDocuments: readonly Json[] = [
  { _id: int(1), status: 'paid', total: int(10) },
  { _id: int(2), n: { $numberDouble: '1.0' } },
  { _id: int(3), same: true },
  { _id: int(6), only: 'right' },
];

function side(collection: string, connection = localId): Json {
  return { connection, database, collection, view: false };
}

function where(collection: string): Target {
  return { kind: 'collection', connection: localId, database, collection };
}

const options = { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true };

async function seed(): Promise<void> {
  await live.send(database, undefined, 'runCommand', [{ dropDatabase: int(1) }]);
  await live.send(database, 'left', 'insertMany', [leftDocuments, {}]);
  await live.send(database, 'right', 'insertMany', [rightDocuments, {}]);
}

async function compared(more: Partial<typeof options> = {}): Promise<CompareResult> {
  const args = { left: side('left'), right: side('right'), options: { ...options, ...more } };
  const result = await live.start('compare.read', where('left'), args);
  if (result.kind !== 'read') {
    throw new Error(`Expected a read, got ${JSON.stringify(result)}`);
  }
  return result.result as CompareResult;
}

beforeAll(async () => {
  live = await liveCompare();
  await seed();
}, 120_000);

afterAll(async () => {
  await live.send(database, undefined, 'runCommand', [{ dropDatabase: int(1) }]);
  await live.close();
});

describe('compare.read', () => {
  it('counts the identical, different and one-sided documents; 1 and 1.0 differ only by type', async () => {
    const byValue = await compared();
    expect(byValue.counts).toEqual({ identical: 2, different: 1, onlyLeft: 2, onlyRight: 1 });
    const byType = await compared({ numbersByValue: false });
    expect(byType.counts).toEqual({ identical: 1, different: 2, onlyLeft: 2, onlyRight: 1 });
    expect(byType.differences).toContainEqual({ id: int(2), kind: 'different' });
  });

  it('compares only the documents of the filter, and says so', async () => {
    const result = await compared({ filter: '{ _id: { $in: [3] } }' });
    expect(result.counts).toEqual({ identical: 1, different: 0, onlyLeft: 0, onlyRight: 0 });
    expect(result.filtered).toBe(true);
  });

  it('refuses a filter that is not valid without reading', async () => {
    const args = { left: side('left'), right: side('right'), options: { ...options, filter: '{ status: ' } };
    expect(await live.start('compare.read', where('left'), args)).toMatchObject({
      kind: 'refused',
      code: 'compare.read/filter',
    });
  });
});

describe('compare.copy-document', () => {
  it('copies a document to the other side keeping every BSON type, and Undo takes it away', async () => {
    const before = await live.stored(database, 'right');
    const args = {
      left: side('left'),
      right: side('right'),
      to: 'right',
      difference: { id: int(4), kind: 'only-left' },
    };
    expect(await live.start('compare.copy-document', where('right'), args)).toEqual({ kind: 'done' });
    const left = await live.stored(database, 'left');
    const right = await live.stored(database, 'right');
    const copied = right.filter((each) => !before.includes(each));
    expect(copied).toHaveLength(1);
    expect(left).toContain(copied[0]);
    const [notice] = live.state().runner.notifications.slice(-1);
    expect(notice?.text).toBe('Wrote 1 document in Local › m35_compare.right.');
    const undo = notice?.actions?.[0];
    expect(undo?.label).toBe('Undo');
    expect(await live.start(undo?.feature ?? '', undo?.target ?? where('right'), undo?.args ?? null)).toEqual({
      kind: 'done',
    });
    expect(await live.stored(database, 'right')).toEqual(before);
  });
});

describe('compare.make-like', () => {
  it('makes the right side like the left, deletes included, and Undo restores it as one operation', async () => {
    const before = await live.stored(database, 'right');
    const found = await compared({ numbersByValue: false });
    live.answers = { deletes: 'delete' };
    const args = {
      left: side('left'),
      right: side('right'),
      to: 'right',
      differences: found.differences as unknown as Json,
    };
    expect(await live.start('compare.make-like', where('right'), args)).toEqual({ kind: 'done' });
    expect(live.confirmed.at(-1)).toContain('Make right like left in Local › m35_compare.right?');
    expect((await compared({ numbersByValue: false })).counts).toEqual({
      identical: 5,
      different: 0,
      onlyLeft: 0,
      onlyRight: 0,
    });
    expect(await live.stored(database, 'right')).toEqual(await live.stored(database, 'left'));
    const [notice] = live.state().runner.notifications.slice(-1);
    expect(notice?.text).toBe('Wrote 4 documents, deleted 1 in Local › m35_compare.right.');
    const undo = notice?.actions?.[0];
    expect(await live.start(undo?.feature ?? '', undo?.target ?? where('right'), undo?.args ?? null)).toEqual({
      kind: 'done',
    });
    expect(await live.stored(database, 'right')).toEqual(before);
  });

  it('refuses to write to a side on a read-only connection', async () => {
    const found = await compared();
    const args = {
      left: side('left'),
      right: side('right', readOnlyId),
      to: 'right',
      differences: found.differences as unknown as Json,
    };
    const target: Target = { kind: 'collection', connection: readOnlyId, database, collection: 'right' };
    expect(await live.start('compare.make-like', target, args)).toMatchObject({
      kind: 'refused',
      code: 'compare.make-like/read-only',
    });
  });
});
