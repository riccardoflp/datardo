import { describe, expect, it } from 'vitest';
import { parsedValue } from '../../../src/features/aggregate/mongosh/parse';
import { indexQueryOfPipeline, parse } from '../../../src/features/explain/run';
import { indexKeysText, suggestedIndex } from '../../../src/features/explain/suggest-index';
import type { Json } from '../../../src/shared/engine-request';
import { explainReply } from './replies';

/** A value of mongosh syntax as `query.parse` gives it: canonical Extended JSON. */
function value(text: string): Json {
  const parsed = parsedValue(text, 0, () => '000000000000000000000000');
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  return parsed.value;
}

/** The keys suggested for a filter and a sort, as the Explain section writes them; `nothing` when there is none. */
function keysOf(filter: string, sort?: string): string {
  const keys = suggestedIndex(value(filter), sort === undefined ? undefined : value(sort));
  return keys === undefined ? 'nothing' : indexKeysText(keys);
}

describe('explain.suggest-index', () => {
  it.each([
    ['{ status: "paid", total: { $gte: 100 } }', '{ createdAt: -1 }', '{ status: 1, createdAt: -1, total: 1 }'],
    [
      '{ age: { $gte: 18 }, status: "active", country: { $in: ["it", "fr"] } }',
      '{ createdAt: -1 }',
      '{ status: 1, country: 1, createdAt: -1, age: 1 }',
    ],
    ['{ status: "paid" }', '{ status: -1, createdAt: -1 }', '{ status: 1, createdAt: -1 }'],
    ['{ name: /^ma/i }', undefined, '{ name: 1 }'],
    [
      '{ name: /^a/, a: { $ne: 1 }, b: { $exists: true }, c: { $eq: 2 }, tags: { $elemMatch: { k: "x" } } }',
      undefined,
      '{ c: 1, tags: 1, name: 1, a: 1, b: 1 }',
    ],
    ['{ a: { $gt: 1, $in: [1, 2] }, b: { $size: 2 }, c: { $all: [1] }, d: null }', undefined, '{ a: 1, d: 1 }'],
    ['{ $or: [{ a: 1 }, { b: 2 }], c: 1 }', undefined, '{ c: 1 }'],
    [
      '{ _id: ObjectId("0123456789abcdef01234567"), d: ISODate("2024-01-01T00:00:00Z") }',
      undefined,
      '{ _id: 1, d: 1 }',
    ],
    ['{}', '{ ts: -1 }', '{ ts: -1 }'],
    ['{ $expr: { $gt: ["$a", "$b"] } }', undefined, 'nothing'],
    ['{}', '{}', 'nothing'],
  ])('suggests for %s and the sort %s the keys %s', (filter, sort, keys) => {
    expect(keysOf(filter, sort)).toBe(keys);
  });

  it('gives a pipeline that starts with $match and $sort their keys, and one that starts with $group none', () => {
    const matchThenSort = [value('{ $match: { status: "paid" } }'), value('{ $sort: { createdAt: -1 } }')];
    const query = indexQueryOfPipeline(matchThenSort);
    const keys = suggestedIndex(query.filter, query.sort);
    expect(keys === undefined ? 'nothing' : indexKeysText(keys)).toBe('{ status: 1, createdAt: -1 }');
    const grouped = indexQueryOfPipeline([value('{ $group: { _id: "$status" } }'), value('{ $sort: { _id: 1 } }')]);
    expect(suggestedIndex(grouped.filter, grouped.sort)).toBeUndefined();
  });

  it('gives a pipeline that starts with $sort the keys of the sort', () => {
    const query = indexQueryOfPipeline([value('{ $sort: { createdAt: -1 } }'), value('{ $match: { a: 1 } }')]);
    expect(query).toEqual({ sort: value('{ createdAt: -1 }') });
  });

  it('gives a filter that is not an object the keys of the sort alone', () => {
    const keys = suggestedIndex(value('[1, 2]'), value('{ createdAt: -1, total: 1 }'));
    expect(keys).toEqual([
      { field: 'createdAt', direction: -1 },
      { field: 'total', direction: 1 },
    ]);
  });

  it('suggests nothing for an explain with an index and no in-memory sort, whatever the rule would give', () => {
    const args = { mode: 'find', query: { filter: '{ status: "paid", total: { $gt: 1 } }', sort: '' } };
    expect(parse([explainReply('find-ixscan')], args).suggestion).toBeUndefined();
  });

  it('suggests the keys for an explain with a COLLSCAN or an in-memory sort', () => {
    const collscan = parse([explainReply('find-collscan')], { mode: 'find', query: { filter: '{ status: "paid" }' } });
    expect(collscan.suggestion).toEqual([{ field: 'status', direction: 1 }]);
    const sorted = parse([explainReply('find-ixscan-sort')], {
      mode: 'find',
      query: { filter: '{ status: "paid" }', sort: '{ createdAt: -1 }' },
    });
    expect(sorted.suggestion).toEqual([
      { field: 'status', direction: 1 },
      { field: 'createdAt', direction: -1 },
    ]);
  });
});
