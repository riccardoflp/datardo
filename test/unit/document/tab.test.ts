/**
 * The document tab: what it shows, saving the document it holds, and inserting the new document written in it, on
 * `shop.orders` and `shop.people` of Local.
 */
import { describe, expect, it } from 'vitest';
import { afterReplies as insertAfterReplies, plan as insertPlan } from '../../../src/features/document/insert-from-tab';
import { documentTabText, newDocumentText, view, type DocumentTabState } from '../../../src/features/document/open';
import { plan as savePlan } from '../../../src/features/document/save';
import type { DocumentPlace } from '../../../src/features/document/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import {
  contextOn,
  double,
  int,
  local,
  long,
  objectId,
  planOf,
  production,
  recorded,
  refusalOf,
  sentArguments,
  started,
  stepTexts,
} from './context';

const id = objectId('65f1c0de9a7b4e00012f3a2c');
const original: Json = { _id: id, status: 'new', qty: int(3), price: double('5.5'), big: long('7') };
const orders = { collection: 'orders' };

function saving(textOfTab: string, current: Json | null = original): Answers {
  return started({ id, text: textOfTab, original }, { current });
}

describe('document.save', () => {
  const context = contextOn('document.save', orders);

  it('runs replaceOne with the whole document when status is changed to "paid"', () => {
    const text =
      '{ _id: ObjectId("65f1c0de9a7b4e00012f3a2c"), status: "paid", qty: 3, price: 5.5, big: NumberLong(7) }';
    const plan = planOf(savePlan(context, saving(text)));
    expect(stepTexts(plan)).toEqual([
      'db.orders.replaceOne({ _id: ObjectId("65f1c0de9a7b4e00012f3a2c") }, { _id: ObjectId("65f1c0de9a7b4e00012f3a2c"), status: "paid", qty: 3, price: 5.5, big: Long("7") })',
    ]);
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.after).toEqual([{ kind: 'refresh', connection: local.id }]);
  });

  it('keeps a Long and a Double whose numbers change, forces a Long with NumberLong, accepts ObjectId and ISODate', () => {
    const text =
      '{ status: "new", qty: NumberLong(4), price: 6, big: 8, at: ISODate("2024-01-01"), ref: ObjectId("65f1c0de9a7b4e00012f3a2d") }';
    expect(sentArguments(planOf(savePlan(context, saving(text))))[1]).toEqual({
      status: 'new',
      qty: long('4'),
      price: double('6.0'),
      big: long('8'),
      at: { $date: { $numberLong: String(Date.UTC(2024, 0, 1)) } },
      ref: objectId('65f1c0de9a7b4e00012f3a2d'),
    });
  });

  it('keeps the _id when it is removed from the text, and refuses a changed one', () => {
    const kept = planOf(savePlan(context, saving('{ status: "paid" }')));
    expect(sentArguments(kept)).toEqual([{ _id: id }, { status: 'paid' }]);
    expect(refusalOf(savePlan(context, saving('{ _id: 8, status: "paid" }')))).toEqual({
      code: 'document.save/id',
      message: '_id cannot be changed. Use Duplicate to create a copy with a new _id.',
    });
  });

  it('refuses an array, and text that does not parse', () => {
    expect(refusalOf(savePlan(context, saving('[ { a: 1 } ]')))).toEqual({
      code: 'document.save/not-a-document',
      message: 'A document must be an object { … }',
    });
    expect(refusalOf(savePlan(context, saving('{ a: ')))).toEqual({
      code: 'document.save/invalid',
      message: 'Invalid document: JSON5: invalid end of input at 1:6',
    });
  });

  it('asks Overwrite when another client changed the document after it was opened', () => {
    const plan = planOf(savePlan(context, saving('{ status: "paid" }', { ...original, status: 'sent' })));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'This document was changed in the database after you opened it.\nOverwrite replaces those changes with yours. Revert loads the latest version instead.',
      button: 'Overwrite',
    });
  });

  it('asks Insert again when the document was deleted meanwhile, which runs insertOne with the same _id', () => {
    const plan = planOf(savePlan(context, saving('{ status: "paid" }', null)));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'This document was deleted from the database after you opened it.',
      button: 'Insert again',
    });
    expect(stepTexts(plan)).toEqual([
      'db.orders.insertOne({ _id: ObjectId("65f1c0de9a7b4e00012f3a2c"), status: "paid" })',
    ]);
    expect(plan.undo).toMatchObject({ keeps: { kind: 'inserted', ids: [id] } });
  });

  it('is refused on a read-only connection as the connection is when the save is asked', () => {
    const readOnly = contextOn('document.save', { ...orders, connection: production });
    expect(refusalOf(savePlan(readOnly, saving('{ status: "paid" }')))).toEqual({
      code: 'document.save/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(refusalOf(savePlan(context, started({ id, text: '{}', view: true }))).code).toBe('document.save/view');
  });

  it('is in the undo history as Edit document <_id>, keeping the document by its _id, and publishes', () => {
    const plan = planOf(savePlan(context, saving('{ status: "paid" }')));
    expect(plan.title).toBe('Edit document ObjectId("65f1c0de9a7b4e00012f3a2c")');
    expect(plan.undo).toMatchObject({ keeps: { kind: 'ids', ids: [id], count: 1 } });
    expect(plan.publishes).toBe(true);
  });

  it('reads the tab and its draft when the window sends nothing but the tab', () => {
    const tab = tabId('t-doc');
    const withTab: Context = {
      ...context,
      state: {
        ...context.state,
        tabs: {
          ...context.state.tabs,
          active: tab,
          tabs: [
            {
              id: tab,
              shows: {
                kind: 'document',
                connection: local.id,
                database: 'shop',
                collection: 'orders',
                id: 'ObjectId("…")',
                idJson: JSON.stringify(id),
              },
              lastActive: 0,
              loaded: true,
              draft: { text: '{ status: "paid" }', original: JSON.stringify(original) },
            },
          ],
        },
      },
    };
    expect(savePlan(withTab, { args: {} })).toMatchObject({ kind: 'read', need: { args: { id } } });
    expect(sentArguments(planOf(savePlan(withTab, { args: {}, current: original })))).toEqual([
      { _id: id },
      { status: 'paid' },
    ]);
  });
});

describe('document.insert-from-tab', () => {
  const context = contextOn('document.insert-from-tab');

  it('runs insertOne for New document 1 holding { name: "Ada" }, and says Inserted document ObjectId("…")', () => {
    const plan = planOf(insertPlan(context, started({ text: '{ name: "Ada" }' })));
    expect(stepTexts(plan)).toEqual(['db.people.insertOne({ name: "Ada" })']);
    expect(plan.title).toBe('Insert document');
    expect(plan.undo).toMatchObject({ keeps: { kind: 'inserted', ids: [], count: 1 } });
    expect(insertAfterReplies(context, started({ text: '{ name: "Ada" }' }), [recorded('insertOne')])).toEqual({
      kind: 'after',
      after: [
        { kind: 'notify', level: 'success', text: 'Inserted document ObjectId("6afe48bc6ece4e0d19cc4293")' },
        { kind: 'refresh', connection: local.id },
      ],
    });
  });

  it('refuses an array with A document must be an object { … }', () => {
    expect(refusalOf(insertPlan(context, started({ text: '[ { a: 1 }, { a: 2 } ]' })))).toEqual({
      code: 'document.insert-from-tab/not-a-document',
      message: 'A document must be an object { … }',
    });
  });

  it('refuses text that does not parse, a read-only connection and a view', () => {
    expect(refusalOf(insertPlan(context, started({ text: '{ a: ' }))).code).toBe('document.insert-from-tab/invalid');
    const readOnly = contextOn('document.insert-from-tab', { connection: production });
    expect(refusalOf(insertPlan(readOnly, started({ text: '{}' }))).code).toBe('document.insert-from-tab/read-only');
    expect(refusalOf(insertPlan(context, started({ text: '{}', view: true }))).code).toBe(
      'document.insert-from-tab/view',
    );
  });

  it('is in the undo history as Insert document and publishes', () => {
    const plan = planOf(insertPlan(context, started({ text: '{ _id: 5, name: "Ada" }' })));
    expect(plan.undo).toMatchObject({ keeps: { kind: 'inserted', ids: [int(5)] } });
    expect(plan.publishes).toBe(true);
  });
});

describe('document.open', () => {
  const place: DocumentPlace = {
    connection: local.id,
    connectionName: 'Local',
    saved: true,
    readOnly: false,
    keepsUndo: true,
    database: 'shop',
    collection: 'orders',
    view: false,
  };
  const loadedText = documentTabText({ _id: id, total: long('9007199254740993'), at: { $date: { $numberLong: '0' } } });
  const state: DocumentTabState = {
    place,
    id,
    load: { kind: 'loaded', document: original },
    text: loadedText,
    loadedText,
    undoOff: false,
  };

  it('is titled with the _id in mongosh syntax and shows the document indented by two spaces', () => {
    const shown = view(state);
    expect(shown.title).toBe('ObjectId("65f1c0de9a7b4e00012f3a2c")');
    expect(shown.path).toEqual(['Local', 'shop', 'orders', 'ObjectId("65f1c0de9a7b4e00012f3a2c")']);
    expect(shown.body).toEqual({ kind: 'editor', text: loadedText, editable: true });
  });

  it('shows a Long beyond the safe integers as NumberLong("…") and a date as ISODate("…")', () => {
    expect(loadedText).toBe(
      '{\n  _id: ObjectId("65f1c0de9a7b4e00012f3a2c"),\n  total: NumberLong("9007199254740993"),\n  at: ISODate("1970-01-01T00:00:00.000Z")\n}',
    );
  });

  it('marks unsaved changes, enables Save, and asks before Revert drops them', () => {
    const shown = view({ ...state, text: `${loadedText} ` });
    expect(shown.unsaved).toBe(true);
    expect(shown.save).toMatchObject({ label: 'Save', enabled: true, element: 'document.save@toolbar', key: 'Ctrl+S' });
    expect(shown.revert.confirm).toEqual({
      text: 'Discard your changes to ObjectId("65f1c0de9a7b4e00012f3a2c")?',
      button: 'Discard',
    });
    expect(view(state).save.enabled).toBe(false);
  });

  it('cannot be typed in on a view or a read-only connection, with the reason on the Read-only mark', () => {
    const readOnly = view({
      ...state,
      place: { ...place, readOnly: true, connectionName: 'Production' },
      text: `${loadedText} `,
    });
    expect(readOnly.body).toMatchObject({ editable: false });
    expect(readOnly.save.enabled).toBe(false);
    expect(readOnly.revert.enabled).toBe(false);
    expect(readOnly.readOnly).toEqual({ label: 'Read-only', tooltip: 'The connection Production is read-only.' });
    expect(view({ ...state, place: { ...place, view: true } }).readOnly?.tooltip).toBe('Views are read-only.');
  });

  it('can be typed in again once the connection allows changes, without being opened again', () => {
    expect(view({ ...state, place: { ...place, readOnly: false } }).body).toMatchObject({ editable: true });
  });

  it('says the document no longer exists when it was deleted before the tab opened', () => {
    expect(view({ ...state, load: { kind: 'gone' } }).body).toEqual({
      kind: 'gone',
      text: 'This document no longer exists in shop.orders.',
    });
  });

  it("shows Loading…, and the server's message with Retry", () => {
    expect(view({ ...state, load: { kind: 'loading' } }).body).toEqual({ kind: 'loading', text: 'Loading…' });
    expect(view({ ...state, load: { kind: 'error', message: 'timed out' } }).body).toEqual({
      kind: 'error',
      text: 'timed out',
      retry: 'Retry',
    });
  });

  it('opens New document 1 with the text of the insert dialog, Insert in place of Save and no History', () => {
    const text = newDocumentText('{ name: "Ada" }');
    const shown = view({ place, number: 1, load: { kind: 'new' }, text, loadedText: text, undoOff: false });
    expect(shown.title).toBe('New document 1');
    expect(shown.body).toEqual({ kind: 'editor', text: '{ name: "Ada" }', editable: true });
    expect(shown.save).toMatchObject({ label: 'Insert', element: 'document.insert-from-tab@toolbar', enabled: true });
    expect(shown.history).toMatchObject({
      enabled: false,
      tooltip: 'Open a document of a collection first: a new document has no history yet.',
    });
    expect(newDocumentText()).toBe('{\n  \n}');
  });

  it('cuts a long _id at 60 characters in the title, and says beside Save that the undo history is off', () => {
    const longId = 'x'.repeat(80);
    expect(view({ ...state, id: longId }).title).toHaveLength(60);
    expect(view({ ...state, undoOff: true }).undoLine).toBe(
      "The undo history is off for this connection: this can't be undone.",
    );
  });
});
