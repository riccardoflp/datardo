import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/field/remove';
import { fieldContext, planOf, readOf, started, type Start } from './harness';

const context = fieldContext('field.remove');
const undoOff = fieldContext('field.remove', { 'datardo.undo.enabled': false });
const byKind: Start = { field: 'tmp', filter: { kind: 'x' }, written: '{ kind: "x" }' };

describe('field.remove', () => {
  it('removes tmp from every matching document, also where it is null', () => {
    const first = readOf(plan(context, started({ field: 'tmp' })));
    expect(first).toMatchObject({ key: 'reached', read: 'query.count' });
    expect(first.args).toMatchObject({ filter: '{ tmp: { $exists: true } }' });
    const removed = planOf(plan(context, started({ field: 'tmp' }, { reached: 4, removed: 4 })));
    expect(removed.steps[0]?.text).toBe('db.people.updateMany({ tmp: { $exists: true } }, { $unset: { tmp: "" } })');
  });

  it('removes meta.a where meta is a sub-document and counts a document where meta is an array', () => {
    const removed = planOf(plan(context, started({ field: 'meta.a' }, { reached: 3, removed: 2 })));
    expect(removed.steps[0]?.text).toBe(
      'db.people.updateMany({ $and: [{ "meta.a": { $exists: true } }, { meta: { $not: { $type: "array" } } }] }, ' +
        '{ $unset: { "meta.a": "" } })',
    );
    expect(removed.danger.kind === 'none' ? '' : removed.danger.text).toBe(
      'Remove meta.a from 2 documents of people?\n' +
        '1 document where meta.a is inside an array is left out: remove it from the elements with Update many and $[].\n' +
        'The filter is empty, so every document of the collection is affected.',
    );
  });

  it('removes items[].sku from the elements of items, leaving out a document where items is not an array', () => {
    const removed = planOf(plan(context, started({ field: 'items.sku', array: 'items' }, { reached: 4, removed: 3 })));
    expect(removed.steps[0]?.text).toBe(
      'db.people.updateMany({ $and: [{ "items.sku": { $exists: true } }, { items: { $type: "array" } }] }, ' +
        '{ $unset: { "items.$[].sku": "" } })',
    );
    const lines = removed.danger.kind === 'none' ? [] : removed.danger.text.split('\n');
    expect(lines[0]).toBe('Remove items[].sku from the elements of items in 3 documents of people?');
    expect(lines[1]).toBe("1 document where items isn't an array is left out.");
    expect(removed.title).toBe('Remove field items[].sku');
  });

  it('with an empty filter and the undo history on, removes in all with no name to type', () => {
    const removed = planOf(plan(context, started({ field: 'tmp' }, { reached: 7, removed: 7 })));
    expect(removed.danger).toMatchObject({ kind: 'confirm', button: 'Remove in all' });
    expect(removed.danger.kind === 'none' ? '' : removed.danger.text).toContain(
      'Remove tmp from 7 documents of people?',
    );
  });

  it('with an empty filter and the undo history off, asks to type people', () => {
    const removed = planOf(plan(undoOff, started({ field: 'tmp' }, { reached: 7, removed: 7 })));
    expect(removed.danger).toMatchObject({ kind: 'destructive', button: 'Remove in all', name: 'people' });
  });

  it('with a filter and the undo history off, confirms with Remove', () => {
    const removed = planOf(plan(undoOff, started(byKind, { reached: 2, removed: 2 })));
    expect(removed.danger).toMatchObject({ kind: 'confirm', button: 'Remove' });
    expect(removed.title).toBe('Remove field tmp where { kind: "x" }');
  });

  it('takes the column tmp out of the columns layout', () => {
    const removed = planOf(plan(context, started({ field: 'tmp' }, { reached: 1, removed: 1 })));
    expect(removed.steps[1]).toMatchObject({ kind: 'app', action: 'table.rename-in-layout', args: { from: 'tmp' } });
    expect(removed.steps[1]?.kind === 'app' ? removed.steps[1].args : {}).not.toHaveProperty('to');
  });

  it('is in the undo history as Remove field tmp, and publishes for redis-oplog', () => {
    const removed = planOf(plan(context, started({ field: 'tmp' }, { reached: 1, removed: 1 })));
    expect(removed.title).toBe('Remove field tmp');
    expect(removed.publishes).toBe(true);
    expect(removed.after[0]).toMatchObject({ text: 'Removed tmp from 1 document of people.' });
  });

  it('says that no document has the field, with the documents left out', () => {
    expect(plan(context, started({ field: 'meta.a' }, { reached: 2, removed: 0 }))).toEqual({
      kind: 'refuse',
      code: 'field.remove/no-field',
      message:
        'No document of people has meta.a.\n' +
        '2 documents where meta.a is inside an array are left out: remove it from the elements with Update many and $[].',
    });
  });

  it('is refused on a view and on a read-only connection', () => {
    expect(plan(context, started({ field: 'tmp', view: true }))).toMatchObject({ code: 'field.remove/view' });
    expect(plan(context, started({ field: 'tmp', connection: 'c-production' }))).toMatchObject({
      code: 'field.remove/read-only',
    });
  });
});
