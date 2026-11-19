/**
 * Reading one document with its types, editing a value in its cell, and copying a value or a field path from the
 * inspector, on `shop.orders` of Local, with the replies of MongoDB 8.2 recorded in `test/fixtures/replies`.
 */
import { describe, expect, it } from 'vitest';
import { afterReplies as editAfterReplies, plan as editPlan } from '../../../src/features/document/inline-edit';
import { plan as copyPathPlan } from '../../../src/features/document/copy-path';
import { plan as copyValuePlan } from '../../../src/features/document/copy-value';
import { parse, request } from '../../../src/features/document/read';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers } from '../../../src/shared/feature';
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

const where = { connection: local.id, database: 'shop', collection: 'orders' };
const orders = { collection: 'orders' };
const stored = parse([recorded('find-types')]) as Readonly<Record<string, Json>>;

describe('document.read', () => {
  it('returns a document with Int32, Double and Long apart, and every other type as stored', () => {
    expect(stored['qty']).toEqual(int(3));
    expect(stored['price']).toEqual(double('5.5'));
    expect(stored['big']).toEqual(long('9007199254740993'));
    expect(stored['amount']).toEqual({ $numberDecimal: '1.10' });
    expect(stored['pattern']).toEqual({ $regularExpression: { pattern: '^a', options: 'i' } });
  });

  it('matches an _id that is a number by value: 1 finds the document whose _id is Double(1)', () => {
    expect(parse([recorded('find-double-id')])).toEqual({ _id: double('1.0'), name: 'Double id' });
  });

  it('gives nothing, not an error, for an _id no document has', () => {
    expect(parse([recorded('find-missing')])).toBeNull();
  });

  it('reads only _id and qty with the projection { qty: 1 }', () => {
    const read = request(contextOn('document.read', orders), { ...where, id: int(7), field: 'qty' });
    expect(read.requests[0]?.request).toMatchObject({
      method: 'find',
      arguments: [{ _id: int(7) }, { projection: { qty: int(1) } }],
      limit: 1,
    });
    expect(parse([recorded('find-projection')])).toEqual({ _id: int(7), qty: int(3) });
  });

  it('reads the whole document by its _id, at most one, from the target when the arguments name no collection', () => {
    const read = request(contextOn('document.read', orders), { id: objectId('65f1c0de9a7b4e00012f3a2c') });
    expect(read.requests[0]).toMatchObject({
      connection: local.id,
      request: { database: 'shop', collection: 'orders', arguments: [{ _id: objectId('65f1c0de9a7b4e00012f3a2c') }] },
    });
  });
});

/** The answers of an edit of `path`, shown as `value`, typed as `typed`, read back as `current`. */
function edit(path: string, value: Json | undefined, typed: string, current: Json | null = stored): Answers {
  const args = value === undefined ? { id: int(7), path, missing: true } : { id: int(7), path, value };
  return started(args, { value: typed, current });
}

describe('document.inline-edit', () => {
  const context = contextOn('document.inline-edit', orders);

  it('runs updateOne with the value just read in the filter, and the new value in $set', () => {
    const plan = planOf(editPlan(context, edit('qty', int(3), '5')));
    expect(stepTexts(plan)).toEqual(['db.orders.updateOne({ _id: 7, qty: 3 }, { $set: { qty: 5 } })']);
    expect(plan.danger).toEqual({ kind: 'none' });
    expect(plan.publishes).toBe(true);
  });

  it('keeps a Double a Double and a Long a Long, and makes an Int32 a Long for NumberLong(8)', () => {
    expect(sentArguments(planOf(editPlan(context, edit('price', double('5.5'), '6'))))[1]).toEqual({
      $set: { price: double('6.0') },
    });
    expect(sentArguments(planOf(editPlan(context, edit('big', long('9007199254740993'), '7'))))[1]).toEqual({
      $set: { big: long('7') },
    });
    expect(sentArguments(planOf(editPlan(context, edit('qty', int(3), 'NumberLong(8)'))))[1]).toEqual({
      $set: { qty: long('8') },
    });
  });

  it('keeps the types once written: the recorded document after the edits has a Double, a Long and the other items', () => {
    const after = parse([recorded('find-after-edit')]) as Readonly<Record<string, Json>>;
    expect(after['price']).toEqual(double('6.0'));
    expect(after['big']).toEqual(long('7'));
    expect(after['items']).toEqual([{ qty: int(1) }, { qty: int(2) }, { qty: int(30) }]);
  });

  it('adds a missing field to that document only, with { qty: { $exists: false } } in the filter', () => {
    const current = { _id: int(7) };
    const plan = planOf(editPlan(context, edit('qty', undefined, '5', current)));
    expect(sentArguments(plan)[0]).toEqual({ _id: int(7), qty: { $exists: false } });
    expect(plan.danger).toEqual({ kind: 'none' });
  });

  it('sets items.2.qty for the third element, leaving the other elements as they were', () => {
    const plan = planOf(editPlan(context, edit('items.2.qty', int(3), '30')));
    expect(stepTexts(plan)).toEqual([
      'db.orders.updateOne({ _id: 7, "items.2.qty": 3 }, { $set: { "items.2.qty": 30 } })',
    ]);
  });

  it("asks again with the reader's message and sends nothing when the text does not parse", () => {
    const question = questionOf(editPlan(context, edit('qty', int(3), '{ qty: ')));
    expect(question.text).toMatch(/^JSON5: invalid end of input/u);
    expect(question.fields[0]).toMatchObject({ key: 'value', default: '{ qty: ' });
  });

  it('opens the editor with the value as shown and the hint, and adds the undo line when the undo history is off', () => {
    const first = questionOf(editPlan(context, started({ id: int(7), path: 'qty', value: int(3) })));
    expect(first.text).toBe('Enter to save · Shift+Enter new line · Esc to cancel');
    expect(first.fields[0]).toMatchObject({ default: '3' });
    const off = contextOn('document.inline-edit', { ...orders, settings: { 'datardo.undo.enabled': false } });
    const second = questionOf(editPlan(off, started({ id: int(7), path: 'qty', value: int(3) })));
    expect(second.text).toBe(
      "Enter to save · Shift+Enter new line · Esc to cancel\nThe undo history is off for this connection: this can't be undone.",
    );
  });

  it('asks Overwrite when another client changed the value after the table was loaded', () => {
    const current = { ...stored, qty: int(9) };
    const plan = planOf(editPlan(context, edit('qty', int(3), '5', current)));
    expect(plan.danger).toEqual({
      kind: 'confirm',
      text: 'qty was changed to 9 in the database after it was loaded. Overwrite it?',
      button: 'Overwrite',
    });
    expect(sentArguments(plan)[0]).toEqual({ _id: int(7), qty: int(9) });
  });

  it('asks Overwrite when the value was removed after the table was loaded', () => {
    const plan = planOf(editPlan(context, edit('qty', int(3), '5', { _id: int(7) })));
    expect(plan.danger).toMatchObject({ text: 'qty was removed in the database after it was loaded. Overwrite it?' });
  });

  it('refuses _id and its sub-fields, a view and a read-only connection, before asking anything', () => {
    expect(refusalOf(editPlan(context, started({ id: int(7), path: '_id', value: int(7) }))).code).toBe(
      'document.inline-edit/id',
    );
    expect(refusalOf(editPlan(context, started({ id: int(7), path: '_id.a', value: int(7) }))).code).toBe(
      'document.inline-edit/id',
    );
    const view = started({ id: int(7), path: 'qty', value: int(3), view: true });
    expect(refusalOf(editPlan(context, view))).toEqual({
      code: 'document.inline-edit/view',
      message: 'Views are read-only.',
    });
    const readOnly = contextOn('document.inline-edit', { ...orders, connection: production });
    expect(refusalOf(editPlan(readOnly, started({ id: int(7), path: 'qty', value: int(3) })))).toEqual({
      code: 'document.inline-edit/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('says the document is not found when it was deleted', () => {
    expect(refusalOf(editPlan(context, edit('qty', int(3), '5', null)))).toEqual({
      code: 'document.inline-edit/not-found',
      message: 'Document not found: it may have been deleted.',
    });
  });

  it('is in the undo history as Edit qty of 7, keeping the document by its _id', () => {
    const plan = planOf(editPlan(context, edit('qty', int(3), '5')));
    expect(plan.title).toBe('Edit qty of 7');
    expect(plan.undo).toMatchObject({ keeps: { kind: 'ids', ids: [int(7)], count: 1 } });
  });

  it('reads the top-level field of the path only, before writing', () => {
    const outcome = editPlan(context, started({ id: int(7), path: 'items.2.qty', value: int(3) }, { value: '30' }));
    expect(outcome).toMatchObject({
      kind: 'read',
      need: { read: 'document.read', args: { id: int(7), field: 'items' } },
    });
  });

  it('says the value changed again when the guarded update matched nothing', () => {
    const answers = edit('qty', int(3), '5');
    expect(editAfterReplies(context, answers, [recorded('updateOne-changed-again')])).toEqual({
      kind: 'refuse',
      code: 'document.inline-edit/changed-again',
      message: 'qty changed again in the database: refresh and retry.',
    });
    expect(editAfterReplies(context, answers, [recorded('updateOne')])).toEqual({
      kind: 'after',
      after: [{ kind: 'refresh', connection: local.id }],
    });
  });
});

describe('document.copy-value', () => {
  const copied = (value: Json): unknown =>
    planOf(copyValuePlan(contextOn('document.copy-value'), started({ value }))).after;

  it('copies createdAt as ISODate("2024-03-15T10:00:00.000Z"), and says so', () => {
    expect(copied({ $date: { $numberLong: String(Date.UTC(2024, 2, 15, 10)) } })).toEqual([
      { kind: 'copy', text: 'ISODate("2024-03-15T10:00:00.000Z")' },
      { kind: 'notify', level: 'info', text: 'Copied to the clipboard' },
    ]);
  });

  it('copies a Long beyond the safe integers as NumberLong("9007199254740993")', () => {
    expect(copied(long('9007199254740993'))).toContainEqual({ kind: 'copy', text: 'NumberLong("9007199254740993")' });
  });

  it('copies a whole sub-document on several lines, which reads back as the same value', () => {
    expect(copied({ city: 'Rome', zip: int(100) })).toContainEqual({
      kind: 'copy',
      text: '{\n  city: "Rome",\n  zip: 100\n}',
    });
  });

  it('works on a read-only connection and writes nothing', () => {
    const plan = planOf(
      copyValuePlan(contextOn('document.copy-value', { connection: production }), started({ value: int(1) })),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.danger).toEqual({ kind: 'none' });
  });
});

describe('document.copy-path', () => {
  const copied = (path: Json): unknown =>
    planOf(copyPathPlan(contextOn('document.copy-path'), started({ path }))).after;

  it('copies address.city for city inside address', () => {
    expect(copied(['address', 'city'])).toContainEqual({ kind: 'copy', text: 'address.city' });
  });

  it('copies items.2.qty for qty of the third element of items', () => {
    expect(copied(['items', 2, 'qty'])).toContainEqual({ kind: 'copy', text: 'items.2.qty' });
  });

  it('joins names with a dot or a $ as they are', () => {
    expect(copied(['a.b', '$c'])).toEqual([
      { kind: 'copy', text: 'a.b.$c' },
      { kind: 'notify', level: 'info', text: 'Copied to the clipboard' },
    ]);
  });
});
