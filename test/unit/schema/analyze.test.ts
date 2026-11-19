import { describe, expect, it } from 'vitest';
import { analysisBatch, schemaSummary, startAnalysis } from '../../../src/features/schema/analyze';
import type { FieldSummary, TypeSummary } from '../../../src/features/schema/types';
import type { Json } from '../../../src/shared/engine-request';
import { double, int, schemaDocuments } from './context';

/** Every field of a summary in the order of the table: each field, its nested fields, then its elements and theirs. */
function flattened(fields: readonly FieldSummary[]): readonly FieldSummary[] {
  return fields.flatMap((field) => [
    field,
    ...flattened(field.fields ?? []),
    ...field.types.flatMap((type) => (type.elements === undefined ? [] : flattened([type.elements]))),
  ]);
}

function row(field: FieldSummary): string {
  const types = field.types.map((type) => `${type.type} ${String(type.count)}`).join(', ');
  return `${field.label} | ${String(field.count)} of ${String(field.of)} | ${types}`;
}

function fieldOf(fields: readonly FieldSummary[], label: string): FieldSummary {
  const found = flattened(fields).find((field) => field.label === label);
  if (found === undefined) {
    throw new Error(`No field ${label}`);
  }
  return found;
}

function typeOf(field: FieldSummary, type: string): TypeSummary {
  const found = field.types.find((each) => each.type === type);
  if (found === undefined) {
    throw new Error(`No type ${type} in ${field.label}`);
  }
  return found;
}

function valuesOf(type: TypeSummary): readonly (readonly [Json, number])[] {
  return (type.values ?? []).map((each) => [each.value, each.count]);
}

const workedExample = schemaDocuments('worked-example');

describe('schema.analyze', () => {
  it('gives the worked example exactly the rows of its table, in that order', () => {
    const summary = schemaSummary(workedExample);
    expect(summary.analyzed).toBe(4);
    expect(flattened(summary.fields).map(row)).toEqual([
      '_id | 4 of 4 | objectId 4',
      'status | 4 of 4 | string 4',
      'total | 4 of 4 | double 2, int 1, null 1',
      'qty | 2 of 4 | int 1, long 1',
      'address | 3 of 4 | object 2, string 1',
      'address.city | 2 of 2 | string 2',
      'address.zip | 1 of 2 | string 1',
      'items | 3 of 4 | array 3',
      'items[] | 3 of 3 | object 3',
      'items[].sku | 3 of 3 | string 3',
      'items[].qty | 3 of 3 | int 3',
      'tags | 2 of 4 | array 2',
      'tags[] | 3 of 2 | string 3',
    ]);
  });

  it('gives the worked example the values of its table', () => {
    const { fields } = schemaSummary(workedExample);
    const id = typeOf(fieldOf(fields, '_id'), 'objectId');
    expect(id.distinct).toBe(4);
    expect(valuesOf(id).map(([, count]) => count)).toEqual([1, 1, 1, 1]);
    expect(valuesOf(typeOf(fieldOf(fields, 'status'), 'string'))).toEqual([
      ['paid', 3],
      ['new', 1],
    ]);
    const total = fieldOf(fields, 'total');
    expect(typeOf(total, 'double')).toMatchObject({
      distinct: 2,
      smallest: { $numberDouble: '7.0' },
      largest: { $numberDouble: '42.5' },
    });
    expect(valuesOf(typeOf(total, 'int'))).toEqual([[int(12), 1]]);
    expect(valuesOf(typeOf(fieldOf(fields, 'qty'), 'long'))).toEqual([[{ $numberLong: '5' }, 1]]);
    expect(valuesOf(typeOf(fieldOf(fields, 'address'), 'string'))).toEqual([['unknown', 1]]);
    expect(valuesOf(typeOf(fieldOf(fields, 'address.city'), 'string'))).toEqual([
      ['Milano', 1],
      ['Roma', 1],
    ]);
    expect(typeOf(fieldOf(fields, 'items'), 'array').lengths).toEqual({ smallest: 0, largest: 2, average: 1 });
    expect(valuesOf(typeOf(fieldOf(fields, 'items[].sku'), 'string'))).toEqual([
      ['A1', 2],
      ['B2', 1],
    ]);
    expect(typeOf(fieldOf(fields, 'items[].qty'), 'int')).toMatchObject({ smallest: int(1), largest: int(3) });
    expect(typeOf(fieldOf(fields, 'tags'), 'array').lengths).toEqual({ smallest: 1, largest: 2, average: 1.5 });
    expect(valuesOf(typeOf(fieldOf(fields, 'tags[]'), 'string'))).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });

  it('nests the fields of address in it and those of the items in the elements of items, with their paths', () => {
    const { fields } = schemaSummary(workedExample);
    const address = fieldOf(fields, 'address');
    expect(address.fields?.map((field) => [field.name, field.path])).toEqual([
      ['city', 'address.city'],
      ['zip', 'address.zip'],
    ]);
    const elements = typeOf(fieldOf(fields, 'items'), 'array').elements;
    expect(elements).toMatchObject({ name: '[]', path: 'items', label: 'items[]' });
    expect(elements?.fields?.map((field) => [field.name, field.path, field.label])).toEqual([
      ['sku', 'items.sku', 'items[].sku'],
      ['qty', 'items.qty', 'items[].qty'],
    ]);
    expect(typeOf(fieldOf(fields, 'tags'), 'array').elements?.path).toBe('tags');
  });

  it('puts double before int and null in total, 7.0 counting as a double', () => {
    const total = fieldOf(schemaSummary(workedExample).fields, 'total');
    expect(total.types.map((type) => type.type)).toEqual(['double', 'int', 'null']);
    expect(valuesOf(typeOf(total, 'double'))).toContainEqual([{ $numberDouble: '7.0' }, 1]);
  });

  it('gives the values 1 to 10 their list and no ranges, and the values 1 to 11 ranges and no list', () => {
    const ten = schemaSummary(Array.from({ length: 10 }, (_, index) => ({ n: int(index + 1) })));
    const tenType = typeOf(fieldOf(ten.fields, 'n'), 'int');
    expect(tenType.values).toHaveLength(10);
    expect(tenType.ranges).toBeUndefined();
    const eleven = schemaSummary(Array.from({ length: 11 }, (_, index) => ({ n: int(index + 1) })));
    const elevenType = typeOf(fieldOf(eleven.fields, 'n'), 'int');
    expect(elevenType.values).toBeUndefined();
    expect(elevenType.ranges?.reduce((sum, range) => sum + range.count, 0)).toBe(11);
    expect(elevenType.ranges?.[0]?.from).toEqual(int(1));
  });

  it('counts 1,000 distinct strings of 1,500 and marks the type as having more, its 10 most frequent among them', () => {
    const documents = Array.from({ length: 1500 }, (_, index) => ({ s: `v${String(index)}` }));
    const extra = [{ s: 'v1200' }, { s: 'v1200' }, { s: 'v7' }, { s: 'v7' }, { s: 'v3' }];
    const type = typeOf(fieldOf(schemaSummary([...documents, ...extra]).fields, 's'), 'string');
    expect(type).toMatchObject({ count: 1505, distinct: 1000, more: true });
    expect(type.values).toHaveLength(10);
    expect(valuesOf(type).slice(0, 3)).toEqual([
      ['v7', 3],
      ['v3', 2],
      ['v0', 1],
    ]);
    expect(valuesOf(type).some(([value]) => value === 'v1200')).toBe(false);
  });

  it('analyzes 500 names of a document with 600 and marks that there are more, and the same in an object value', () => {
    const wide = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`f${String(index)}`, int(index)]));
    const summary = schemaSummary([wide]);
    expect(summary.fields).toHaveLength(500);
    expect(summary.moreFields).toBe(true);
    const nested = schemaSummary([{ inner: wide, other: int(1) }]);
    expect(nested.moreFields).toBeUndefined();
    const inner = fieldOf(nested.fields, 'inner');
    expect(inner.fields).toHaveLength(500);
    expect(inner.moreFields).toBe(true);
    expect(nested.fields.map((field) => field.name)).toEqual(['inner', 'other']);
  });

  it('gives a field that is [] in every document the lengths 0 to 0 and no elements', () => {
    const type = typeOf(fieldOf(schemaSummary([{ a: [] }, { a: [] }]).fields, 'a'), 'array');
    expect(type.lengths).toEqual({ smallest: 0, largest: 0, average: 0 });
    expect(type.elements).toBeUndefined();
  });

  it('counts a NaN in its double type and leaves it out of the smallest and the largest', () => {
    const documents = [{ d: double(1.5) }, { d: { $numberDouble: 'NaN' } }, { d: double(3.25) }];
    const type = typeOf(fieldOf(schemaSummary(documents).fields, 'd'), 'double');
    expect(type).toMatchObject({ count: 3, smallest: double(1.5), largest: double(3.25) });
  });

  it('gives 3 distinct strings with their counts and lengths when asked with details, and none without', () => {
    const documents = [{ s: 'ab' }, { s: 'abcd' }, { s: 'ab' }, { s: 'abcdef' }];
    const withDetails = typeOf(fieldOf(schemaSummary(documents, { details: true }).fields, 's'), 'string');
    expect(withDetails.details?.values).toEqual([
      { value: 'ab', count: 2 },
      { value: 'abcd', count: 1 },
      { value: 'abcdef', count: 1 },
    ]);
    expect(withDetails.details?.characters).toEqual({ smallest: 2, largest: 6, average: 3.5 });
    const without = typeOf(fieldOf(schemaSummary(documents).fields, 's'), 'string');
    expect(without.details).toBeUndefined();
  });

  it('gives each type of every BSON type of a recorded sample its name, an Int32 and a Double apart', () => {
    const field = fieldOf(schemaSummary(schemaDocuments('every-type')).fields, 'v');
    expect(field.types.map((type) => type.type)).toEqual([
      'binData',
      'string',
      'int',
      'double',
      'long',
      'decimal',
      'bool',
      'date',
      'objectId',
      'null',
      'object',
      'array',
      'regex',
      'timestamp',
      'javascript',
      'minKey',
      'maxKey',
    ]);
    expect(typeOf(field, 'long').smallest).toEqual({ $numberLong: '9007199254740993' });
    expect(typeOf(field, 'binData')).toEqual({ type: 'binData', count: 2 });
  });

  it('skips a value that is not a document, and does not count it', () => {
    const summary = schemaSummary([{ a: int(1) }, 'text', null, [int(1)], { $numberInt: '3' }]);
    expect(summary.analyzed).toBe(1);
    expect(summary.fields.map(row)).toEqual(['a | 1 of 1 | int 1']);
  });

  it('gives the same summary in batches of the worker as in one call', () => {
    const documents = Array.from({ length: 1234 }, (_, index) => ({
      n: int(index % 37),
      s: index % 3 === 0 ? 'x' : `y${String(index % 5)}`,
      ...(index % 2 === 0 ? { o: { k: int(index) } } : {}),
    }));
    const analysis = startAnalysis();
    for (let start = 0; start < documents.length; start += analysisBatch) {
      analysis.add(documents.slice(start, start + analysisBatch));
    }
    expect(analysis.summary()).toEqual(schemaSummary(documents));
    expect(analysisBatch).toBe(500);
  });
});
