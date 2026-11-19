/**
 * Feature: manage.generate-json-schema
 *
 * The validation rules proposed for a collection without any: the BSON types seen for each field, nested and in
 * arrays, and as required the fields present in every object that could have them. It starts from the summary of a
 * sample that `schema.analyze` gives; {@link SampleSummary} is the part of that summary it reads.
 */
import type { Json } from '../../shared/engine-request';
import type { JsonDocument } from './types';

/** One BSON type of a field, by the names `$type` takes, with the number of values that have it. */
export interface SampleType {
  readonly type: string;
  readonly count: number;
  /** Arrays: their elements, described as one field named `[]`. */
  readonly elements?: SampleField;
}

/** One field of the sample, or of the object values of a field, as `schema.analyze` summarizes it. */
export interface SampleField {
  readonly name: string;
  /** The values present, `null` included. */
  readonly count: number;
  /** The objects that could have it: the documents, for a field of the documents. */
  readonly of: number;
  /** The most frequent first; with the same count, the first seen first. */
  readonly types: readonly SampleType[];
  /** The fields of its object values. */
  readonly fields?: readonly SampleField[];
}

/** The summary of a sample: the number of documents analyzed and their fields. */
export interface SampleSummary {
  readonly analyzed: number;
  readonly fields: readonly SampleField[];
}

/** The types `$jsonSchema` names differently from `$type`. */
const aliases: Readonly<Record<string, string>> = { boolean: 'bool', integer: 'int', number: 'double' };

function bsonTypeOf(types: readonly SampleType[]): Json {
  const names = [...new Set(types.filter((type) => type.count > 0).map((type) => aliases[type.type] ?? type.type))];
  return names.length === 1 ? (names[0] ?? 'null') : names;
}

/** `properties` and `required` of the fields of objects: required are those present in every object. */
function objectParts(fields: readonly SampleField[]): JsonDocument {
  const required = fields.filter((field) => field.of > 0 && field.count >= field.of).map((field) => field.name);
  const properties = Object.fromEntries(fields.map((field) => [field.name, fieldSchema(field)]));
  return { ...(required.length === 0 ? {} : { required }), properties };
}

/** The schema of one field: its types, the fields of its objects, the elements of its arrays. */
function fieldSchema(field: SampleField): JsonDocument {
  const fields = field.fields ?? [];
  const objects = field.types.some((type) => type.type === 'object');
  const array = field.types.find((type) => type.type === 'array');
  const elements = array?.elements;
  return {
    bsonType: bsonTypeOf(field.types),
    ...(objects && fields.length > 0 ? objectParts(fields) : {}),
    ...(elements !== undefined && elements.count > 0 && elements.types.length > 0
      ? { items: fieldSchema(elements) }
      : {}),
  };
}

/**
 * Feature: manage.generate-json-schema — `{ bsonType: "object", required?, properties }` of a sample's summary. No
 * `additionalProperties`: fields not seen are allowed.
 */
export function jsonSchema(summary: SampleSummary): JsonDocument {
  const fields = summary.fields.map((field) => (field.of > 0 ? field : { ...field, of: summary.analyzed }));
  return { bsonType: 'object', ...objectParts(fields) };
}
