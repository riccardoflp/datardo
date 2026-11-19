import { describe, expect, it } from 'vitest';
import { jsonSchema } from '../../../src/features/manage/generate-json-schema';
import type { Json } from '../../../src/shared/engine-request';
import { summaryOf } from './summary';

type JsonObject = { readonly [key: string]: Json };

function schemaOf(documents: readonly JsonObject[]): JsonObject {
  return jsonSchema(summaryOf(documents));
}

const int = { bsonType: 'int' };
const string = { bsonType: 'string' };

/** The BSON type `$jsonSchema` checks a value against, for the values of these tests. */
function bsonType(value: Json): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return '$numberLong' in value ? 'long' : 'object';
  }
  return typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'bool' : 'int';
}

/** Whether a value keeps a schema of `bsonType`, `required`, `properties` and `items`, as MongoDB checks them. */
function keeps(value: Json, schema: JsonObject): boolean {
  const types = Array.isArray(schema['bsonType']) ? schema['bsonType'] : [schema['bsonType']];
  if (!types.includes(bsonType(value))) {
    return false;
  }
  if (Array.isArray(value)) {
    const items = schema['items'] as JsonObject | undefined;
    return items === undefined || (value as readonly Json[]).every((item) => keeps(item, items));
  }
  if (value === null || typeof value !== 'object' || bsonType(value) !== 'object') {
    return true;
  }
  const object = value as JsonObject;
  const required = (schema['required'] ?? []) as readonly string[];
  const properties = (schema['properties'] ?? {}) as { readonly [key: string]: JsonObject };
  return (
    required.every((name) => name in object) &&
    Object.entries(object).every(([name, item]) => properties[name] === undefined || keeps(item, properties[name]))
  );
}

const samples: readonly (readonly JsonObject[])[] = [
  [
    { _id: 1, name: 'a', age: 3 },
    { _id: 2, name: 'b', age: 'x' },
    { _id: 3, name: null },
  ],
  [
    { a: { b: 1, c: true }, tags: ['x'] },
    { a: { b: 2 }, tags: [] },
  ],
  [{ a: 1 }, { b: 1 }],
  [{ items: [{ sku: 'x', qty: 1 }, { sku: 'y' }] }],
  [{ tags: [] }, { tags: [] }],
];

describe('manage.generate-json-schema', () => {
  it('lists as required the fields present in every document, null counting as present, with their types', () => {
    expect(schemaOf(samples[0] ?? [])).toEqual({
      bsonType: 'object',
      required: ['_id', 'name'],
      properties: { _id: int, name: { bsonType: ['string', 'null'] }, age: { bsonType: ['int', 'string'] } },
    });
  });

  it('gives a field with object values its properties and required, and an array its items', () => {
    expect(schemaOf(samples[1] ?? [])).toEqual({
      bsonType: 'object',
      required: ['a', 'tags'],
      properties: {
        a: { bsonType: 'object', required: ['b'], properties: { b: int, c: { bsonType: 'bool' } } },
        tags: { bsonType: 'array', items: string },
      },
    });
  });

  it('has no required when no field is in every document', () => {
    expect(schemaOf(samples[2] ?? [])).toEqual({ bsonType: 'object', properties: { a: int, b: int } });
  });

  it('describes the objects of an array, with the fields present in every element as required', () => {
    expect(schemaOf(samples[3] ?? [])).toEqual({
      bsonType: 'object',
      required: ['items'],
      properties: {
        items: {
          bsonType: 'array',
          items: { bsonType: 'object', required: ['sku'], properties: { sku: string, qty: int } },
        },
      },
    });
  });

  it('gives no items to arrays that are always empty', () => {
    expect(schemaOf(samples[4] ?? [])).toEqual({
      bsonType: 'object',
      required: ['tags'],
      properties: { tags: { bsonType: 'array' } },
    });
  });

  it('accepts every document of the sample it was generated from', () => {
    for (const sample of samples) {
      const schema = schemaOf(sample);
      expect(sample.every((document) => keeps(document, schema))).toBe(true);
    }
  });

  it('never merges NumberLong(1) and 1: the more frequent type first', () => {
    const long = { $numberLong: '1' };
    expect(schemaOf([{ n: long }, { n: 1 }, { n: long }]).properties).toEqual({ n: { bsonType: ['long', 'int'] } });
    expect(schemaOf([{ n: 1 }, { n: long }, { n: 2 }]).properties).toEqual({ n: { bsonType: ['int', 'long'] } });
  });

  it('adds no additionalProperties', () => {
    expect(JSON.stringify(schemaOf(samples[1] ?? []))).not.toContain('additionalProperties');
  });
});
