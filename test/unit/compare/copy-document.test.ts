import { describe, expect, it } from 'vitest';
import { afterReplies, plan } from '../../../src/features/compare/copy-document';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import {
  confirmOf,
  contextWith,
  decimal,
  int,
  leftSide,
  local,
  planOf,
  production,
  productionReadOnly,
  refusalOf,
  rightSide,
  started,
} from './context';

function args(to: 'left' | 'right', difference: Json | undefined, more: Readonly<Record<string, Json>> = {}): Answers {
  return started({
    left: leftSide,
    right: rightSide,
    to,
    ...(difference === undefined ? {} : { difference }),
    ...more,
  });
}

function firstRequest(outcome: unknown): MongoRequest {
  const step = planOf(outcome).steps[0];
  if (step?.kind !== 'engine' || step.request.engine !== 'mongodb') {
    throw new Error('Expected a MongoDB step');
  }
  return step.request;
}

describe('compare.copy-document', () => {
  const context = contextWith('compare.copy-document');
  const source = { _id: int(4), qty: int(2), price: decimal('9.90'), name: 'pen' };

  it('reads the source document by _id before the confirmation', () => {
    expect(plan(context, args('right', { id: int(4), kind: 'only-left' }))).toEqual({
      kind: 'read',
      need: {
        key: 'source',
        read: 'compare.read-details',
        args: { mode: 'documents', left: leftSide, right: rightSide, side: 'left', ids: [int(4)] },
      },
    });
  });

  it('inserts a document only on the left into the right side after asking', () => {
    const done = planOf(plan(context, { ...args('right', { id: int(4), kind: 'only-left' }), source: [source] }));
    expect(done.danger).toEqual({
      kind: 'confirm',
      text: 'Make right like left: insert 1 document in Production › shop.orders?\nDocuments are written as they are now on the other side.',
      button: 'Apply',
    });
    expect(done.title).toBe('Make like Local › shop.orders');
    expect(done.steps.map((step) => step.text)).toEqual([
      'db.orders.bulkWrite([{ replaceOne: { filter: { _id: 4 }, replacement: { _id: 4, qty: 2, price: Decimal128("9.90"), name: "pen" }, upsert: true } }], { ordered: false })',
    ]);
    expect(done.steps[0]?.kind === 'engine' && done.steps[0].connection).toBe(production.id);
  });

  it('writes the document with every BSON type and the order of its fields', () => {
    const request = firstRequest(
      plan(context, { ...args('right', { id: int(4), kind: 'only-left' }), source: [source] }),
    );
    expect(request.arguments).toEqual([
      [{ replaceOne: { filter: { _id: int(4) }, replacement: source, upsert: true } }],
      { ordered: false },
    ]);
    const [operations] = request.arguments as [readonly { replaceOne: { replacement: object } }[]];
    expect(Object.keys(operations[0]?.replaceOne.replacement ?? {})).toEqual(['_id', 'qty', 'price', 'name']);
  });

  it('replaces the left document with the right one, ignored fields included', () => {
    const right = { _id: int(1), status: 'paid', updatedAt: int(2) };
    const outcome = plan(context, { ...args('left', { id: int(1), kind: 'different' }), source: [right] });
    expect(confirmOf(planOf(outcome)).text).toMatch(
      /^Make left like right: replace 1 document in Local › shop\.orders\?/u,
    );
    expect(planOf(outcome).steps[0]).toMatchObject({ kind: 'engine', connection: local.id });
    expect(firstRequest(outcome).arguments[0]).toEqual([
      { replaceOne: { filter: { _id: int(1) }, replacement: right, upsert: true } },
    ]);
  });

  it('deletes a document only on the right with deleteMany and reads nothing', () => {
    const done = planOf(plan(context, args('right', { id: int(7), kind: 'only-right' })));
    expect(confirmOf(done).text).toMatch(/^Make right like left: delete 1 document in Production › shop\.orders\?/u);
    expect(done.steps.map((step) => step.text)).toEqual(['db.orders.deleteMany({ _id: { $in: [7] } })']);
  });

  it('refuses a read-only connection or a view on the side written, and writes nothing', () => {
    const readOnly = contextWith('compare.copy-document', [local, productionReadOnly]);
    expect(refusalOf(plan(readOnly, args('right', { id: int(7), kind: 'only-right' })))).toEqual({
      code: 'compare.copy-document/read-only',
      message: "The connection Production is read-only. Its documents can't be changed.",
    });
    const view = started({
      left: leftSide,
      right: { ...rightSide, collection: 'recent', view: true },
      to: 'right',
      difference: { id: int(7), kind: 'only-right' },
    });
    expect(refusalOf(plan(context, view))).toEqual({
      code: 'compare.copy-document/view',
      message: "recent is a view. Its documents can't be changed.",
    });
  });

  it('is recorded in the undo history under its title, keeping the target document by _id, and publishes nothing', () => {
    const done = planOf(plan(context, args('right', { id: int(7), kind: 'only-right' })));
    expect(done.undo).toEqual({
      keeps: { kind: 'ids', connection: 'c-prod', database: 'shop', collection: 'orders', ids: [int(7)], count: 1 },
    });
    expect(done.publishes).toBe(false);
    const off = contextWith('compare.copy-document', [local, production], { 'datardo.undo.enabled': false });
    expect(planOf(plan(off, args('right', { id: int(7), kind: 'only-right' }))).undo).toHaveProperty('cannot');
  });

  it('says what was written and reads the pages of the side written again', () => {
    const answers = args('right', { id: int(4), kind: 'only-left' });
    expect(afterReplies(context, answers, [{ upsertedCount: int(1), matchedCount: int(0) }])).toEqual([
      { kind: 'notify', level: 'success', text: 'Wrote 1 document in Production › shop.orders.' },
      { kind: 'refresh', connection: production.id },
    ]);
    expect(afterReplies(context, answers, [{ deletedCount: int(1) }])[0]).toMatchObject({
      text: 'Deleted 1 in Production › shop.orders.',
    });
    expect(afterReplies(context, answers, [{ deletedCount: int(0) }])[0]).toMatchObject({
      text: 'Nothing changed in Production › shop.orders.',
    });
  });

  it('refuses a source document deleted since the comparison, and an _id no longer among the differences', () => {
    expect(refusalOf(plan(context, { ...args('right', { id: int(4), kind: 'only-left' }), source: [] }))).toEqual({
      code: 'compare.copy-document/stale',
      message: 'Nothing to change: compare again.',
    });
    expect(refusalOf(plan(context, args('right', undefined))).code).toBe('compare.copy-document/stale');
  });

  it('refuses while a comparison runs', () => {
    expect(refusalOf(plan(context, args('right', { id: int(7), kind: 'only-right' }, { comparing: true })))).toEqual({
      code: 'compare.copy-document/comparing',
      message: 'Wait for the comparison to finish.',
    });
  });
});
