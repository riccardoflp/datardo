/**
 * Feature: query.field-hints
 *
 * Reads a random sample of 500 documents of a collection to know which fields its documents have, of which types,
 * and which values come up most, for the suggestions and the builder. Types are kept apart: an `Int32` is not a
 * `Double`.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { bsonType, isJsonObject, isSubdocument, type BsonType, type JsonObject } from './mongosh/ejson';

/** How many documents are sampled. */
export const sampleSize = 500;

/** How long the sample may take, in ms. */
export const hintsTimeLimitMs = 20_000;

/** How many frequent values are kept for a field. */
export const mostValues = 10;

/** A value of a field and how many times the sample has it. */
export interface ValueCount {
  readonly value: Json;
  readonly count: number;
}

/** A field seen in the sample. */
export interface FieldHint {
  /** The dotted path; the fields of the elements of an array are under the array's path: `items.sku`. */
  readonly path: string;
  /** Its types, the most frequent first. */
  readonly types: readonly BsonType[];
  /** The share of the sampled documents (or of the parent objects) that have it, from 0 to 1. */
  readonly ratio: number;
  /** Its most frequent values, the most frequent first. */
  readonly values: readonly ValueCount[];
  /** For a field that only holds arrays of numbers: the shortest and the longest length seen. */
  readonly vector?: { readonly min: number; readonly max: number };
}

/** `db.orders.aggregate([{ $sample: { size: 500 } }], { maxTimeMS: 20000 })`. */
export function sampleRequest(database: string, collection: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    collection,
    method: 'aggregate',
    arguments: [[{ $sample: { size: sampleSize } }], { maxTimeMS: hintsTimeLimitMs }],
    limit: sampleSize,
    timeLimitMs: hintsTimeLimitMs,
  };
}

function textOf(value: Json | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** Feature: query.field-hints — the sample of the collection (or of the view) of `args`. */
export function request(context: Context, args: Json): ReadRequest {
  const fields = isJsonObject(args) ? args : {};
  const target = context.target.kind === 'collection' ? context.target : undefined;
  const connection = textOf(fields['connection']) || (target?.connection ?? '');
  const database = textOf(fields['database']) || (target?.database ?? '');
  const collection = textOf(fields['collection']) || (target?.collection ?? '');
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(connection), request: sampleRequest(database, collection) }],
    // A sample that fails gives no fields and shows no error: the suggestions are then operators only.
    failedRequests: 'are-replies',
  };
}

interface Tally {
  present: number;
  readonly parent: string;
  readonly types: Map<BsonType, number>;
  readonly values: Map<string, ValueCount>;
  vector: { min: number; max: number } | undefined;
  /** Whether every array seen here held numbers only. */
  numbersOnly: boolean;
}

const numeric: readonly BsonType[] = ['int', 'long', 'double', 'decimal'];

class Sample {
  readonly tallies = new Map<string, Tally>();
  readonly parents = new Map<string, number>();

  tally(path: string, parent: string): Tally {
    let found = this.tallies.get(path);
    if (found === undefined) {
      found = { present: 0, parent, types: new Map(), values: new Map(), vector: undefined, numbersOnly: true };
      this.tallies.set(path, found);
    }
    return found;
  }

  object(document: JsonObject, path: string): void {
    this.parents.set(path, (this.parents.get(path) ?? 0) + 1);
    for (const [key, value] of Object.entries(document)) {
      const child = path === '' ? key : `${path}.${key}`;
      const tally = this.tally(child, path);
      tally.present += 1;
      this.value(tally, child, value);
    }
  }

  value(tally: Tally, path: string, value: Json): void {
    const type = bsonType(value);
    tally.types.set(type, (tally.types.get(type) ?? 0) + 1);
    if (isSubdocument(value)) {
      this.object(value, path);
    } else if (Array.isArray(value)) {
      this.array(tally, path, value as readonly Json[]);
    } else {
      count(tally, value);
    }
  }

  array(tally: Tally, path: string, elements: readonly Json[]): void {
    const numbers = elements.length > 0 && elements.every((each) => numeric.includes(bsonType(each)));
    tally.numbersOnly &&= numbers;
    if (numbers) {
      tally.vector = {
        min: Math.min(tally.vector?.min ?? Infinity, elements.length),
        max: Math.max(tally.vector?.max ?? 0, elements.length),
      };
    }
    for (const element of elements) {
      if (isSubdocument(element)) {
        this.object(element, path);
      } else if (!Array.isArray(element)) {
        count(tally, element);
      }
    }
  }
}

function count(tally: Tally, value: Json): void {
  const key = JSON.stringify(value);
  const found = tally.values.get(key);
  tally.values.set(key, { value, count: (found?.count ?? 0) + 1 });
}

function hintOf(path: string, tally: Tally, parents: ReadonlyMap<string, number>): FieldHint {
  const of = parents.get(tally.parent) ?? 0;
  const values = [...tally.values.values()].sort((a, b) => b.count - a.count).slice(0, mostValues);
  const types = [...tally.types.entries()].sort((a, b) => b[1] - a[1]).map(([type]) => type);
  const vector = tally.numbersOnly && types.every((type) => type === 'array') ? tally.vector : undefined;
  return {
    path,
    types,
    ratio: of === 0 ? 0 : Math.min(1, tally.present / of),
    values,
    ...(vector === undefined ? {} : { vector }),
  };
}

/** The hints of sampled documents: one per field path, in the order they were first seen. */
export function hintsOfDocuments(documents: readonly Json[]): readonly FieldHint[] {
  const sample = new Sample();
  for (const document of documents) {
    if (isSubdocument(document)) {
      sample.object(document, '');
    }
  }
  return [...sample.tallies.entries()].map(([path, tally]) => hintOf(path, tally, sample.parents));
}

/** Feature: query.field-hints — the fields of the sample, with their types, share and most frequent values. */
export function parse(replies: readonly unknown[]): readonly FieldHint[] {
  const [reply] = replies;
  return Array.isArray(reply) ? hintsOfDocuments(reply as readonly Json[]) : [];
}
