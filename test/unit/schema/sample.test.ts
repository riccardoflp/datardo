import { describe, expect, it } from 'vitest';
import { schemaSummary } from '../../../src/features/schema/analyze';
import {
  countOfReply,
  documentsRequest,
  parse,
  request,
  sampleAction,
  sampleSize,
  type SampleWork,
} from '../../../src/features/schema/sample';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Outcome, ReadRequest } from '../../../src/shared/feature';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { contextInTab, contextOn, schemaDocuments, schemaReply } from './context';

function workOf(result: ReadRequest | Outcome): SampleWork {
  if (result.kind !== 'app' || result.action !== sampleAction) {
    throw new Error(`Expected the app read of the sample, got ${JSON.stringify(result)}`);
  }
  return result.args as unknown as SampleWork;
}

/** A request as mongosh would write it: `estimatedDocumentCount()`, `aggregate([…], { … })`. */
function written(sent: MongoRequest): string {
  return `${sent.method}(${sent.arguments.map((each) => mongoshValue(each)).join(', ')})`;
}

/** What the server receives for a count: the count, then the documents request it chooses. */
function sentFor(args: Json, count: number, readOnly = false): readonly string[] {
  const work = workOf(request(contextOn('schema.sample', readOnly), args));
  return [written(work.count), written(documentsRequest(work, count))];
}

describe('schema.sample', () => {
  it('sends estimatedDocumentCount and an aggregate of $sample alone for an empty filter on 52,310 documents', () => {
    expect(sentFor({ filter: '', size: 1000 }, 52_310)).toEqual([
      'estimatedDocumentCount()',
      'aggregate([{ $sample: { size: 1000 } }], { allowDiskUse: true, maxTimeMS: 120000 })',
    ]);
    const work = workOf(request(contextOn('schema.sample'), {}));
    expect(work).toMatchObject({ connection: 'c-local', size: 1000 });
    expect(work.count).toMatchObject({ database: 'shop', collection: 'orders', timeLimitMs: 60_000 });
    expect(documentsRequest(work, 52_310)).toMatchObject({ timeLimitMs: 120_000, limit: 1000 });
  });

  it('counts the documents of a filter and reads them all, with $match and $limit, when 300 match', () => {
    expect(sentFor({ filter: '{ status: "paid" }' }, 300)).toEqual([
      'countDocuments({ status: "paid" }, { maxTimeMS: 60000 })',
      'aggregate([{ $match: { status: "paid" } }, { $limit: 1000 }], { allowDiskUse: true, maxTimeMS: 120000 })',
    ]);
  });

  it('analyzes every document read, out of the recorded count', () => {
    const count = countOfReply(schemaReply('paid-count'));
    expect(count).toBe(3);
    const summary = schemaSummary(schemaDocuments('paid'));
    const result = parse([{ count, summary, milliseconds: 12 }]);
    expect(result).toMatchObject({ outOf: 3, milliseconds: 12 });
    expect(result.summary.analyzed).toBe(3);
  });

  it('counts with countDocuments({}) on a view with an empty filter', () => {
    const work = workOf(request(contextInTab('schema.sample', true), { filter: '' }));
    expect(written(work.count)).toBe('countDocuments({}, { maxTimeMS: 60000 })');
    const collection = workOf(request(contextInTab('schema.sample'), { filter: '' }));
    expect(written(collection.count)).toBe('estimatedDocumentCount()');
  });

  it('reads again with $sample of 100 when Sample is changed to 100', () => {
    expect(sentFor({ size: 100 }, 52_310)[1]).toBe(
      'aggregate([{ $sample: { size: 100 } }], { allowDiskUse: true, maxTimeMS: 120000 })',
    );
    expect([sampleSize(100), sampleSize(10_000), sampleSize(5), sampleSize('100')]).toEqual([100, 10_000, 1000, 1000]);
  });

  it('reports a field with an Int32 in one document and a Double in another with the types int and double', () => {
    const documents = schemaDocuments('every-type').slice(1, 3);
    const [field] = schemaSummary(documents).fields.filter((each) => each.name === 'v');
    expect(field?.types.map((type) => type.type)).toEqual(['int', 'double']);
  });

  it('sends nothing for the filter { status: , and says why', () => {
    expect(request(contextOn('schema.sample'), { filter: '{ status: ' })).toEqual({
      kind: 'refuse',
      code: 'schema.sample/invalid-filter',
      message: 'Invalid query syntax — check the highlighted field.',
    });
    expect(request(contextOn('schema.sample'), { filter: '[1, 2]' })).toMatchObject({
      code: 'schema.sample/invalid-filter',
    });
  });

  it('does not send the sort and the projection typed in the query bar', () => {
    const args = { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }', projection: '{ total: 1 }' };
    const sent = [...sentFor(args, 5000), ...sentFor(args, 5)].join(' ');
    expect(sent).not.toMatch(/createdAt|total|\$sort|\$project/u);
  });

  it('runs the same through a read-only connection, sending only reads', () => {
    expect(sentFor({ filter: '{ status: "paid" }' }, 300, true)).toEqual(
      sentFor({ filter: '{ status: "paid" }' }, 300),
    );
  });

  it('shows out of the documents read when an estimated count is smaller', () => {
    const summary = schemaSummary(schemaDocuments('worked-example'));
    expect(parse([{ count: 2, summary, milliseconds: 4 }]).outOf).toBe(4);
    expect(parse([undefined])).toEqual({ summary: { analyzed: 0, fields: [] }, outOf: 0, milliseconds: 0 });
  });

  it('reads a count given as a number or as a number of Extended JSON', () => {
    expect(countOfReply(52_310)).toBe(52_310);
    expect(countOfReply({ $numberLong: '52310' })).toBe(52_310);
    expect(countOfReply(schemaReply('worked-example-count'))).toBe(4);
    expect(countOfReply('nothing')).toBe(0);
  });

  it('reads nothing without a collection', () => {
    const context = { ...contextOn('schema.sample'), target: { kind: 'app' as const } };
    expect(request(context, {})).toEqual({ kind: 'engine', requests: [] });
  });
});
