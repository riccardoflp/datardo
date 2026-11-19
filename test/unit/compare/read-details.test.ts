import { describe, expect, it } from 'vitest';
import { inspectorView } from '../../../src/features/compare/page/inspector';
import { parse as parseRead } from '../../../src/features/compare/read';
import { parse, previewText, request, type DetailEntry } from '../../../src/features/compare/read-details';
import type { CompareResult, Difference } from '../../../src/features/compare/types';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextWith, int, leftSide, recorded, rightSide } from './context';

const options = { filter: '', ignore: '', ignoreOrder: true, numbersByValue: true };

function differences(kind: Difference['kind'], count: number, from = 0): readonly Difference[] {
  return Array.from({ length: count }, (_, index) => ({ id: int(from + index), kind }));
}

function detailsArgs(given: readonly Difference[]): Json {
  return { mode: 'details', left: leftSide, right: rightSide, options, differences: given as unknown as Json };
}

function sent(read: ReadRequest): readonly (readonly [string, number])[] {
  return read.kind === 'engine'
    ? read.requests.map((each) => {
        const asked = each.request as MongoRequest;
        const filter = asked.arguments[0] as { _id: { $in: readonly Json[] } };
        return [each.connection, filter._id.$in.length] as const;
      })
    : [];
}

describe('compare.read-details', () => {
  const context = contextWith('compare.read-details');

  it('sends one find of 15 _ids to the left and one of 21 to the right', () => {
    const given = [
      ...differences('different', 12),
      ...differences('only-left', 3, 100),
      ...differences('only-right', 9, 200),
    ];
    expect(sent(request(context, detailsArgs(given)))).toEqual([
      ['c-local', 15],
      ['c-prod', 21],
    ]);
  });

  it('reads 300 of 1,204 different documents again on each side, in queries of 500 or fewer _ids', () => {
    expect(sent(request(context, detailsArgs(differences('different', 1204))))).toEqual([
      ['c-local', 300],
      ['c-prod', 300],
    ]);
    const many = [...differences('different', 300), ...differences('only-left', 300, 1000)];
    expect(sent(request(context, detailsArgs(many)))).toEqual([
      ['c-local', 500],
      ['c-local', 100],
      ['c-prod', 300],
    ]);
  });

  it('says what differs in the recorded documents of MongoDB 8.2', () => {
    const readArgs = { left: leftSide, right: rightSide, options };
    const result = parseRead([recorded('find-left'), recorded('find-right')], readArgs) as CompareResult;
    const entries = parse(recorded('details') as unknown[], detailsArgs(result.differences)) as readonly DetailEntry[];
    expect(
      entries.map((entry) => [entry.kind, entry.id, entry.kind === 'different' ? entry.summary : entry.preview]),
    ).toEqual([
      ['different', int(1), 'status'],
      ['different', int(5), 'items.1.qty'],
      ['only-left', int(4), '{ _id: 4, only: "left" }'],
      ['only-left', int(6), '{ _id: 6, n: 1 }'],
      ['only-right', int(7), '{ _id: 7, only: "right" }'],
      ['only-right', { $numberLong: '6' }, '{ _id: NumberLong(6), n: 1 }'],
    ]);
  });

  it('gives the row (field order) to a document whose fields differ only in their order', () => {
    const given = differences('different', 1);
    const replies = [[{ _id: int(0), a: int(1), b: int(2) }], [{ _id: int(0), b: int(2), a: int(1) }]];
    const args = { ...(detailsArgs(given) as object), options: { ...options, ignoreOrder: false } } as Json;
    const [entry] = parse(replies, args) as readonly DetailEntry[];
    expect(entry?.kind === 'different' && entry.rows).toEqual([{ path: '(field order)' }]);
  });

  it('shows 240 characters and … of a document of 2,000, and the whole of it in the inspector island', () => {
    const document = { _id: int(1), text: 'x'.repeat(2000) };
    const preview = previewText(document);
    expect(preview).toHaveLength(241);
    expect(preview.endsWith('…')).toBe(true);
    const shown = inspectorView({ kind: 'only-left', id: int(1), preview }, { kind: 'document', document });
    expect(shown.kind === 'one-side' && shown.document).toContain('x'.repeat(2000));
    expect(shown.kind === 'one-side' && shown.missing).toBe('Missing on the right side');
  });

  it('leaves out a different document deleted on the right since the comparison', () => {
    const given = differences('different', 2);
    const replies = [
      [
        { _id: int(0), a: int(1) },
        { _id: int(1), a: int(1) },
      ],
      [{ _id: int(1), a: int(2) }],
    ];
    const entries = parse(replies, detailsArgs(given)) as readonly DetailEntry[];
    expect(entries.map((entry) => entry.id)).toEqual([int(1)]);
  });

  it('reads a selected row with findOne and says The document no longer exists. when it was deleted', () => {
    const args = { mode: 'selected', left: leftSide, right: rightSide, side: 'left', id: int(4) };
    const read = request(context, args);
    expect(read.kind === 'engine' && read.requests[0]?.request).toEqual({
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      method: 'findOne',
      arguments: [{ _id: int(4) }],
    });
    expect(parse([recorded('findOne')], args)).toEqual({ kind: 'document', document: { _id: int(4), only: 'left' } });
    expect(parse([recorded('findOne-missing')], args)).toEqual({
      kind: 'gone',
      message: 'The document no longer exists.',
    });
  });

  it('reads the documents of a side by _id, 500 a query, for the writes', () => {
    const ids = Array.from({ length: 1200 }, (_, index) => int(index));
    const args = { mode: 'documents', left: leftSide, right: rightSide, side: 'right', ids };
    expect(sent(request(context, args))).toEqual([
      ['c-prod', 500],
      ['c-prod', 500],
      ['c-prod', 200],
    ]);
  });
});
