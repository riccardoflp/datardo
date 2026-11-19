import { describe, expect, it } from 'vitest';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import * as count from '../../../src/features/query/count';
import * as hints from '../../../src/features/query/field-hints';
import { bsonType, type JsonObject } from '../../../src/features/query/mongosh/ejson';
import * as run from '../../../src/features/query/run';
import { emptyTexts, type QueryTexts } from '../../../src/features/query/types';
import { contextOf, now, recorded, stateWithSettings } from './context';
import { everyType } from './values';

function sent(outcome: ReturnType<typeof run.request> | ReadRequest): MongoRequest {
  if (outcome.kind !== 'engine') {
    throw new Error(`Expected a request, got ${JSON.stringify(outcome)}`);
  }
  const [first] = outcome.requests;
  if (first?.request.engine !== 'mongodb') {
    throw new Error('Expected a request to MongoDB.');
  }
  return first.request;
}

function runOf(texts: Partial<QueryTexts>, page = 1, pageSize = 50, settings: Readonly<Record<string, Json>> = {}) {
  const args = { texts: { ...emptyTexts, ...texts }, page, pageSize, at: now };
  return run.request(contextOf('query.run', stateWithSettings(settings)), args);
}

/** The Log form of what `query.run` sends. */
function logged(texts: Partial<QueryTexts>, page = 1, pageSize = 50): string {
  const checked = run.checkedQuery({ ...emptyTexts, ...texts }, now);
  if (!checked.ok) {
    return checked.message;
  }
  return run.findText('orders', checked.query, run.runWindow(checked.query, page, pageSize), 60_000);
}

describe('query.run', () => {
  it('sends find({}) with the first page of 50 when every field is empty', () => {
    expect(logged({})).toBe('db.orders.find({}).skip(0).limit(50).maxTimeMS(60000)');
    const request = sent(runOf({}));
    expect(request).toMatchObject({
      database: 'shop',
      collection: 'orders',
      method: 'find',
      limit: 50,
      timeLimitMs: 60_000,
    });
    expect(request.arguments).toEqual([{}, { skip: 0, limit: 50, maxTimeMS: 60_000 }]);
  });

  it('sends the filter, the projection and the sort of page 2', () => {
    const texts = { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }', project: '{ total: 1 }' };
    expect(logged(texts, 2)).toBe(
      'db.orders.find({ status: "paid" }, { total: 1 }).sort({ createdAt: -1 }).skip(50).limit(50).maxTimeMS(60000)',
    );
    expect(sent(runOf(texts, 2)).arguments).toEqual([
      { status: 'paid' },
      {
        projection: { total: { $numberInt: '1' } },
        sort: { createdAt: { $numberInt: '-1' } },
        skip: 50,
        limit: 50,
        maxTimeMS: 60_000,
      },
    ]);
  });

  it('refuses a filter that is not mongosh syntax, and a sort that is not an object, outlining the field', () => {
    expect(runOf({ filter: '{ status: }' })).toEqual({
      kind: 'refuse',
      code: 'query.run/syntax',
      message: 'Invalid query syntax — check the highlighted field.',
    });
    const filter = run.checkedQuery({ ...emptyTexts, filter: '{ status: }' }, now);
    expect(!filter.ok && filter.invalid).toEqual(['filter']);
    const sort = run.checkedQuery({ ...emptyTexts, sort: '[1]' }, now);
    expect(!sort.ok && [sort.code, sort.invalid]).toEqual(['query.run/syntax', ['sort']]);
  });

  it('refuses a Skip and a Limit that are not whole numbers', () => {
    expect(runOf({ skip: '-1' })).toMatchObject({
      code: 'query.run/skip',
      message: 'Skip must be a whole number, 0 or more.',
    });
    expect(runOf({ skip: '2.5' })).toMatchObject({ code: 'query.run/skip' });
    expect(runOf({ limit: '0' })).toMatchObject({
      code: 'query.run/limit',
      message: 'Limit must be a whole number, 1 or more, or empty.',
    });
    expect(runOf({ limit: 'x' })).toMatchObject({ code: 'query.run/limit' });
  });

  it('reads ISODate() as the time the query was run, the same for the count', () => {
    const request = sent(runOf({ filter: '{ at: { $lt: ISODate() } }' }));
    const date = { $date: { $numberLong: String(now) } };
    expect(request.arguments[0]).toEqual({ at: { $lt: date } });
    const counted = sent(count.request(contextOf('query.count'), { filter: '{ at: { $lt: ISODate() } }', at: now }));
    expect(counted.arguments[0]).toEqual({ at: { $lt: date } });
  });

  it('keeps the type of a value on the way to the server', () => {
    const request = sent(runOf({ filter: '{ qty: NumberLong("9007199254740993"), price: NumberDecimal("12.50") }' }));
    expect(request.arguments[0]).toEqual({
      qty: { $numberLong: '9007199254740993' },
      price: { $numberDecimal: '12.50' },
    });
  });

  it('keeps the type of every value on the way back, from a reply of a real server', () => {
    const { documents } = run.parse([recorded('mongodb-8.2-find-every-type.json')]);
    const [document] = documents;
    expect(document).toBeDefined();
    const back = document as JsonObject;
    expect(bsonType(back['int32'] as Json)).toBe('int');
    expect(bsonType(back['int64'] as Json)).toBe('long');
    expect(bsonType(back['double'] as Json)).toBe('double');
    expect(bsonType(back['decimal'] as Json)).toBe('decimal');
    expect(back['int64Big']).toEqual({ $numberLong: '9007199254740993' });
    expect(bsonType(back['dateBefore1970'] as Json)).toBe('date');
    expect(bsonType(back['dateFar'] as Json)).toBe('date');
    for (const key of Object.keys(everyType).filter((each) => !['undefined', 'dateBeyondJavaScript'].includes(each))) {
      expect(back[key], key).toEqual(everyType[key]);
    }
  });

  it('sends maxTimeMS of the setting and says the seconds when the server stops the query', () => {
    expect(sent(runOf({}, 1, 50, { 'datardo.query.timeLimitSeconds': 5 }))).toMatchObject({
      timeLimitMs: 5000,
      arguments: [{}, { maxTimeMS: 5000 }],
    });
    expect(run.failureLine({ code: 50, message: 'operation exceeded time limit' }, 60_000).message).toBe(
      'The server took longer than 60 seconds.',
    );
  });

  it('shows an error of the server in its own words', () => {
    expect(run.failureLine({ code: 2, message: 'unknown operator: $foo' }, 60_000)).toEqual({
      message: 'unknown operator: $foo',
      details: 'unknown operator: $foo',
      runAgain: true,
    });
    expect(run.cancelledLine).toEqual({ message: 'Cancelled', runAgain: true });
  });

  it('runs on a view and through a read-only connection the same', () => {
    expect(sent(runOf({})).method).toBe('find');
  });

  it('writes a collection whose name is not an identifier with getCollection', () => {
    expect(run.collectionText('2024 orders')).toBe('db.getCollection("2024 orders")');
  });
});

describe('query.count', () => {
  const counted = (args: Json, settings: Readonly<Record<string, Json>> = {}) =>
    sent(count.request(contextOf('query.count', stateWithSettings(settings)), args));

  it('sends estimatedDocumentCount for an empty filter on a collection, and not countDocuments', () => {
    const request = counted({ filter: '' });
    expect(request.method).toBe('estimatedDocumentCount');
    expect(count.countText(request)).toBe('db.orders.estimatedDocumentCount({ maxTimeMS: 10000 })');
  });

  it('sends countDocuments with the filter', () => {
    expect(count.countText(counted({ filter: '{ status: "paid" }' }))).toBe(
      'db.orders.countDocuments({ status: "paid" }, { maxTimeMS: 10000 })',
    );
  });

  it('sends countDocuments({}) for an empty filter on a view', () => {
    expect(count.countText(counted({ filter: '', kind: 'view' }))).toBe(
      'db.orders.countDocuments({}, { maxTimeMS: 10000 })',
    );
    expect(counted({ filter: '', kind: 'timeseries' }).method).toBe('countDocuments');
  });

  it('counts exactly on a click, with the time limit of the query', () => {
    expect(count.countText(counted({ filter: '', exact: true }))).toBe(
      'db.orders.countDocuments({}, { maxTimeMS: 60000 })',
    );
  });

  it('reads the totals of real replies, estimated or exact', () => {
    expect(count.parse([recorded('mongodb-8.2-query-estimatedDocumentCount.json')], { filter: '' })).toEqual({
      count: 5,
      estimated: true,
    });
    expect(count.parse([recorded('mongodb-8.2-countDocuments.json')], { filter: '{ status: "paid" }' })).toEqual({
      count: 3,
      estimated: false,
    });
    expect(count.parse([1198], { filter: '', exact: true })).toEqual({ count: 1198, estimated: false });
  });

  it('writes a count of 1,204 as 1,204', () => {
    expect(count.countWritten(1204)).toBe('1,204');
    expect(count.countWritten(1_000_000)).toBe('1,000,000');
    expect(count.countWritten(12)).toBe('12');
  });
});

describe('query.field-hints', () => {
  it('sends the sample of 500 documents with a limit of 20 seconds', () => {
    const request = sent(hints.request(contextOf('query.field-hints'), null));
    expect(request).toMatchObject({ database: 'shop', collection: 'orders', method: 'aggregate', timeLimitMs: 20_000 });
    expect(request.arguments).toEqual([[{ $sample: { size: 500 } }], { maxTimeMS: 20_000 }]);
  });

  it('gives the share of a field and its 10 most frequent values, the most frequent first', () => {
    const documents: Json[] = Array.from({ length: 500 }, (_, index) =>
      index < 400 ? { status: `s${String(index % 12)}`, n: index < 300 ? 'common' : 'other' } : {},
    );
    const status = hints.hintsOfDocuments(documents).find((hint) => hint.path === 'status');
    expect(status?.ratio).toBe(0.8);
    expect(status?.values).toHaveLength(10);
    const n = hints.hintsOfDocuments(documents).find((hint) => hint.path === 'n');
    expect(n?.values).toEqual([
      { value: 'common', count: 300 },
      { value: 'other', count: 100 },
    ]);
  });

  it('keeps the types apart and puts the fields of elements under the array', () => {
    const found = hints.parse([recorded('mongodb-8.2-sample.json')]);
    const byPath = new Map(found.map((hint) => [hint.path, hint]));
    expect([...byPath.keys()]).toEqual(['_id', 'status', 'total', 'items', 'items.sku', 'items.qty', 'vector']);
    expect(byPath.get('total')?.types).toEqual(['double', 'int']);
    expect(byPath.get('status')?.values[0]).toEqual({ value: 'paid', count: 3 });
    expect(byPath.get('items.sku')?.ratio).toBe(1);
    expect(byPath.get('vector')?.vector).toEqual({ min: 2, max: 2 });
    expect(byPath.get('items')?.vector).toBeUndefined();
  });

  it('gives the fields of all the documents of a small collection, and none for a failed sample', () => {
    expect(
      hints.hintsOfDocuments(Array.from({ length: 30 }, (_, index) => ({ [`f${String(index)}`]: 1 }))),
    ).toHaveLength(30);
    expect(hints.parse([])).toEqual([]);
  });
});
