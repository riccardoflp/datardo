import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/field/convert-type';
import { fieldContext, planOf, readOf, started, type Start } from './harness';

const context = fieldContext('field.convert-type');
const undoOff = fieldContext('field.convert-type', { 'datardo.undo.enabled': false });
const types = [
  { type: 'string', count: 2 },
  { type: 'double', count: 1 },
  { type: 'null', count: 1 },
  { type: 'array', count: 1 },
  { type: 'int', count: 1 },
];
const byKind: Start = { field: 'v', filter: { kind: 'x' }, written: '{ kind: "x" }' };

describe('field.convert-type', () => {
  it('reads the types of v first, then lists them with the types to convert to', () => {
    const read = readOf(plan(context, started({ field: 'v' })));
    expect(read).toMatchObject({ key: 'types', read: 'field.type-counts' });
    expect(read.args).toMatchObject({ field: 'v', filter: {} });
    const outcome = plan(context, started({ field: 'v' }, { types }));
    expect(outcome.kind).toBe('ask');
    if (outcome.kind === 'ask') {
      expect(outcome.question.title).toBe('Convert v');
      const [field] = outcome.question.fields;
      expect(field?.label).toBe('Type to convert the values to · now: string 2 · double 1 · null 1 · array 1 · int 1');
      expect(field?.kind === 'pick-one' ? field.choices.map((choice) => choice.value) : []).toEqual([
        'string',
        'int',
        'long',
        'double',
        'decimal',
        'bool',
        'date',
        'objectId',
      ]);
    }
  });

  it('opens the list without the now: part when counting failed or took too long', () => {
    const outcome = plan(context, started({ field: 'v' }, { types: [] }));
    expect(outcome.kind === 'ask' ? outcome.question.fields[0]?.label : '').toBe('Type to convert the values to');
  });

  it('asks about 3 documents for int, keeping the values that cannot be converted', () => {
    const first = readOf(plan(context, started({ field: 'v' }, { types, type: 'int' })));
    expect(first.args).toMatchObject({ filter: '{ v: { $exists: true, $not: { $type: ["int", "null", "array"] } } }' });
    const converted = planOf(plan(context, started({ field: 'v' }, { types, type: 'int', reached: 3, converted: 3 })));
    expect(converted.steps[0]?.text).toBe(
      'db.people.updateMany({ v: { $exists: true, $not: { $type: ["int", "null", "array"] } } }, ' +
        '[{ $set: { v: { $convert: { input: "$v", to: "int", onError: "$v", onNull: "$v" } } } }])',
    );
    expect(converted.danger.kind === 'none' ? '' : converted.danger.text).toBe(
      'Convert v to int in 3 documents of people?\n' +
        "Values that can't be converted keep their value and type; null and arrays are left as they are.\n" +
        'The filter is empty, so every document of the collection is affected.',
    );
    expect(converted.danger).toMatchObject({ kind: 'confirm', button: 'Convert in all' });
  });

  it('leaves out, and counts, a document where nested is an array', () => {
    const answers = started({ field: 'nested.n' }, { types, type: 'int', reached: 3, converted: 2 });
    const converted = planOf(plan(context, answers));
    expect(converted.danger.kind === 'none' ? '' : converted.danger.text).toContain(
      '1 document where nested.n is inside an array is left out.',
    );
  });

  it('writes nothing when every value already has the type', () => {
    const answers = started(byKind, { types, type: 'int', reached: 0, converted: 0 });
    expect(plan(context, answers)).toEqual({
      kind: 'refuse',
      code: 'field.convert-type/nothing-to-convert',
      message:
        'No value of v matching the filter needs converting to int: null, missing values and arrays are left as they are.',
    });
  });

  it('writes nothing on items[].qty', () => {
    const outcome = plan(context, started({ field: 'items.qty', array: 'items' }));
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'field.convert-type/array-element' });
    expect(outcome.kind === 'refuse' ? outcome.message : '').toContain(
      "items[].qty is a field of the elements of the array items: Convert type can't change fields inside arrays.",
    );
  });

  it('with an empty filter and the undo history off, asks to type people', () => {
    const converted = planOf(plan(undoOff, started({ field: 'v' }, { types, type: 'int', reached: 3, converted: 3 })));
    expect(converted.danger).toMatchObject({ kind: 'destructive', button: 'Convert in all', name: 'people' });
  });

  it('with a filter and the undo history off, confirms with Convert', () => {
    const converted = planOf(plan(undoOff, started(byKind, { types, type: 'int', reached: 3, converted: 3 })));
    expect(converted.danger).toMatchObject({ kind: 'confirm', button: 'Convert' });
  });

  it('is in the undo history as Convert field v to int, and publishes for redis-oplog', () => {
    const converted = planOf(plan(context, started({ field: 'v' }, { types, type: 'int', reached: 3, converted: 3 })));
    expect(converted.title).toBe('Convert field v to int');
    expect(converted.publishes).toBe(true);
    expect(converted.undo).toMatchObject({ keeps: { collection: 'people', written: {} } });
  });

  it('is refused on a view and on a read-only connection', () => {
    expect(plan(context, started({ field: 'v', view: true }))).toMatchObject({ code: 'field.convert-type/view' });
    expect(plan(context, started({ field: 'v', connection: 'c-production' }))).toMatchObject({
      code: 'field.convert-type/read-only',
    });
  });
});
