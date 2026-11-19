/**
 * Updating and deleting every document matching the filter of the query bar, and updating the selected rows, on
 * `shop.orders` of Local, with the confirmations D39 asks for an empty filter.
 */
import { describe, expect, it } from 'vitest';
import { afterReplies as deleteAfterReplies, plan as deletePlan } from '../../../src/features/document/delete-many';
import { afterReplies as updateAfterReplies, plan as updatePlan } from '../../../src/features/document/update-many';
import { plan as selectedPlan } from '../../../src/features/document/update-selected';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
import {
  contextOn,
  int,
  local,
  planOf,
  production,
  questionOf,
  recorded,
  refusalOf,
  sentArguments,
  started,
  stepTexts,
  type ContextOptions,
} from './context';

const recordedLine = 'It can be undone from the Undo history.';
const offLine = "The undo history is off for this connection: this can't be undone.";
const overLine = "This can't be undone: the undo history keeps operations of up to 10,000 documents.";
const emptyDetail = 'The filter is empty, so every document of the collection is affected.';
const orders: ContextOptions = { collection: 'orders' };
const undoOff: ContextOptions = { ...orders, settings: { 'datardo.undo.enabled': false } };
const limited: ContextOptions = { ...orders, settings: { 'datardo.undo.maxDocumentsPerOperation': 1_000 } };

/** The answers of an update of the documents of `filter`, `count` of them, with `update` typed in the form. */
function updating(filter: string, count: Json, update?: string): Answers {
  return started({ filter }, { count, ...(update === undefined ? {} : { update }) });
}

describe('document.update-many', () => {
  const context = contextOn('document.update-many', orders);
  const archive = '{ $set: { status: "archived" } }';

  it('counts the documents of the filter exactly before the form opens', () => {
    expect(updatePlan(context, started({ filter: '{ status: "new" }' }))).toEqual({
      kind: 'read',
      need: {
        key: 'count',
        read: 'query.count',
        args: {
          connection: local.id,
          database: 'shop',
          collection: 'orders',
          filter: '{ status: "new" }',
          at: context.now,
          kind: 'collection',
          exact: true,
        },
      },
    });
  });

  it('says 12 documents match the filter. in the form Update many · orders', () => {
    const form = questionOf(updatePlan(context, updating('{ status: "new" }', 12)));
    expect(form.title).toBe('Update many · orders');
    expect(form.text).toBe('{ status: "new" }\n12 documents match the filter.');
    expect(form.button).toBe('Continue');
    expect(form.fields[0]).toMatchObject({ key: 'update', label: 'Update', rules: [] });
  });

  it('confirms updateMany with Update 12 documents, then says Updated orders: m matched, k modified.', () => {
    const plan = planOf(updatePlan(context, updating('{ status: "new" }', { count: 12 }, archive)));
    expect(stepTexts(plan)).toEqual(['db.orders.updateMany({ status: "new" }, { $set: { status: "archived" } })']);
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: '12 documents match the filter.',
      button: 'Update 12 documents',
    });
    expect(plan.title).toBe('Update many { status: "new" } with { $set: { status: "archived" } }');
    expect(plan.undo).toMatchObject({ keeps: { kind: 'filter', filter: { status: 'new' }, count: 12 } });
    expect(updateAfterReplies(context, updating('{ status: "new" }', 12, archive), [recorded('updateMany')])).toEqual({
      kind: 'after',
      after: [
        { kind: 'notify', level: 'success', text: 'Updated orders: 2 matched, 2 modified.' },
        { kind: 'refresh', connection: local.id },
      ],
    });
  });

  it('applies [ { $set: { total: { $add: ["$a", "$b"] } } } ] as an update pipeline', () => {
    const pipeline = '[ { $set: { total: { $add: ["$a", "$b"] } } } ]';
    expect(sentArguments(planOf(updatePlan(context, updating('{ status: "new" }', 12, pipeline))))[1]).toEqual([
      { $set: { total: { $add: ['$a', '$b'] } } },
    ]);
  });

  it('asks the form again with the reason for a plain document, and writes nothing', () => {
    const form = questionOf(updatePlan(context, updating('{ status: "new" }', 12, '{ status: "archived" }')));
    expect((form.text ?? '').split('\n').at(-1)).toBe(
      'Update: use update operators like { $set: { field: "value" } } (a plain document would replace whole documents)',
    );
    expect(form.fields[0]).toMatchObject({ default: '{ status: "archived" }' });
    expect(questionOf(updatePlan(context, updating('{}', 12, '[ { a: 1 } ]'))).text).toMatch(
      /Update: a pipeline is a list of stages like \{ \$set: \{ … \} \}$/u,
    );
  });

  it('asks Update all 1,204 documents of orders? with no field to type when the undo history keeps it', () => {
    const plan = planOf(updatePlan(context, updating('{}', 1_204, archive)));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: `Update all 1,204 documents of orders?\n${emptyDetail}`,
      button: 'Update all',
    });
    expect(plan.undo).toHaveProperty('keeps');
    expect(recordedLine).toBe('It can be undone from the Undo history.');
  });

  it('asks Type orders to confirm with an empty filter and the undo history off, a blank filter being {}', () => {
    const off = contextOn('document.update-many', undoOff);
    for (const filter of ['', '  ', '{}', '{ }']) {
      const plan = planOf(updatePlan(off, updating(filter, 1_204, archive)));
      expect(plan.danger).toEqual({
        kind: 'destructive',
        text: `Update all 1,204 documents of orders?\n${emptyDetail}`,
        button: 'Update all',
        name: 'orders',
      });
      expect(plan.undo).toEqual({ cannot: offLine });
      expect(sentArguments(plan)[0]).toEqual({});
    }
  });

  it('asks Type orders to confirm too with the limit at 1,000 and 1,204 documents', () => {
    const plan = planOf(updatePlan(contextOn('document.update-many', limited), updating('', 1_204, archive)));
    expect(plan.danger).toMatchObject({ kind: 'destructive', name: 'orders' });
    expect(plan.undo).toEqual({
      cannot: "This can't be undone: the undo history keeps operations of up to 1,000 documents.",
    });
  });

  it('has no field to type for { _id: { $exists: true } } with the undo history off: the filter is not empty', () => {
    const off = contextOn('document.update-many', undoOff);
    const plan = planOf(updatePlan(off, updating('{ _id: { $exists: true } }', 1_204, archive)));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: '1,204 documents match the filter.',
      button: 'Update 1,204 documents',
    });
  });

  it('keeps Continue disabled with no matching document, and writes nothing', () => {
    const form = questionOf(updatePlan(context, updating('{ status: "gone" }', 0, archive)));
    expect(form.text).toBe('{ status: "gone" }\nNo documents match the filter.');
    expect(form.fields[0]).toMatchObject({
      rules: [{ kind: 'pattern', pattern: '(?!)', message: 'No documents match the filter.' }],
    });
  });

  it('says the undo history is off, with no field to type, for { status: "new" }', () => {
    const plan = planOf(
      updatePlan(contextOn('document.update-many', undoOff), updating('{ status: "new" }', 12, archive)),
    );
    expect(plan.danger).toMatchObject({ kind: 'confirm' });
    expect(plan.undo).toEqual({ cannot: offLine });
  });

  it('cannot be undone above 10,000 documents, and still updates', () => {
    const plan = planOf(updatePlan(context, updating('{ status: "new" }', 10_001, archive)));
    expect(plan.undo).toEqual({ cannot: overLine });
    expect(plan.steps).toHaveLength(1);
  });

  it('is refused on a view, on a read-only connection and for a filter that is not a document', () => {
    expect(refusalOf(updatePlan(context, started({ filter: '{}', view: true }))).code).toBe(
      'document.update-many/view',
    );
    const readOnly = contextOn('document.update-many', { ...orders, connection: production });
    expect(refusalOf(updatePlan(readOnly, started({ filter: '{}' })))).toEqual({
      code: 'document.update-many/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(refusalOf(updatePlan(context, started({ filter: '{ status: ' }))).code).toBe(
      'document.update-many/invalid-filter',
    );
  });

  it('publishes each modified document', () => {
    expect(planOf(updatePlan(context, updating('{ status: "new" }', 12, archive))).publishes).toBe(true);
  });
});

describe('document.update-selected', () => {
  const context = contextOn('document.update-selected');
  const ids: Json = [int(2), int(3), int(5)];

  it('opens Update many · people showing { _id: { $in: [2, 3, 5] } } and 3 documents match the filter.', () => {
    expect(selectedPlan(context, started({ ids, filter: '{ status: "new" }' }))).toMatchObject({
      kind: 'read',
      need: { key: 'count', read: 'query.count', args: { filter: '{ _id: { $in: [2, 3, 5] } }', exact: true } },
    });
    const form = questionOf(selectedPlan(context, started({ ids }, { count: 3 })));
    expect(form.title).toBe('Update many · people');
    expect(form.text).toBe('{ _id: { $in: [2, 3, 5] } }\n3 documents match the filter.');
  });

  it('changes those three documents only, whatever the filter of the query bar is', () => {
    const answers = started(
      { ids, filter: '{ status: "new" }' },
      { count: 3, update: '{ $set: { status: "archived" } }' },
    );
    const plan = planOf(selectedPlan(context, answers));
    expect(stepTexts(plan)).toEqual([
      'db.people.updateMany({ _id: { $in: [2, 3, 5] } }, { $set: { status: "archived" } })',
    ]);
    expect(plan.danger).toMatchObject({ button: 'Update 3 documents' });
  });

  it('counts a document once when a sub-row of its expanded array is selected too', () => {
    const plan = planOf(
      selectedPlan(context, started({ ids: [int(2), int(2), int(3)] }, { count: 2, update: '{ $inc: { n: 1 } }' })),
    );
    expect(sentArguments(plan)[0]).toEqual({ _id: { $in: [int(2), int(3)] } });
  });

  it('is refused as Update many is, on a view and on a read-only connection', () => {
    expect(refusalOf(selectedPlan(context, started({ ids, view: true }))).code).toBe('document.update-many/view');
    const readOnly = contextOn('document.update-selected', { connection: production });
    expect(refusalOf(selectedPlan(readOnly, started({ ids }))).code).toBe('document.update-many/read-only');
  });
});

describe('document.delete-many', () => {
  const context = contextOn('document.delete-many', orders);

  /** The answers of a delete of the documents of `filter`, `count` of them. */
  const deleting = (filter: string, count: number): Answers => started({ filter }, { count });

  it('confirms db.orders.deleteMany({ status: "draft" }) with 4 documents match the filter. and Delete 4 documents', () => {
    const plan = planOf(deletePlan(context, deleting('{ status: "draft" }', 4)));
    expect(stepTexts(plan)).toEqual(['db.orders.deleteMany({ status: "draft" })']);
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Delete many · orders\n{ status: "draft" }\n4 documents match the filter.',
      button: 'Delete 4 documents',
    });
    expect(plan.undo).toMatchObject({ keeps: { kind: 'filter', filter: { status: 'draft' }, count: 4 } });
    expect(deleteAfterReplies(context, deleting('{ status: "draft" }', 2), [recorded('deleteMany-selected')])).toEqual({
      kind: 'after',
      after: [
        { kind: 'notify', level: 'success', text: 'Deleted 2 documents from orders.' },
        { kind: 'refresh', connection: local.id },
      ],
    });
  });

  it('counts the documents of the filter exactly before the confirmation', () => {
    expect(deletePlan(context, started({ filter: '{ status: "draft" }' }))).toMatchObject({
      kind: 'read',
      need: { key: 'count', read: 'query.count', args: { filter: '{ status: "draft" }', exact: true } },
    });
  });

  it('asks Delete all 1,204 documents of orders? with no field to type when the undo history keeps it', () => {
    expect(planOf(deletePlan(context, deleting('{}', 1_204))).danger).toEqual({
      kind: 'confirm',
      text: `Delete all 1,204 documents of orders?\n${emptyDetail}`,
      button: 'Delete all',
    });
  });

  it('asks Type orders to confirm with an empty filter and the undo history off, a blank filter being {}', () => {
    const off = contextOn('document.delete-many', undoOff);
    for (const filter of ['', '{}']) {
      const plan = planOf(deletePlan(off, deleting(filter, 1_204)));
      expect(plan.danger).toEqual({
        kind: 'destructive',
        text: `Delete all 1,204 documents of orders?\n${emptyDetail}`,
        button: 'Delete all',
        name: 'orders',
      });
      expect(plan.undo).toEqual({ cannot: offLine });
    }
  });

  it('asks Type orders to confirm too with the limit at 1,000 and 1,204 documents', () => {
    expect(planOf(deletePlan(contextOn('document.delete-many', limited), deleting('', 1_204))).danger).toMatchObject({
      kind: 'destructive',
      name: 'orders',
    });
  });

  it('has no field to type for { _id: { $exists: true } } with the undo history off', () => {
    const plan = planOf(
      deletePlan(contextOn('document.delete-many', undoOff), deleting('{ _id: { $exists: true } }', 1_204)),
    );
    expect(plan.danger).toMatchObject({ kind: 'confirm', button: 'Delete 1,204 documents' });
    expect(plan.undo).toEqual({ cannot: offLine });
  });

  it('says No documents match the filter. and asks nothing when the filter matches nothing', () => {
    expect(refusalOf(deletePlan(context, deleting('{ status: "gone" }', 0)))).toEqual({
      code: 'document.delete-many/no-match',
      message: 'No documents match the filter.',
    });
  });

  it('is refused on a view, on a read-only connection and for a filter that is not a document', () => {
    expect(refusalOf(deletePlan(context, started({ filter: '{}', view: true }))).code).toBe(
      'document.delete-many/view',
    );
    const readOnly = contextOn('document.delete-many', { ...orders, connection: production });
    expect(refusalOf(deletePlan(readOnly, started({ filter: '{}' }))).code).toBe('document.delete-many/read-only');
    expect(refusalOf(deletePlan(context, started({ filter: '[1]' })))).toEqual({
      code: 'document.delete-many/invalid-filter',
      message: 'Invalid query syntax — check the highlighted field.',
    });
  });

  it('keeps the deleted documents by the filter, and publishes each removal', () => {
    const plan = planOf(deletePlan(context, deleting('{ status: "draft" }', 4)));
    expect(plan.publishes).toBe(true);
    expect(plan.touches).toBe('4 documents');
  });
});
