/**
 * Inserting documents from the insert dialog, duplicating one, deleting one and deleting the selected rows, on
 * `shop.people` of Local, with the replies of MongoDB 8.2 recorded in `test/fixtures/replies`.
 */
import { describe, expect, it } from 'vitest';
import { afterReplies as deleteAfterReplies, plan as deletePlan } from '../../../src/features/document/delete';
import {
  afterReplies as selectedAfterReplies,
  plan as selectedPlan,
} from '../../../src/features/document/delete-selected';
import { duplicateText, plan as duplicatePlan } from '../../../src/features/document/duplicate';
import {
  afterReplies as insertAfterReplies,
  insertFailureNotice,
  insertFailureText,
  plan as insertPlan,
} from '../../../src/features/document/insert';
import { documentsOfText } from '../../../src/features/document/parse-insert-text';
import { text } from '../../../src/features/document/text';
import type { Json } from '../../../src/shared/engine-request';
import {
  contextOn,
  double,
  int,
  local,
  long,
  objectId,
  planOf,
  production,
  questionOf,
  recorded,
  refusalOf,
  sentArguments,
  started,
  stepTexts,
} from './context';

const recordedLine = 'It can be undone from the Undo history.';
const offLine = "The undo history is off for this connection: this can't be undone.";
const overLine = "This can't be undone: the undo history keeps operations of up to 10,000 documents.";
const undoOff = { settings: { 'datardo.undo.enabled': false } };

describe('document.insert', () => {
  const context = contextOn('document.insert');

  it('runs insertOne for { name: "Ada" } and says Inserted document ObjectId("…") into people.', () => {
    const plan = planOf(insertPlan(context, started({}, { documents: '{ name: "Ada" }' })));
    expect(stepTexts(plan)).toEqual(['db.people.insertOne({ name: "Ada" })']);
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(insertAfterReplies(context, started({}), [recorded('insertOne')])).toEqual({
      kind: 'after',
      after: [
        {
          kind: 'notify',
          level: 'success',
          text: 'Inserted document ObjectId("6afe48bc6ece4e0d19cc4293") into people.',
        },
        { kind: 'refresh', connection: local.id },
      ],
    });
  });

  it('inserts [ { a: 1 }, { a: 2 } ] with one insertMany, and says so with the count', () => {
    const plan = planOf(insertPlan(context, started({}, { documents: '[ { a: 1 }, { a: 2 } ]' })));
    expect(stepTexts(plan)).toEqual(['db.people.insertMany([{ a: 1 }, { a: 2 }])']);
    expect(plan.title).toBe('Insert 2 documents');
    expect(text.insert.toInsert(2)).toBe('2 document(s) to insert');
    expect(text.insert.button(2)).toBe('Insert 2 documents');
    expect(insertAfterReplies(context, started({}), [recorded('insertMany')])).toMatchObject({
      after: [{ kind: 'notify', text: 'Inserted 2 documents into people.' }, { kind: 'refresh' }],
    });
  });

  it('inserts what Copy as gives with the same types', () => {
    const copied =
      '[\n  { _id: 1, l: NumberLong("9007199254740993"), d: Double(5) },\n  { "_id": { "$oid": "65f1c0de9a7b4e00012f3a2c" }, "i": { "$numberInt": "2" } }\n]';
    expect(sentArguments(planOf(insertPlan(context, started({}, { documents: copied }))))).toEqual([
      [
        { _id: int(1), l: long('9007199254740993'), d: double('5.0') },
        { _id: objectId('65f1c0de9a7b4e00012f3a2c'), i: int(2) },
      ],
    ]);
  });

  it('says the duplicate key error with the advice to remove _id, and Inserted 1 of 3 documents, then: …', () => {
    const error = 'E11000 duplicate key error collection: shop.people index: _id_ dup key: { _id: 1 }';
    expect(insertFailureText(1, 0, error)).toBe(`${error}. Remove _id to insert a copy with a new one.`);
    expect(insertFailureText(3, 1, error)).toBe(
      `Inserted 1 of 3 documents, then: ${error}. Remove _id to insert a copy with a new one.`,
    );
    expect(insertFailureNotice(planPlace(), 3, 1)).toBe('Inserted 1 of 3 documents into people.');
    expect(insertFailureNotice(planPlace(), 1, 0)).toBeUndefined();
    expect(insertFailureText(1, 0, 'E11000 duplicate key error collection: shop.people index: email_1 dup key')).toBe(
      'E11000 duplicate key error collection: shop.people index: email_1 dup key',
    );
  });

  it("opens the dialog with the text left in it, and asks again with the parser's message, keeping the text", () => {
    const first = questionOf(insertPlan(context, started({ text: '{ name: "Gr' })));
    expect(first.title).toBe('Insert into people');
    expect(first.fields[0]).toMatchObject({ key: 'documents', default: '{ name: "Gr' });
    const again = questionOf(insertPlan(context, started({}, { documents: '[]' })));
    expect(again.text).toBe('The array is empty: add the documents to insert');
    expect(again.fields[0]).toMatchObject({ default: '[]' });
  });

  it('is refused on a read-only connection and on a view, before the dialog opens', () => {
    const readOnly = contextOn('document.insert', { connection: production });
    expect(refusalOf(insertPlan(readOnly, started({})))).toEqual({
      code: 'document.insert/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(refusalOf(insertPlan(context, started({ view: true }))).code).toBe('document.insert/view');
  });

  it('is in the undo history, keeping the _ids the documents carry, and publishes', () => {
    const plan = planOf(insertPlan(context, started({}, { documents: '[ { _id: 5 }, { a: 1 } ]' })));
    expect(plan.undo).toEqual({
      keeps: {
        kind: 'inserted',
        connection: local.id,
        database: 'shop',
        collection: 'people',
        ids: [int(5)],
        count: 2,
      },
    });
    expect(plan.publishes).toBe(true);
  });

  it('cannot be undone with 10,001 documents and the limit at 10,000, and says so before inserting', () => {
    const many = `[${Array.from({ length: 10_001 }, () => '{}').join(',')}]`;
    const limited = contextOn('document.insert', { settings: { 'datardo.undo.maxDocumentsPerOperation': 10_000 } });
    expect(planOf(insertPlan(limited, started({}, { documents: many }))).undo).toEqual({ cannot: overLine });
  });
});

/** The place `document.insert` writes to in these tests. */
function planPlace(): Parameters<typeof insertFailureNotice>[0] {
  return {
    connection: local.id,
    connectionName: 'Local',
    saved: true,
    readOnly: false,
    keepsUndo: true,
    database: 'shop',
    collection: 'people',
    view: false,
  };
}

describe('document.duplicate', () => {
  const context = contextOn('document.duplicate');
  const document = { _id: int(7), name: 'Ada', price: double('5.0'), big: long('7'), tags: ['a'] };

  it('opens Insert into people with the document in mongosh syntax, indented by two spaces, without _id', () => {
    const plan = planOf(duplicatePlan(context, started({ id: int(7) }, { document })));
    expect(plan.steps).toEqual([]);
    expect(plan.after).toEqual([
      {
        kind: 'start',
        feature: 'document.insert',
        target: { kind: 'collection', connection: local.id, database: 'shop', collection: 'people' },
        args: { connection: local.id, database: 'shop', collection: 'people', text: duplicateText(document) },
      },
    ]);
    expect(duplicateText(document)).toBe(
      '{\n  name: "Ada",\n  price: Double(5),\n  big: NumberLong(7),\n  tags: [\n    "a"\n  ]\n}',
    );
  });

  it('keeps a Double of 5.0 and a Long of 7 in the copy, which inserts with the same fields and a new _id', () => {
    const read = documentsOfText(duplicateText(document));
    expect(read.ok ? read.documents : read.message).toEqual([
      { name: 'Ada', price: double('5.0'), big: long('7'), tags: ['a'] },
    ]);
  });

  it('reads the whole document, whatever the projection of the query bar', () => {
    expect(duplicatePlan(context, started({ id: int(7), projection: '{ name: 1 }' }))).toMatchObject({
      kind: 'read',
      need: { read: 'document.read', args: { id: int(7) } },
    });
    const outcome = duplicatePlan(context, started({ id: int(7) }));
    expect(outcome.kind === 'read' ? outcome.need.args : undefined).not.toHaveProperty('field');
  });

  it('says Document not found: it may have been deleted. and opens nothing for a document deleted meanwhile', () => {
    expect(refusalOf(duplicatePlan(context, started({ id: int(7) }, { document: null })))).toEqual({
      code: 'document.duplicate/not-found',
      message: 'Document not found: it may have been deleted.',
    });
  });

  it('is refused on a view and on a read-only connection', () => {
    expect(refusalOf(duplicatePlan(context, started({ id: int(7), view: true }))).code).toBe('document.duplicate/view');
    const readOnly = contextOn('document.duplicate', { connection: production });
    expect(refusalOf(duplicatePlan(readOnly, started({ id: int(7) }))).code).toBe('document.duplicate/read-only');
  });
});

describe('document.delete', () => {
  const context = contextOn('document.delete');
  const deleting = started({ id: int(7) }, { document: { _id: int(7), name: 'Ada' } });

  it('asks Delete document 7 from people? and shows db.people.deleteOne({ _id: 7 })', () => {
    const plan = planOf(deletePlan(context, deleting));
    expect(stepTexts(plan)).toEqual(['db.people.deleteOne({ _id: 7 })']);
    expect(plan.danger).toEqual({ kind: 'confirm', text: 'Delete document 7 from people?', button: 'Delete' });
    expect(plan.title).toBe('Delete document 7');
  });

  it('reads the document first, to know it is still there', () => {
    expect(deletePlan(context, started({ id: int(7) }))).toMatchObject({
      kind: 'read',
      need: { key: 'document', read: 'document.read', args: { id: int(7) } },
    });
  });

  it('is in the undo history by its _id, or says the undo history is off when it is', () => {
    expect(planOf(deletePlan(context, deleting)).undo).toEqual({
      keeps: { kind: 'ids', connection: local.id, database: 'shop', collection: 'people', ids: [int(7)], count: 1 },
    });
    expect(planOf(deletePlan(contextOn('document.delete', undoOff), deleting)).undo).toEqual({ cannot: offLine });
    expect(recordedLine).toBe(text.undo.recorded);
  });

  it('says Deleted document 7 from people. after the delete, recorded or not', () => {
    expect(deleteAfterReplies(contextOn('document.delete', undoOff), deleting, [recorded('deleteOne')])).toEqual({
      kind: 'after',
      after: [
        { kind: 'notify', level: 'success', text: 'Deleted document 7 from people.' },
        { kind: 'refresh', connection: local.id },
      ],
    });
  });

  it('says Document not found: it may have been deleted already. when another client deleted it', () => {
    expect(refusalOf(deletePlan(context, started({ id: int(7) }, { document: null })))).toEqual({
      code: 'document.delete/not-found',
      message: 'Document not found: it may have been deleted already.',
    });
    expect(deleteAfterReplies(context, deleting, [recorded('deleteOne-none')])).toMatchObject({
      after: [{ kind: 'notify', level: 'warning', text: 'Document not found: it may have been deleted already.' }, {}],
    });
  });

  it('is refused on a view and on a read-only connection, and publishes the removal', () => {
    expect(refusalOf(deletePlan(context, started({ id: int(7), view: true }))).code).toBe('document.delete/view');
    const readOnly = contextOn('document.delete', { connection: production });
    expect(refusalOf(deletePlan(readOnly, deleting))).toEqual({
      code: 'document.delete/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(planOf(deletePlan(context, deleting)).publishes).toBe(true);
  });
});

describe('document.delete-selected', () => {
  const context = contextOn('document.delete-selected');
  const three: Json = [int(1), int(2), int(3)];

  it('asks Delete 3 documents from people? with The 3 documents selected in the table. and deleteMany', () => {
    const plan = planOf(selectedPlan(context, started({ ids: three })));
    expect(stepTexts(plan)).toEqual(['db.people.deleteMany({ _id: { $in: [1, 2, 3] } })']);
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'Delete 3 documents from people?\nThe 3 documents selected in the table.',
      button: 'Delete',
    });
    expect(plan.undo).toMatchObject({ keeps: { kind: 'ids', ids: three, count: 3 } });
  });

  it('deletes a document once when a sub-row of its expanded array is selected too', () => {
    const plan = planOf(selectedPlan(context, started({ ids: [int(1), int(2), int(2), int(3)] })));
    expect(sentArguments(plan)).toEqual([{ _id: { $in: three } }]);
  });

  it('says Deleted 2 of 3 documents from people: the others were already gone.', () => {
    expect(
      selectedAfterReplies(context, started({ ids: [int(2), int(3), int(404)] }), [recorded('deleteMany-selected')]),
    ).toMatchObject({
      after: [{ kind: 'notify', text: 'Deleted 2 of 3 documents from people: the others were already gone.' }, {}],
    });
    expect(
      selectedAfterReplies(context, started({ ids: [int(2), int(3)] }), [recorded('deleteMany-selected')]),
    ).toMatchObject({
      after: [{ kind: 'notify', text: 'Deleted 2 documents from people.' }, {}],
    });
  });

  it('cannot be undone with 10,001 documents selected and the default limits', () => {
    const ids = Array.from({ length: 10_001 }, (_, index) => int(index));
    expect(planOf(selectedPlan(context, started({ ids }))).undo).toEqual({ cannot: overLine });
  });

  it('is document.delete for one row, its result included', () => {
    const one = started({ ids: [int(7)] }, { document: { _id: int(7) } });
    expect(stepTexts(planOf(selectedPlan(context, one)))).toEqual(['db.people.deleteOne({ _id: 7 })']);
    expect(selectedAfterReplies(context, one, [recorded('deleteOne')])).toMatchObject({
      after: [{ kind: 'notify', text: 'Deleted document 7 from people.' }, {}],
    });
  });

  it('is refused on a view and on a read-only connection', () => {
    expect(refusalOf(selectedPlan(context, started({ ids: three, view: true }))).code).toBe(
      'document.delete-selected/view',
    );
    const readOnly = contextOn('document.delete-selected', { connection: production });
    expect(refusalOf(selectedPlan(readOnly, started({ ids: three }))).code).toBe('document.delete-selected/read-only');
  });
});
