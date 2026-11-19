import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../../../src/features/query/mongosh/ejson';
import { nextToRead, runAfter, startRun } from '../../../src/features/search/model/run';
import {
  isReportDue,
  parse,
  request,
  scanArgs,
  scanEnded,
  scanFailed,
  scanned,
  startScan,
} from '../../../src/features/search/scan';
import { wanted } from '../../../src/features/search/text';
import { firstInput, type ReadLimit, type SearchCollection, type SearchRun } from '../../../src/features/search/types';
import type { Json } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextOn, int, local, objectId, recorded } from './context';

const orders: SearchCollection = { database: 'shop', collection: 'orders', view: false, estimate: 5000 };
const looking = { wanted: wanted('mario', 'contains', false), fieldNames: false };

function findOf(read: ReadLimit) {
  const args = scanArgs({
    connection: local.id,
    collection: orders,
    read,
    text: 'mario',
    mode: 'contains',
    matchCase: false,
    fieldNames: false,
  });
  const sent = request(contextOn('search.scan'), args) as Extract<ReadRequest, { kind: 'engine' }>;
  const request0 = sent.requests[0]?.request;
  if (request0?.engine !== 'mongodb') {
    throw new Error('Expected a MongoDB request');
  }
  return request0;
}

function documents(count: number, from = 0, text = 'other'): readonly JsonObject[] {
  return Array.from({ length: count }, (_, index) => ({ _id: int(from + index), name: text }));
}

function running(collections: readonly SearchCollection[]): SearchRun {
  const started = startRun(1, { ...firstInput, text: 'mario' }, 1000);
  return runAfter(started, { kind: 'listed', search: 1, collections, at: 1100 });
}

function collection(name: string): SearchCollection {
  return { database: 'shop', collection: name, view: false };
}

describe('search.scan', () => {
  it('sends find({}).limit(1000) in batches of 500 with Read at the first 1,000', () => {
    const sent = findOf(1000);
    expect(sent).toMatchObject({ database: 'shop', collection: 'orders', method: 'find', limit: 1000 });
    expect(sent.arguments).toEqual([{}, { batchSize: int(500), limit: int(1000) }]);
  });

  it('sends no limit and no time limit with every document', () => {
    const sent = findOf(0);
    expect(sent.arguments).toEqual([{}, { batchSize: int(500) }]);
    expect(sent.limit).toBeUndefined();
    expect(sent.timeLimitMs).toBeUndefined();
  });

  it('says first 1,000 read for a collection of 5,000 read up to Read, and nothing of the kind for 800', () => {
    const big = scanEnded(scanned(startScan(orders), documents(1000), looking), 1000);
    expect(big.state).toEqual({ kind: 'first-read', limit: 1000 });
    const small = scanEnded(scanned(startScan(orders), documents(800), looking), 1000);
    expect(small.state).toEqual({ kind: 'read' });
  });

  it('lists 50 of 2,345 matching documents, counts them all and keeps 1,000 _ids', () => {
    let scan = startScan(orders);
    for (let from = 0; from < 2345; from += 500) {
      scan = scanned(scan, documents(Math.min(500, 2345 - from), from, 'mario'), looking);
    }
    expect(scan.found).toBe(2345);
    expect(scan.results).toHaveLength(50);
    expect(scan.ids).toHaveLength(1000);
    expect(scan.ids[0]).toEqual(int(0));
  });

  it('keeps what was found in 300 documents when the read fails after them', () => {
    const read = scanned(startScan(orders), [...documents(299), { _id: int(299), name: 'mario' }], looking);
    const failed = scanFailed(read, 'cursor killed');
    expect(failed).toMatchObject({ read: 300, found: 1, state: { kind: 'error', message: 'cursor killed' } });
    const last = parse(
      [{ kind: 'error', message: 'not authorized on shop to execute command { find: "orders" }' }],
      null,
    );
    expect(last.state).toEqual({
      kind: 'error',
      message: 'not authorized on shop to execute command { find: "orders" }',
    });
  });

  it('matches a field holding NumberInt(42) as a number', () => {
    const scan = scanned(startScan(orders), [{ _id: int(1), qty: int(42) }], {
      wanted: wanted('42', 'contains', false),
      fieldNames: false,
    });
    expect(scan.results[0]?.matches[0]).toMatchObject({ path: 'qty', kind: 'number' });
  });

  it('reports a result at once, and documents read without results every 250 documents', () => {
    const start = startScan(orders);
    expect(isReportDue(start, scanned(start, documents(1, 0, 'mario'), looking))).toBe(true);
    expect(isReportDue(start, scanned(start, documents(200), looking))).toBe(false);
    expect(isReportDue(start, scanned(start, documents(250), looking))).toBe(true);
  });

  it('reads no more than 3 collections at the same time', () => {
    const names = Array.from({ length: 14 }, (_, index) => collection(`c${String(index).padStart(2, '0')}`));
    let search = running(names);
    expect(nextToRead(search)).toEqual([0, 1, 2]);
    search = [0, 1, 2].reduce(
      (each, index) =>
        runAfter(each, { kind: 'scanned', search: 1, index, scan: startScan(names[index] ?? orders), at: 1200 }),
      search,
    );
    expect(nextToRead(search)).toEqual([]);
    const done = scanEnded(startScan(names[1] ?? orders), 0);
    search = runAfter(search, { kind: 'scanned', search: 1, index: 1, scan: done, at: 1300 });
    expect(nextToRead(search)).toEqual([3]);
  });

  it('shows nothing that arrives after Stop, and reads nothing more', () => {
    const search = running([collection('a'), collection('b')]);
    const reading = runAfter(search, {
      kind: 'scanned',
      search: 1,
      index: 0,
      scan: startScan(collection('a')),
      at: 1200,
    });
    const stopped = runAfter(reading, { kind: 'stopped', search: 1, at: 1500 });
    expect(stopped.state).toBe('stopped');
    const late = scanned(startScan(collection('a')), documents(1, 0, 'mario'), looking);
    expect(runAfter(stopped, { kind: 'scanned', search: 1, index: 0, scan: late, at: 1600 })).toBe(stopped);
    expect(nextToRead(stopped)).toEqual([]);
  });

  it('drops a reply of a search that is no longer the current one', () => {
    const search = running([collection('a')]);
    const late = scanned(startScan(collection('a')), documents(1, 0, 'mario'), looking);
    expect(runAfter(search, { kind: 'scanned', search: 0, index: 0, scan: late, at: 1200 })).toBe(search);
  });

  it('ends when every collection has, with the time from Search to then', () => {
    const search = running([collection('a')]);
    const ended = runAfter(search, {
      kind: 'scanned',
      search: 1,
      index: 0,
      scan: scanEnded(startScan(collection('a')), 0),
      at: 3400,
    });
    expect(ended).toMatchObject({ state: 'done', endedAt: 3400, startedAt: 1000 });
  });

  it('finds the matches of a whole reply recorded from MongoDB 8.2', () => {
    const args: Json = scanArgs({
      connection: local.id,
      collection: { database: 'search-record', collection: 'orders', view: false },
      read: 0,
      text: 'A-17',
      mode: 'contains',
      matchCase: false,
      fieldNames: false,
    });
    const scan = parse(recorded('find-orders'), args);
    expect(scan.read).toBe(4);
    expect(scan.results.map((each) => each.idText)).toEqual(['ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")', '"A-17"']);
    expect(scan.ids).toEqual([objectId('65f1c0a2b3d4e5f6a7b8c9d0'), 'A-17']);
  });
});
