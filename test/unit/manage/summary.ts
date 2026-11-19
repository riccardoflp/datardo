/**
 * A small summary of a sample, as `schema.analyze` gives it, for the tests of `manage.generate-json-schema` while the
 * schema area is written elsewhere: for each field the objects that could have it, the values present (`null`
 * included), the BSON types most frequent first, the fields of its objects and the elements of its arrays.
 */
import type { SampleField, SampleSummary, SampleType } from '../../../src/features/manage/generate-json-schema';
import type { Json } from '../../../src/shared/engine-request';

type JsonObject = { readonly [key: string]: Json };

const wrappers: Readonly<Record<string, string>> = {
  $oid: 'objectId',
  $numberInt: 'int',
  $numberLong: 'long',
  $numberDouble: 'double',
  $numberDecimal: 'decimal',
  $date: 'date',
  $binary: 'binData',
  $regularExpression: 'regex',
  $timestamp: 'timestamp',
};

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The BSON type of a value of canonical Extended JSON; a plain whole number is an `int`. */
function typeOf(value: Json): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  if (typeof value === 'boolean') {
    return 'bool';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'int' : 'double';
  }
  const keys = Object.keys(value);
  const wrapper = keys.length === 1 && keys[0] !== undefined ? wrappers[keys[0]] : undefined;
  return wrapper ?? 'object';
}

/** The summary of values seen in `of` objects (or array elements). */
function fieldOf(name: string, values: readonly Json[], of: number): SampleField {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const value of values) {
    const type = typeOf(value);
    if (!counts.has(type)) {
      order.push(type);
    }
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const objects = values.filter((value): value is JsonObject => typeOf(value) === 'object' && isObject(value));
  const arrays = values.filter((value): value is readonly Json[] => Array.isArray(value));
  const elements = arrays.flat();
  const types = order
    .map((type): SampleType => {
      const count = counts.get(type) ?? 0;
      return type === 'array' ? { type, count, elements: fieldOf('[]', elements, elements.length) } : { type, count };
    })
    .sort((one, other) => other.count - one.count);
  const fields = objects.length === 0 ? undefined : fieldsOf(objects);
  return { name, count: values.length, of, types, ...(fields === undefined ? {} : { fields }) };
}

function fieldsOf(objects: readonly JsonObject[]): readonly SampleField[] {
  const names = [...new Set(objects.flatMap((object) => Object.keys(object)))];
  return names.map((name) =>
    fieldOf(
      name,
      objects.flatMap((object) => (object[name] === undefined ? [] : [object[name]])),
      objects.length,
    ),
  );
}

/** The summary of the documents of a sample. */
export function summaryOf(documents: readonly JsonObject[]): SampleSummary {
  return { analyzed: documents.length, fields: fieldsOf(documents) };
}
