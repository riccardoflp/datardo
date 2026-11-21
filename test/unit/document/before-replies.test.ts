/**
 * What the writes of the document area say and do while the runner does not give them their replies (Q58, Q65): the
 * notification known before the write, the insert dialog drawn by the window from what its question carries, the form
 * of Update many, and the lines whose words come from a reply, which wait for Q58.
 */
import { describe, expect, it } from 'vitest';
import { plan as deletePlan } from '../../../src/features/document/delete';
import { plan as deleteManyPlan } from '../../../src/features/document/delete-many';
import { plan as selectedPlan } from '../../../src/features/document/delete-selected';
import { plan as editPlan } from '../../../src/features/document/inline-edit';
import { plan as insertPlan } from '../../../src/features/document/insert';
import { insertedNotice, plan as fromTabPlan } from '../../../src/features/document/insert-from-tab';
import { plan as updatePlan } from '../../../src/features/document/update-many';
import { generatedInsertIds } from '../../../src/features/undo/plans/record-args';
import { contextOn, int, local, planOf, questionOf, recorded, started } from './context';

const orders = { collection: 'orders' };

describe('document.delete', () => {
  it('says Deleted document 7 from people. once the delete has run', () => {
    const plan = planOf(
      deletePlan(contextOn('document.delete'), started({ id: int(7) }, { document: { _id: int(7) } })),
    );
    expect(plan.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Deleted document 7 from people.' },
      { kind: 'refresh', connection: local.id },
    ]);
  });

  it.todo('says Document not found: it may have been deleted already. from the reply (Q58)');
});

describe('document.delete-selected', () => {
  it('says Deleted 3 documents from people. once the delete has run', () => {
    const plan = planOf(
      selectedPlan(contextOn('document.delete-selected'), started({ ids: [int(1), int(2), int(3)] })),
    );
    expect(plan.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Deleted 3 documents from people.' });
  });

  it.todo('says Deleted 2 of 3 documents from people: the others were already gone. from the reply (Q58)');
});

describe('document.delete-many', () => {
  it('says Deleted 4 documents from orders. with the count confirmed', () => {
    const answers = started({ filter: '{ status: "draft" }' }, { count: 4 });
    const plan = planOf(deleteManyPlan(contextOn('document.delete-many', orders), answers));
    expect(plan.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Deleted 4 documents from orders.' });
  });
});

describe('document.update-many', () => {
  it('says Updated orders: 12 matched. with the count confirmed; modified comes from the reply (Q58)', () => {
    const answers = started({ filter: '{ status: "new" }' }, { count: 12, update: '{ $set: { status: "paid" } }' });
    const plan = planOf(updatePlan(contextOn('document.update-many', orders), answers));
    expect(plan.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Updated orders: 12 matched.' });
  });

  it('carries the filter, the count and the problem for the form the window draws', () => {
    const form = questionOf(
      updatePlan(contextOn('document.update-many', orders), started({ filter: '{ status: "new" }' }, { count: 12 })),
    );
    expect(form.element).toBe('document.update-many@form');
    expect(form.about).toEqual({ filter: '{ status: "new" }', count: 12, problem: null });
  });
});

describe('document.insert', () => {
  const context = contextOn('document.insert');

  it('carries the collection and Keep open for the dialog the window draws', () => {
    const dialog = questionOf(insertPlan(context, started({ text: '{ a: 1 }', keepOpen: true })));
    expect(dialog.element).toBe('document.insert@dialog');
    expect(dialog.about).toMatchObject({
      connection: local.id,
      database: 'shop',
      collection: 'people',
      keepOpen: true,
    });
  });

  it('says Inserted 1 document into people. for a document without _id, whose _id is in the reply', () => {
    const plan = planOf(insertPlan(context, started({}, { documents: '{ name: "Ada" }' })));
    expect(plan.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Inserted 1 document into people.' });
  });

  it('opens the dialog again after the insert with Keep open, with the text and the result', () => {
    const plan = planOf(insertPlan(context, started({}, { documents: '{ _id: 1 }', keepOpen: true })));
    expect(plan.after[2]).toMatchObject({
      kind: 'start',
      feature: 'document.insert',
      args: { text: '{ _id: 1 }', keepOpen: true, result: 'Inserted document 1 into people.' },
    });
  });

  it('opens the dialog again with the failure of the insert before it, and the text', () => {
    const dialog = questionOf(insertPlan(context, started({ text: '{ _id: 1 }', failure: 'E11000 duplicate key' })));
    expect(dialog.about).toMatchObject({ problem: 'E11000 duplicate key' });
    expect(dialog.fields[0]).toMatchObject({ default: '{ _id: 1 }' });
  });
});

describe('document.insert-from-tab', () => {
  it('says Inserted document 7 when the document carries its _id, and Inserted 1 document into people. otherwise', () => {
    expect(insertedNotice({ _id: int(7) }, 'people')).toBe('Inserted document 7');
    expect(insertedNotice({ name: 'Ada' }, 'people')).toBe('Inserted 1 document into people.');
    const plan = planOf(fromTabPlan(contextOn('document.insert-from-tab'), started({ text: '{ name: "Ada" }' })));
    expect(plan.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Inserted 1 document into people.' });
  });

  it.todo('becomes the tab of the inserted document from the _id of the reply (Q58)');
});

describe('document.inline-edit', () => {
  it('takes the text the window sends with the start, as the value typed', () => {
    const answers = started(
      { id: int(7), path: 'qty', value: int(3), text: '5' },
      { current: { _id: int(7), qty: int(3) } },
    );
    const plan = planOf(editPlan(contextOn('document.inline-edit'), answers));
    expect(plan.steps[0]?.text).toBe('db.people.updateOne({ _id: 7, qty: 3 }, { $set: { qty: 5 } })');
  });

  it.todo('says The value changed again: refresh and try again. from the reply of a guarded update (Q58)');
});

describe('undo.record', () => {
  it('takes the _id the server gave to an inserted document that had none from the reply of insertOne', () => {
    const insert = contextOn('document.insert');
    const [step] = planOf(insertPlan(insert, started({}, { documents: '{ name: "Ada" }' }))).steps;
    const [given] = planOf(insertPlan(insert, started({}, { documents: '{ _id: 1 }' }))).steps;
    if (step === undefined || given === undefined) {
      throw new Error('Expected the steps of the inserts');
    }
    expect(generatedInsertIds(step, recorded('insertOne'))).toEqual([{ $oid: '6afe48bc6ece4e0d19cc4293' }]);
    expect(generatedInsertIds(given, recorded('insertOne'))).toEqual([]);
  });
});
