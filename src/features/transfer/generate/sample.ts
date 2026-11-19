/**
 * A stand-in for `schema.analyze` (milestone M23) with details, so that **Generate test documents…** started from the
 * tree has an analysis of its sample: fields in the order they first appear, their presence, their types by count,
 * every value when they are few, the range of numbers and dates, the lengths of strings and arrays. It has no
 * histogram (the range is used whole). When `schema/analyze.ts › schemaSummary(documents, { details: true })` is in
 * the code, `transfer.generate` calls it instead and this module goes.
 */
import type { Json } from '../../../shared/engine-request';
import { isPlainObject, isWrapper, type JsonDocument } from '../types';
import {
  toNumber,
  type BsonType,
  type FieldSchema,
  type SchemaSummary,
  type TypeSchema,
  type ValueCount,
} from './analysis';

/** The distinct values kept of a type, beyond which only the range is (Datardo's choice for the stand-in). */
const mostValues = 50;

const wrapperTypes: Readonly<Record<string, BsonType>> = {
  $oid: 'objectId',
  $date: 'date',
  $numberInt: 'int',
  $numberLong: 'long',
  $numberDouble: 'double',
  $numberDecimal: 'decimal',
  $binary: 'binData',
  $regularExpression: 'regex',
  $timestamp: 'timestamp',
  $code: 'javascript',
  $symbol: 'symbol',
  $minKey: 'minKey',
  $maxKey: 'maxKey',
  $undefined: 'undefined',
  $dbPointer: 'dbPointer',
};

/** The BSON type of a value of canonical Extended JSON. */
export function bsonType(value: Json): BsonType {
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
  return isWrapper(value) ? (wrapperTypes[Object.keys(value)[0] ?? ''] ?? 'object') : 'object';
}

interface TypeTally {
  count: number;
  readonly values: Map<string, { value: Json; count: number }>;
  min?: number;
  max?: number;
  minValue?: Json;
  maxValue?: Json;
  decimals: number;
  dateOnly: boolean;
  chars?: { min: number; max: number; sum: number };
  lengths: Map<number, number>;
  elements?: FieldTally;
  fields?: Map<string, FieldTally>;
  objects: number;
  example?: Json;
}

interface FieldTally {
  count: number;
  readonly types: Map<BsonType, TypeTally>;
}

function decimalsOf(value: Json): number {
  const inner: unknown = isPlainObject(value) ? Object.values(value)[0] : value;
  const text = typeof inner === 'string' || typeof inner === 'number' ? String(inner) : '';
  return /\.(\d+)/u.exec(text)?.[1]?.length ?? 0;
}

function tallyScalar(tally: TypeTally, type: BsonType, value: Json): void {
  const key = JSON.stringify(value);
  const known = tally.values.get(key);
  if (known !== undefined || tally.values.size <= mostValues) {
    tally.values.set(key, { value, count: (known?.count ?? 0) + 1 });
  }
  tally.example ??= value;
  const number = type === 'string' ? undefined : toNumber(value);
  if (number !== undefined && !Number.isNaN(number)) {
    if (tally.min === undefined || number < tally.min) {
      tally.min = number;
      tally.minValue = value;
    }
    if (tally.max === undefined || number > tally.max) {
      tally.max = number;
      tally.maxValue = value;
    }
    tally.decimals = Math.max(tally.decimals, decimalsOf(value));
    tally.dateOnly &&= type !== 'date' || number % 86_400_000 === 0;
  }
  if (typeof value === 'string') {
    const chars = tally.chars ?? { min: value.length, max: value.length, sum: 0 };
    tally.chars = {
      min: Math.min(chars.min, value.length),
      max: Math.max(chars.max, value.length),
      sum: chars.sum + value.length,
    };
  }
}

function tallyValue(field: FieldTally, value: Json): void {
  const type = bsonType(value);
  const fresh: TypeTally = { count: 0, values: new Map(), decimals: 0, dateOnly: true, lengths: new Map(), objects: 0 };
  const tally = field.types.get(type) ?? fresh;
  field.types.set(type, tally);
  tally.count += 1;
  if (type === 'object') {
    tally.fields ??= new Map();
    tally.objects += 1;
    tallyDocument(tally.fields, value as JsonDocument);
  } else if (Array.isArray(value)) {
    tally.lengths.set(value.length, (tally.lengths.get(value.length) ?? 0) + 1);
    tally.elements ??= { count: 0, types: new Map() };
    for (const element of value as readonly Json[]) {
      tally.elements.count += 1;
      tallyValue(tally.elements, element);
    }
  } else {
    tallyScalar(tally, type, value);
  }
}

function tallyDocument(fields: Map<string, FieldTally>, document: JsonDocument): void {
  for (const [name, value] of Object.entries(document)) {
    const field = fields.get(name) ?? { count: 0, types: new Map() };
    fields.set(name, field);
    field.count += 1;
    tallyValue(field, value);
  }
}

function typeSchema(type: BsonType, tally: TypeTally, name: string): TypeSchema {
  const values: ValueCount[] = [...tally.values.values()].map((each) => ({ value: each.value, count: each.count }));
  const lengths = [...tally.lengths.entries()].map(([value, count]) => ({ value, count }));
  const counted = [...tally.lengths.entries()].reduce((sum, [length, count]) => sum + length * count, 0);
  const all = values.length <= mostValues;
  return {
    type,
    count: tally.count,
    ...(tally.minValue === undefined ? {} : { min: tally.minValue, max: tally.maxValue }),
    ...(lengths.length === 0
      ? {}
      : {
          lengths: {
            min: Math.min(...tally.lengths.keys()),
            max: Math.max(...tally.lengths.keys()),
            avg: counted / tally.count,
          },
        }),
    ...(tally.elements === undefined ? {} : { elements: fieldSchema(`${name}[]`, tally.elements, counted) }),
    details: {
      ...(all ? { values } : {}),
      ...(tally.chars === undefined
        ? {}
        : { chars: { min: tally.chars.min, max: tally.chars.max, avg: tally.chars.sum / tally.count } }),
      decimals: tally.decimals,
      dateOnly: type === 'date' && tally.dateOnly,
      ...(lengths.length === 0 ? {} : { lengths }),
      ...(tally.example === undefined ? {} : { example: tally.example }),
    },
  };
}

function fieldSchema(name: string, tally: FieldTally, of: number): FieldSchema {
  const types = [...tally.types.entries()].sort((one, other) => other[1].count - one[1].count);
  const objects = tally.types.get('object');
  return {
    name,
    count: tally.count,
    of,
    types: types.map(([type, typeTally]) => typeSchema(type, typeTally, name)),
    ...(objects?.fields === undefined ? {} : { fields: fieldsOf(objects.fields, objects.objects) }),
  };
}

function fieldsOf(fields: Map<string, FieldTally>, of: number): FieldSchema[] {
  return [...fields.entries()].map(([name, tally]) => fieldSchema(name, tally, of));
}

/** The analysis of documents of canonical Extended JSON, with details. */
export function analyzeSample(documents: readonly JsonDocument[]): SchemaSummary {
  const fields = new Map<string, FieldTally>();
  for (const document of documents) {
    tallyDocument(fields, document);
  }
  return { sampled: documents.length, fields: fieldsOf(fields, documents.length) };
}
