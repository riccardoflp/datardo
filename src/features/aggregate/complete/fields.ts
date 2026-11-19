/**
 * The fields suggested in a stage, from documents: those of a sample of the collection, or the output the table shows.
 * Each dotted path once, the elements of an array under the path of the array, with its BSON types, the share of the
 * documents (or of the objects holding it) that have it, and its most frequent values. Ported from Mongoster's
 * `fieldHints` (`src/shared/complete.ts`), read from the documents rather than from a schema summary.
 */
import type { Json } from '../../../shared/engine-request';

/** A value of a field and the number of times it was seen. */
export interface ValueCount {
  readonly value: Json;
  readonly count: number;
}

/** A field seen in the documents. */
export interface FieldHint {
  readonly path: string;
  /** Its BSON types, `string`, `int`, `objectId`…, in the order they were seen. */
  readonly types: readonly string[];
  /** The share of the documents (or of the objects holding it) that have the field, 0 to 1. */
  readonly ratio: number;
  /** Its most frequent values, ten at most, the most frequent first. */
  readonly values: readonly ValueCount[];
  /** Arrays of numbers only: their lengths, so that the `path` of `$vectorSearch` suggests it first. */
  readonly vector?: { readonly min: number; readonly max: number };
}

/** A search index of the collection, suggested in the `index` of `$search` and `$vectorSearch`. */
export interface SearchIndexHint {
  readonly name: string;
  /** `search` or `vectorSearch`. */
  readonly type: string;
  readonly status?: string;
}

const mostValues = 10;
const numberTypes = ['int', 'long', 'double', 'decimal'];

const wrapperTypes: Readonly<Record<string, string>> = {
  $oid: 'objectId',
  $date: 'date',
  $numberInt: 'int',
  $numberLong: 'long',
  $numberDouble: 'double',
  $numberDecimal: 'decimal',
  $binary: 'binData',
  $regularExpression: 'regex',
  $timestamp: 'timestamp',
  $minKey: 'minKey',
  $maxKey: 'maxKey',
  $undefined: 'undefined',
  $code: 'javascript',
  $symbol: 'symbol',
  $dbPointer: 'dbPointer',
};

/** The BSON type of a value in canonical Extended JSON. */
export function bsonType(value: Json): string {
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
  const [first] = keys;
  const typed = first === undefined || !Object.hasOwn(wrapperTypes, first) ? undefined : wrapperTypes[first];
  return typed !== undefined && (keys.length === 1 || first === '$code') ? typed : 'object';
}

interface Tally {
  readonly path: string;
  readonly parent: string;
  readonly types: string[];
  count: number;
  readonly values: Map<string, { value: Json; count: number }>;
  vector?: { min: number; max: number };
}

class Tallies {
  readonly byPath = new Map<string, Tally>();
  /** How many objects were seen at each prefix: `''` the documents, `items.` the elements of `items`… */
  readonly objects = new Map<string, number>();

  tally(path: string, parent: string): Tally {
    const found = this.byPath.get(path);
    if (found !== undefined) {
      return found;
    }
    const made: Tally = { path, parent, types: [], count: 0, values: new Map() };
    this.byPath.set(path, made);
    return made;
  }

  object(value: Readonly<Record<string, Json>>, prefix: string): void {
    this.objects.set(prefix, (this.objects.get(prefix) ?? 0) + 1);
    for (const [key, inner] of Object.entries(value)) {
      const tally = this.tally(`${prefix}${key}`, prefix);
      tally.count += 1;
      this.value(tally, inner);
    }
  }

  value(tally: Tally, value: Json): void {
    const type = bsonType(value);
    if (!tally.types.includes(type)) {
      tally.types.push(type);
    }
    if (Array.isArray(value)) {
      this.array(tally, value);
    } else if (type === 'object') {
      this.object(value as Readonly<Record<string, Json>>, `${tally.path}.`);
    } else {
      const key = JSON.stringify(value);
      const seen = tally.values.get(key);
      tally.values.set(key, { value, count: (seen?.count ?? 0) + 1 });
    }
  }

  array(tally: Tally, elements: readonly Json[]): void {
    if (elements.length > 0 && elements.every((element) => numberTypes.includes(bsonType(element)))) {
      const min = Math.min(tally.vector?.min ?? Infinity, elements.length);
      tally.vector = { min, max: Math.max(tally.vector?.max ?? 0, elements.length) };
    }
    for (const element of elements) {
      this.value(tally, element);
    }
  }

  hint(tally: Tally): FieldHint {
    const of = this.objects.get(tally.parent) ?? 0;
    const values = [...tally.values.values()].sort((a, b) => b.count - a.count).slice(0, mostValues);
    const hint = { path: tally.path, types: tally.types, ratio: of === 0 ? 0 : Math.min(1, tally.count / of), values };
    return tally.vector === undefined ? hint : { ...hint, vector: tally.vector };
  }
}

/** The fields of documents in canonical Extended JSON, in the order they were first seen. */
export function fieldsOfDocuments(documents: readonly Json[]): readonly FieldHint[] {
  const tallies = new Tallies();
  for (const document of documents) {
    if (bsonType(document) === 'object') {
      tallies.object(document as Readonly<Record<string, Json>>, '');
    }
  }
  return [...tallies.byPath.values()].map((tally) => tallies.hint(tally));
}
