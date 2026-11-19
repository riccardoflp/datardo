import { describe, expect, it } from 'vitest';
import { afterReplies, plan } from '../../../src/features/compare/make-like';
import { parse as parseRead } from '../../../src/features/compare/read';
import type { CompareResult, Difference } from '../../../src/features/compare/types';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import {
  confirmOf,
  contextWith,
  int,
  leftSide,
  local,
  planOf,
  production,
  productionReadOnly,
  questionOf,
  refusalOf,
  rightSide,
  started,
} from './context';

function differences(kind: Difference['kind'], count: number, from: number): readonly Difference[] {
  return Array.from({ length: count }, (_, index) => ({ id: int(from + index), kind }));
}

const mixed = [
  ...differences('only-left', 3, 1),
  ...differences('different', 2, 10),
  ...differences('only-right', 4, 20),
];

function args(given: readonly Difference[], more: Answers = {}, to: 'left' | 'right' = 'right'): Answers {
  return started({ left: leftSide, right: rightSide, to, differences: given as unknown as Json }, more);
}

/** The documents of the left side for these differences, as `compare.read-details` reads them. */
function sources(given: readonly Difference[]): readonly Json[] {
  return given.filter((each) => each.kind !== 'only-right').map((each) => ({ _id: each.id, from: 'left' }));
}

function methods(answers: Answers, context = contextWith('compare.make-like')): readonly (readonly [string, number])[] {
  return planOf(plan(context, answers)).steps.map((step) => {
    const request = (step.kind === 'engine' ? step.request : undefined) as MongoRequest;
    const [first] = request.arguments as [readonly Json[] | { _id: { $in: readonly Json[] } }];
    return [
      request.method,
      Array.isArray(first) ? first.length : (first as { _id: { $in: readonly Json[] } })._id.$in.length,
    ];
  });
}

describe('compare.make-like', () => {
  const context = contextWith('compare.make-like');

  it('asks whether the 4 documents only on the right side are deleted too', () => {
    const question = questionOf(plan(context, args(mixed)));
    expect(question.fields).toEqual([
      {
        kind: 'pick-one',
        key: 'deletes',
        label: '4 documents only on the right side can also be deleted.',
        choices: [
          { value: 'keep', label: 'Keep them' },
          { value: 'delete', label: 'Delete them' },
        ],
        default: 'keep',
      },
    ]);
  });

  it('reads the 5 source documents by _id before the confirmation', () => {
    expect(plan(context, args(mixed, { deletes: 'keep' }))).toMatchObject({
      kind: 'read',
      need: { key: 'source', read: 'compare.read-details', args: { mode: 'documents', side: 'left' } },
    });
  });

  it('with Keep them inserts the 3 and replaces the 2, and leaves the 4 on the right', () => {
    const answers = args(mixed, { deletes: 'keep', source: sources(mixed) });
    expect(planOf(plan(context, answers)).danger).toEqual({
      kind: 'confirm',
      text: 'Make right like left in Production › shop.orders?\ninsert 3, replace 2 documents from the left side.',
      button: 'Apply',
    });
    expect(methods(answers)).toEqual([['bulkWrite', 5]]);
    const [step] = planOf(plan(context, answers)).steps;
    const operations = (step?.kind === 'engine' ? (step.request as MongoRequest).arguments[0] : []) as readonly {
      replaceOne: { filter: { _id: Json } };
    }[];
    expect(operations.map((each) => each.replaceOne.filter._id)).toEqual([int(1), int(2), int(3), int(10), int(11)]);
  });

  it('with Delete them also deletes the 4, after the copies', () => {
    const answers = args(mixed, { deletes: 'delete', source: sources(mixed) });
    expect(planOf(plan(context, answers)).danger).toMatchObject({
      text: 'Make right like left in Production › shop.orders?\ninsert 3, replace 2 documents from the left side.\ndelete 4 documents only on the right side.',
      button: 'Apply',
    });
    expect(methods(answers)).toEqual([
      ['bulkWrite', 5],
      ['deleteMany', 4],
    ]);
  });

  it('asks nothing and only deletes when there is nothing to copy, with the button Delete', () => {
    const answers = args(differences('only-right', 4, 20));
    const done = planOf(plan(context, answers));
    expect(confirmOf(done).text).toMatch(/delete 4 documents only on the right side\.$/u);
    expect(confirmOf(done).button).toBe('Delete');
    expect(methods(answers)).toEqual([['deleteMany', 4]]);
  });

  it('asks nothing before reading when nothing is only on the side written', () => {
    expect(plan(context, args(differences('only-left', 3, 1)))).toMatchObject({ kind: 'read' });
  });

  it('writes no document that compare.equality counts identical', () => {
    const left = [
      { _id: int(1), a: int(1), updatedAt: int(1) },
      { _id: int(2), a: int(1) },
    ];
    const right = [
      { _id: int(1), a: int(1), updatedAt: int(2) },
      { _id: int(2), a: int(2) },
    ];
    const options = { filter: '', ignore: 'updatedAt', ignoreOrder: true, numbersByValue: true };
    const result = parseRead([left, right], { left: leftSide, right: rightSide, options }) as CompareResult;
    expect(result.differences).toEqual([{ id: int(2), kind: 'different' }]);
    expect(methods(args(result.differences, { source: [left[1] as Json] }))).toEqual([['bulkWrite', 1]]);
  });

  it('writes the differences beyond the 300 the list shows, 1,200 as bulkWrites of 500, 500 and 200', () => {
    const many = differences('only-left', 1200, 0);
    expect(methods(args(many, { source: sources(many) }))).toEqual([
      ['bulkWrite', 500],
      ['bulkWrite', 500],
      ['bulkWrite', 200],
    ]);
  });

  it('is one operation of the undo history with 10,000 documents or fewer, and says it cannot be undone beyond', () => {
    const answers = args(mixed, { deletes: 'delete', source: sources(mixed) });
    expect(planOf(plan(context, answers)).undo).toMatchObject({ keeps: { kind: 'ids', count: 9 } });
    const small = contextWith('compare.make-like', [local, production], { 'datardo.undo.maxDocumentsPerOperation': 5 });
    expect(planOf(plan(small, answers)).undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 5 documents.",
    });
    expect(planOf(plan(context, answers)).publishes).toBe(false);
  });

  it('refuses a read-only side written, a view, a running comparison and differences no longer there', () => {
    const readOnly = contextWith('compare.make-like', [local, productionReadOnly]);
    expect(refusalOf(plan(readOnly, args(mixed))).code).toBe('compare.make-like/read-only');
    const view = started({ left: leftSide, right: { ...rightSide, view: true }, to: 'right', differences: [] });
    expect(refusalOf(plan(context, view)).code).toBe('compare.make-like/view');
    const comparing = started({ left: leftSide, right: rightSide, to: 'right', differences: [], comparing: true });
    expect(refusalOf(plan(context, comparing))).toEqual({
      code: 'compare.make-like/comparing',
      message: 'Wait for the comparison to finish.',
    });
    expect(refusalOf(plan(context, args([])))).toEqual({
      code: 'compare.make-like/stale',
      message: 'Nothing to change: compare again.',
    });
  });

  it('makes the left side like the right one too', () => {
    const rightSources = mixed.filter((each) => each.kind !== 'only-left').map((each) => ({ _id: each.id }));
    const answers = args(mixed, { deletes: 'keep', source: rightSources }, 'left');
    expect(planOf(plan(context, answers)).danger).toMatchObject({
      text: 'Make left like right in Local › shop.orders?\ninsert 4, replace 2 documents from the right side.',
    });
  });

  it('says what was written and deleted', () => {
    const answers = args(mixed, { deletes: 'delete' });
    expect(
      afterReplies(context, answers, [{ upsertedCount: int(3), matchedCount: int(2) }, { deletedCount: int(4) }])[0],
    ).toMatchObject({
      text: 'Wrote 5 documents, deleted 4 in Production › shop.orders.',
    });
  });
});
