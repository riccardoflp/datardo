/**
 * The counts an analysis keeps while documents are added (`schema.analyze`): for each field its types, for each type
 * its distinct values, its numbers, its lengths and its elements. Each tally belongs to one analysis and is changed
 * only by it; nothing here is shared between analyses.
 */
import type { Json } from '../../../shared/engine-request';
import { bsonTypeOf, isJsonDocument, numberOfValue, valueTypes, type BsonType, type JsonDocument } from '../types';

/** Distinct values counted per type; those first seen after are not counted, and the type has more. */
export const mostDistinct = 1000;

/** Different names analyzed in one object, or in the documents taken together. */
export const mostFields = 500;

/** The most digits after the decimal point that are counted; an exponent counts as this many. */
export const mostDecimals = 15;

const day = 86_400_000;

/** A value seen and how many times. */
export interface Seen {
  readonly value: Json;
  count: number;
}

/** What is counted of one type of one field. */
export class TypeTally {
  count = 0;
  readonly values = new Map<string, Seen>();
  more = false;
  /** The finite numbers, dates as milliseconds, for the histogram. */
  readonly numbers: number[] = [];
  smallest?: { readonly number: number; readonly value: Json };
  largest?: { readonly number: number; readonly value: Json };
  readonly lengths: number[] = [];
  elements?: FieldTally;
  characters?: { smallest: number; largest: number; sum: number };
  decimals = 0;
  midnight = true;
  example?: Json;

  constructor(readonly type: BsonType) {}

  /** Counts a value of a type whose distinct values are counted. */
  addValue(value: Json): void {
    const key = JSON.stringify(value);
    const seen = this.values.get(key);
    if (seen !== undefined) {
      seen.count += 1;
    } else if (this.values.size < mostDistinct) {
      this.values.set(key, { value, count: 1 });
    } else {
      this.more = true;
    }
    const number = numberOfValue(value, this.type);
    if (number !== undefined && !Number.isNaN(number)) {
      this.addNumber(number, value);
    }
    if (typeof value === 'string') {
      this.addString(value);
    }
  }

  private addNumber(number: number, value: Json): void {
    if (Number.isFinite(number)) {
      this.numbers.push(number);
    }
    if (this.smallest === undefined || number < this.smallest.number) {
      this.smallest = { number, value };
    }
    if (this.largest === undefined || number > this.largest.number) {
      this.largest = { number, value };
    }
    if (this.type === 'date' && number % day !== 0) {
      this.midnight = false;
    }
    if (this.type === 'double' || this.type === 'decimal') {
      this.decimals = Math.max(this.decimals, decimalsOf(value, number));
    }
  }

  private addString(value: string): void {
    const length = Array.from(value).length;
    const characters = this.characters ?? { smallest: length, largest: length, sum: 0 };
    characters.smallest = Math.min(characters.smallest, length);
    characters.largest = Math.max(characters.largest, length);
    characters.sum += length;
    this.characters = characters;
  }
}

/** The digits after the decimal point of a `double` or a `decimal`; an exponent or a long fraction counts as 15. */
function decimalsOf(value: Json, number: number): number {
  const inner = isJsonDocument(value) ? value['$numberDecimal'] : undefined;
  const written = typeof inner === 'string' ? inner : String(number);
  if (/e/iu.test(written)) {
    return mostDecimals;
  }
  const dot = written.indexOf('.');
  return dot < 0 ? 0 : Math.min(mostDecimals, written.length - dot - 1);
}

/** What is counted of one field, and of the fields of its object values. */
export class FieldTally {
  count = 0;
  readonly types = new Map<BsonType, TypeTally>();
  /** The object values seen: what the presence of the nested fields is counted of. */
  objects = 0;
  readonly fields = new Map<string, FieldTally>();
  moreFields = false;

  /** Counts one value of the field. */
  add(value: Json): void {
    this.count += 1;
    const type = bsonTypeOf(value);
    const tally = this.types.get(type) ?? new TypeTally(type);
    this.types.set(type, tally);
    tally.count += 1;
    if (type === 'object') {
      this.addObject(value as JsonDocument);
    } else if (type === 'array') {
      const items = value as readonly Json[];
      tally.lengths.push(items.length);
      const elements = tally.elements ?? new FieldTally();
      tally.elements = elements;
      for (const item of items) {
        elements.add(item);
      }
    } else if (valueTypes.has(type)) {
      tally.addValue(value);
    } else if (tally.example === undefined && type !== 'null') {
      tally.example = value;
    }
  }

  /** Counts an object: each of its fields, up to the names this tally may hold. */
  addObject(object: JsonDocument): void {
    this.objects += 1;
    for (const [name, value] of Object.entries(object)) {
      let field = this.fields.get(name);
      if (field === undefined) {
        if (this.fields.size >= mostFields) {
          this.moreFields = true;
          continue;
        }
        field = new FieldTally();
        this.fields.set(name, field);
      }
      field.add(value);
    }
  }
}
