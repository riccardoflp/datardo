import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { addLeft, addRight, finishPairing, startPairing } from '../../../src/features/compare/pairing/pairing';
import { sha1 } from '../../../src/features/compare/pairing/sha1';
import { parse, request } from '../../../src/features/compare/read';
import type { CompareResult, ComparisonOptions } from '../../../src/features/compare/types';
import type { Json } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextWith, int, leftSide, long, recorded, refusalOf, rightSide } from './context';

const defaults: ComparisonOptions = { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true };

function argsOf(options: Partial<ComparisonOptions> = {}): Json {
  return { left: leftSide, right: rightSide, options: { ...defaults, ...options } };
}

function compared(
  left: readonly Json[],
  right: readonly Json[],
  options: Partial<ComparisonOptions> = {},
): CompareResult {
  return parse([left, right], argsOf(options)) as CompareResult;
}

describe('compare.read', () => {
  const context = contextWith('compare.read');

  it('sends find with the filter to both sides, in batches of 1,000, with no sort, projection or time limit', () => {
    const read = request(context, argsOf({ filter: '{ status: "active" }' })) as ReadRequest;
    expect(read.kind).toBe('engine');
    const requests = read.kind === 'engine' ? read.requests : [];
    expect(requests.map((each) => [each.connection, each.request])).toEqual([
      [
        'c-local',
        {
          engine: 'mongodb',
          database: 'shop',
          collection: 'orders',
          method: 'find',
          arguments: [{ status: 'active' }, { batchSize: 1000 }],
          limit: 1_000_001,
        },
      ],
      [
        'c-prod',
        {
          engine: 'mongodb',
          database: 'shop',
          collection: 'orders',
          method: 'find',
          arguments: [{ status: 'active' }, { batchSize: 1000 }],
          limit: 1_000_001,
        },
      ],
    ]);
  });

  it('sends {} for an empty filter', () => {
    const read = request(context, argsOf()) as ReadRequest;
    expect(
      read.kind === 'engine' && read.requests[0]?.request.engine === 'mongodb' && read.requests[0].request.arguments[0],
    ).toEqual({});
  });

  it('refuses a filter that is not valid with the message of query.parse and reads nothing', () => {
    expect(refusalOf(request(context, argsOf({ filter: '{ status: ' }))).code).toBe('compare.read/filter');
    expect(refusalOf(request(context, argsOf({ filter: '[1]' }))).message).toBe('Filter: must be an object');
  });

  it('pairs the recorded documents of MongoDB 8.2 by _id and with their types', () => {
    const result = compared(recorded('find-left') as Json[], recorded('find-right') as Json[]);
    expect(result.counts).toEqual({ identical: 3, different: 2, onlyLeft: 2, onlyRight: 2 });
    expect(result.differences).toEqual([
      { id: int(1), kind: 'different' },
      { id: int(7), kind: 'only-right' },
      { id: int(5), kind: 'different' },
      { id: long('6'), kind: 'only-right' },
      { id: int(4), kind: 'only-left' },
      { id: int(6), kind: 'only-left' },
    ]);
  });

  it('counts as only left a document active on the left and not on the right', () => {
    const result = compared([{ _id: int(1), status: 'active' }], [], { filter: '{ status: "active" }' });
    expect(result.counts.onlyLeft).toBe(1);
    expect(result.filtered).toBe(true);
  });

  it('counts identical a document that differs only in a field named in Ignore', () => {
    const result = compared(
      [{ _id: int(1), a: int(1), updatedAt: int(1) }],
      [{ _id: int(1), a: int(1), updatedAt: int(2) }],
      {
        ignore: 'updatedAt',
      },
    );
    expect(result.counts).toEqual({ identical: 1, different: 0, onlyLeft: 0, onlyRight: 0 });
  });

  it('gives 5 only right for an empty left collection against one of 5 documents', () => {
    const right = [1, 2, 3, 4, 5].map((each) => ({ _id: int(each) }));
    expect(compared([], right).counts).toEqual({ identical: 0, different: 0, onlyLeft: 0, onlyRight: 5 });
  });

  it('finds nothing in two empty collections', () => {
    const result = compared([], []);
    expect(result.differences).toEqual([]);
    expect(result.counts).toEqual({ identical: 0, different: 0, onlyLeft: 0, onlyRight: 0 });
  });

  it('pairs _id 1 and NumberLong(1) never, whatever Compare numbers by value says', () => {
    const result = compared([{ _id: int(1) }], [{ _id: long('1') }], { numbersByValue: true });
    expect(result.counts).toEqual({ identical: 0, different: 0, onlyLeft: 1, onlyRight: 1 });
  });

  it('pairs _ids that are sub-documents with their fields in the same order and types', () => {
    const result = compared(
      [{ _id: { a: int(1), b: int(2) } }, { _id: { a: int(3), b: int(4) } }],
      [{ _id: { a: int(1), b: int(2) } }, { _id: { b: int(4), a: int(3) } }],
    );
    expect(result.counts).toEqual({ identical: 1, different: 0, onlyLeft: 1, onlyRight: 1 });
  });

  it('stops at the 1,000,001st document of a side, naming its collection', () => {
    const pairing = startPairing({
      options: defaults,
      left: { ...leftSide, connection: leftSide.connection as never, connectionName: 'Local' },
      right: {
        ...rightSide,
        collection: 'orders_2023',
        connection: rightSide.connection as never,
        connectionName: 'Production',
      },
    });
    const batch = Array.from({ length: 1000 }, (_, index) => ({ _id: int(index) }));
    for (let round = 0; round < 1000; round += 1) {
      expect(addRight(pairing, batch).kind).toBe('going');
    }
    expect(refusalOf(addRight(pairing, [{ _id: int(-1) }]))).toEqual({
      code: 'compare.read/too-many',
      message: 'orders_2023 has more than 1,000,000 documents to compare: narrow them with a filter.',
    });
  });

  it('says how the read goes for runner.progress', () => {
    const sides = { connectionName: 'Local', ...leftSide, connection: leftSide.connection as never };
    const pairing = startPairing({ options: defaults, left: sides, right: sides });
    expect(addLeft(pairing, [{ _id: int(1) }, { _id: int(2) }])).toEqual({
      kind: 'going',
      progress: 'Reading the left side… 2 documents',
    });
    expect(addRight(pairing, [{ _id: int(1) }])).toEqual({
      kind: 'going',
      progress: 'Comparing with the right side… 1 of 2+ documents',
    });
    expect(finishPairing(pairing).counts).toEqual({ identical: 1, different: 0, onlyLeft: 1, onlyRight: 0 });
  });

  it('keeps of each left document only its _id and the SHA-1 of its text', () => {
    const sides = { connectionName: 'Local', ...leftSide, connection: leftSide.connection as never };
    const pairing = startPairing({ options: defaults, left: sides, right: sides });
    addLeft(pairing, [{ _id: int(1), big: 'x'.repeat(10_000) }]);
    expect([...pairing.left.entries()]).toEqual([['{"$numberInt":"1"}', expect.stringMatching(/^[0-9a-f]{40}$/u)]]);
  });

  it('hashes with SHA-1 as FIPS 180-4 says', () => {
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
    for (const each of ['é ü 漢字 🎉', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(10_000)]) {
      expect(sha1(each)).toBe(createHash('sha1').update(each, 'utf8').digest('hex'));
    }
  });
});
