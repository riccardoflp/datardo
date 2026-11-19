import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/field/rename';
import type { Answers } from '../../../src/shared/feature';
import { fieldContext, planOf, readOf, started, type Start } from './harness';

const byKind: Start = { field: 'name', filter: { kind: 'x' }, written: '{ kind: "x" }' };
const context = fieldContext('field.rename');
const undoOff = fieldContext('field.rename', { 'datardo.undo.enabled': false });

function counted(start: Start, to: string, counts: { reached: number; renamed: number; overwrites: number }): Answers {
  return started(start, { name: to, ...counts });
}

describe('field.rename', () => {
  it('asks the new name in a dialog titled Rename name, filled with the current name', () => {
    const outcome = plan(context, started(byKind));
    expect(outcome.kind).toBe('ask');
    if (outcome.kind === 'ask') {
      expect(outcome.question.title).toBe('Rename name');
      expect(outcome.question.fields[0]).toMatchObject({
        key: 'name',
        default: 'name',
        label: 'New name of name in the documents matching the filter (a dotted path moves it into a sub-document)',
      });
    }
  });

  it('counts the documents it reaches, renames and overwrites, with the filter of field.rename-plan', () => {
    const first = readOf(plan(context, started(byKind, { name: 'fullName' })));
    expect(first).toMatchObject({ key: 'reached', read: 'query.count' });
    expect(first.args).toMatchObject({ filter: '{ $and: [{ kind: "x" }, { name: { $exists: true } }] }', exact: true });
    const second = readOf(plan(context, started(byKind, { name: 'fullName', reached: 3 })));
    expect(second.key).toBe('renamed');
    const third = readOf(plan(context, started(byKind, { name: 'fullName', reached: 3, renamed: 3 })));
    expect(third.key).toBe('overwrites');
    expect(third.args).toMatchObject({
      filter: '{ $and: [{ $and: [{ kind: "x" }, { name: { $exists: true } }] }, { fullName: { $exists: true } }] }',
    });
  });

  it('asks about 3 documents matching the filter, and says that 1 already has fullName', () => {
    const renamed = planOf(plan(context, counted(byKind, 'fullName', { reached: 3, renamed: 3, overwrites: 1 })));
    expect(renamed.danger).toEqual({
      kind: 'confirm',
      text:
        'Rename name to fullName in 3 documents matching the filter?\n' +
        '1 document already has fullName: its value is replaced by that of name.',
      button: 'Rename',
    });
    expect(renamed.touches).toBe('3 documents');
  });

  it('shows the updateMany with $rename exactly as it is sent', () => {
    const renamed = planOf(plan(context, counted(byKind, 'fullName', { reached: 3, renamed: 3, overwrites: 0 })));
    const [step] = renamed.steps;
    expect(step?.text).toBe(
      'db.people.updateMany({ $and: [{ kind: "x" }, { name: { $exists: true } }] }, { $rename: { name: "fullName" } })',
    );
    expect(step).toMatchObject({ kind: 'engine', writes: true });
  });

  it('leaves out, and counts, a document where addr is an array', () => {
    const start: Start = { field: 'addr.city' };
    const moved = planOf(plan(context, counted(start, 'city', { reached: 4, renamed: 3, overwrites: 0 })));
    expect(moved.steps[0]?.text).toBe(
      'db.people.updateMany({ $and: [{ "addr.city": { $exists: true } }, { addr: { $not: { $type: "array" } } }] }, ' +
        '{ $rename: { "addr.city": "city" } })',
    );
    expect(moved.danger.kind === 'none' ? '' : moved.danger.text).toContain(
      "1 document with addr.city or city inside an array is left out: $rename can't go through arrays.",
    );
  });

  it('asks again for a name on the same path, and for a different one', () => {
    const inside = plan(context, started({ field: 'a' }, { name: 'a.b' }));
    expect(inside.kind === 'ask' ? inside.question.text : '').toBe(
      "a and a.b are on the same path: a field can't be moved inside itself or its parent",
    );
    const outside = plan(context, started({ field: 'a.b' }, { name: 'a' }));
    expect(outside.kind === 'ask' ? outside.question.text : '').toContain('are on the same path');
    const same = plan(context, started({ field: 'name' }, { name: 'name' }));
    expect(same.kind === 'ask' ? same.question.text : '').toBe('Enter a different name');
  });

  it('with an empty filter and the undo history on, renames in all with no name to type', () => {
    const all = planOf(
      plan(context, counted({ field: 'name' }, 'fullName', { reached: 5, renamed: 5, overwrites: 0 })),
    );
    expect(all.danger).toEqual({
      kind: 'confirm',
      text:
        'Rename name to fullName in 5 documents of people?\n' +
        'The filter is empty, so every document of the collection is affected.',
      button: 'Rename in all',
    });
    expect(all.undo).toEqual({
      keeps: {
        connection: 'c-local',
        database: 'shop',
        collection: 'people',
        filter: { name: { $exists: true } },
        written: {},
      },
    });
  });

  it('with an empty filter and the undo history off, asks to type people', () => {
    const all = planOf(
      plan(undoOff, counted({ field: 'name' }, 'fullName', { reached: 5, renamed: 5, overwrites: 0 })),
    );
    expect(all.danger).toMatchObject({ kind: 'destructive', button: 'Rename in all', name: 'people' });
  });

  it('with an empty filter over the limit of the undo history, asks to type people', () => {
    const over = { reached: 50_000, renamed: 50_000, overwrites: 0 };
    const all = planOf(plan(context, counted({ field: 'name' }, 'fullName', over)));
    expect(all.danger).toMatchObject({ kind: 'destructive', name: 'people' });
    expect(all.touches).toBe('50,000 documents');
  });

  it('with a filter and the undo history off, confirms with Rename and no name to type', () => {
    const renamed = planOf(plan(undoOff, counted(byKind, 'fullName', { reached: 3, renamed: 3, overwrites: 0 })));
    expect(renamed.danger).toMatchObject({ kind: 'confirm', button: 'Rename' });
  });

  it('makes the column fullName take the place of name in the columns layout', () => {
    const renamed = planOf(plan(context, counted(byKind, 'fullName', { reached: 3, renamed: 3, overwrites: 0 })));
    expect(renamed.steps[1]).toMatchObject({
      kind: 'app',
      action: 'table.rename-in-layout',
      args: { connection: 'c-local', database: 'shop', collection: 'people', from: 'name', to: 'fullName' },
    });
  });

  it('writes nothing on items[].sku and says to use Update many with $map', () => {
    const outcome = plan(context, started({ field: 'items.sku', array: 'items' }));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'field.rename/array-element' });
    expect(outcome.kind === 'refuse' ? outcome.message : '').toBe(
      "items[].sku is a field of the elements of the array items: $rename can't change fields inside arrays.\n" +
        'Use Update many with a pipeline that rewrites the array, e.g. [ { $set: { items: { $map: { input: "$items", in: … } } } } ].',
    );
  });

  it('says that no document matching the filter has name, and asks nothing more', () => {
    const outcome = plan(context, counted(byKind, 'fullName', { reached: 0, renamed: 0, overwrites: 0 }));
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'field.rename/no-field',
      message: 'No document matching the filter has name.',
    });
  });

  it('is in the undo history as Rename field name to fullName where { kind: "x" }', () => {
    const renamed = planOf(plan(context, counted(byKind, 'fullName', { reached: 3, renamed: 3, overwrites: 0 })));
    expect(renamed.title).toBe('Rename field name to fullName where { kind: "x" }');
    expect(renamed.publishes).toBe(true);
    expect(renamed.after[0]).toEqual({
      kind: 'notify',
      level: 'success',
      text: 'Renamed name to fullName in 3 documents of people.',
    });
  });

  it('is refused on a read-only connection, on a view and with a filter that does not parse', () => {
    expect(plan(context, started({ ...byKind, connection: 'c-production' }))).toEqual({
      kind: 'refuse',
      code: 'field.rename/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(plan(context, started({ ...byKind, view: true }))).toMatchObject({ code: 'field.rename/view' });
    const invalid = {
      ...started(byKind),
      args: { ...(started(byKind)['args'] as object), filter: { kind: 'invalid', message: 'x' } },
    };
    expect(plan(context, invalid)).toEqual({
      kind: 'refuse',
      code: 'field.rename/invalid-filter',
      message: 'Invalid query syntax — check the highlighted field.',
    });
  });

  it('refuses a field that cannot be changed', () => {
    expect(plan(context, started({ field: '_id.x' }))).toEqual({
      kind: 'refuse',
      code: 'field.rename/invalid-path',
      message: "_id.x: _id can't be changed.",
    });
  });
});
