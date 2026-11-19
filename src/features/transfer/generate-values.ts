/**
 * Feature: transfer.generate-values
 *
 * Fake documents that look like those of a schema analysis: each field as often as it was seen, with the same mix of
 * BSON types, values drawn again from the frequent ones or from the ranges and histograms seen, and strings shaped
 * after the field's name and its examples. The documents are canonical Extended JSON, `_id` first; the same analysis,
 * seed and `now` give the same documents. Ported from Mongoster's `src/shared/generate.ts`.
 */
import type { Json } from '../../shared/engine-request';
import {
  canonicalOf,
  mostDecimals,
  poolOf,
  toNumber,
  type FieldSchema,
  type SchemaSummary,
  type TypeSchema,
} from './generate/analysis';
import { Draw, hex, pickWeighted, seededRandom, type Random } from './generate/draw';
import { lengthsOf, nameKey, Strings } from './generate/strings';
import { doubleText } from './values/canonical';
import { isPlainObject, type JsonDocument } from './types';

export { seededRandom, type Random };

/** What documents are generated with: the seed of the random source, the time, the first integer `_id`. */
export interface GenerateOptions {
  /** The seed's text: the one typed, or one the runner drew. */
  readonly seed: string;
  /** The time of new `ObjectId`s and timestamps, in milliseconds. */
  readonly now: number;
  /** The first integer `_id`, counting up: the destination's largest plus 1; the largest analyzed plus 1 without. */
  readonly nextId?: number;
}

const day = 86_400_000;
const smallestInt32 = -2147483648;
const largestInt32 = 2147483647;
/** Numbers and dates with more distinct values follow their histogram. */
const numberPool = 50;
const numeric: ReadonlySet<string> = new Set(['int', 'long', 'double', 'decimal']);

/** Generates documents one at a time, so that any number can be inserted batch by batch. */
export class DocumentGenerator {
  private readonly draw: Draw;
  private readonly strings: Strings;
  private readonly plans = new Map<TypeSchema, () => Json>();
  private objectIdCounter: number;
  private timestampCounter = 0;
  private nextId: number | undefined;
  /** The `_id`s generated that are neither `ObjectId`s nor counted, so that none repeats. */
  private readonly ids = new Set<string>();

  constructor(
    private readonly schema: SchemaSummary,
    private readonly options: GenerateOptions,
  ) {
    this.draw = new Draw(seededRandom(options.seed));
    this.strings = new Strings(this.draw, options.now);
    this.nextId = options.nextId;
    this.objectIdCounter = this.draw.below(0x1000000);
  }

  /** The next document. */
  next(): JsonDocument {
    const id = this.schema.fields.find((field) => field.name === '_id');
    const _id = id === undefined ? { $oid: this.objectId(this.options.now / 1000) } : this.id(id);
    return { _id, ...this.object(this.schema.fields.filter((field) => field !== id)) };
  }

  private object(fields: readonly FieldSchema[]): JsonDocument {
    const document: Record<string, Json> = {};
    for (const field of fields) {
      if (field.of > 0 && this.draw.random() < field.count / field.of) {
        Object.defineProperty(document, field.name, {
          value: this.value(this.pickType(field), field, field.name),
          enumerable: true,
        });
      }
    }
    return document;
  }

  private pickType(field: FieldSchema): TypeSchema {
    const [only] = field.types;
    return field.types.length === 1 && only !== undefined
      ? only
      : pickWeighted(this.draw.random, field.types, (type) => type.count);
  }

  private value(type: TypeSchema, field: FieldSchema, name: string): Json {
    if (type.type === 'object') {
      return this.object(field.fields ?? []);
    }
    if (type.type === 'array') {
      const elements = type.elements;
      const length = this.arrayLength(type);
      return elements === undefined
        ? []
        : Array.from({ length }, () => this.value(this.pickType(elements), elements, name));
    }
    if (type.type === 'null') {
      return null;
    }
    const plan = this.plans.get(type) ?? this.plan(type, name);
    this.plans.set(type, plan);
    return plan();
  }

  private arrayLength(type: TypeSchema): number {
    const lengths = type.lengths ?? { min: 0, max: 0, avg: 0 };
    const counts = type.details?.lengths ?? [];
    if (counts.length > 0) {
      const covered = counts.reduce((sum, each) => sum + each.count, 0);
      const drawn = this.draw.random() * Math.max(type.count, covered);
      if (drawn < covered) {
        return Number(
          pickWeighted(
            () => drawn / covered,
            counts,
            (each) => each.count,
          ).value,
        );
      }
    }
    return lengths.min + this.draw.below(lengths.max - lengths.min + 1);
  }

  /** An `_id`: a new `ObjectId`, a number counting up, or a value like the field's that does not repeat. */
  private id(field: FieldSchema): Json {
    const type = this.pickType(field);
    if (type.type === 'objectId') {
      return { $oid: this.objectId(this.options.now / 1000) };
    }
    if (type.type === 'int' || type.type === 'long') {
      const next = this.nextId ?? Math.floor(toNumber(type.max) ?? 0) + 1;
      this.nextId = next + 1;
      return type.type === 'int' && next <= largestInt32 ? { $numberInt: String(next) } : { $numberLong: String(next) };
    }
    let value: Json = null;
    for (let tries = 0; tries < 20; tries += 1) {
      value = this.value(type, field, '_id');
      const key = JSON.stringify(value);
      if (!this.ids.has(key)) {
        this.ids.add(key);
        break;
      }
    }
    return value;
  }

  /** How the values of one type of a field are made. */
  private plan(type: TypeSchema, name: string): () => Json {
    const pool = poolOf(type);
    const few = pool !== undefined && (pool.length <= numberPool || !(numeric.has(type.type) || type.type === 'date'));
    if (
      pool !== undefined &&
      few &&
      name !== '_id' &&
      (type.type === 'bool' || pool.length <= 1 || type.count >= 2 * pool.length)
    ) {
      const values = pool.map((each) => canonicalOf(each.value, type.type));
      return () => pickWeighted(this.draw.random, values, (_value, index) => pool[index]?.count ?? 0);
    }
    const plans: Partial<Record<TypeSchema['type'], () => () => Json>> = {
      date: () => this.datePlan(type),
      string: () => this.stringPlan(type, name),
      objectId: () => this.objectIdPlan(type),
      bool: () => () => this.draw.random() < 0.5,
    };
    if (numeric.has(type.type)) {
      return this.numberPlan(type);
    }
    return (plans[type.type] ?? (() => this.otherPlan(type)))();
  }

  /** A number in the range seen, following the histogram; integers stay integers. */
  private drawNumber(type: TypeSchema, integer: boolean): number {
    const min = toNumber(type.min) ?? 0;
    const max = toNumber(type.max) ?? min;
    const top = integer ? max + 1 : max;
    let low = min;
    let high = top;
    if (type.bins !== undefined && type.bins.length > 0) {
      const bin = pickWeighted(this.draw.random, type.bins, (each) => each.count);
      low = Math.max(min, toNumber(bin.from) ?? min);
      high = Math.max(low, Math.min(top, toNumber(bin.to) ?? top));
    }
    const drawn = low + this.draw.random() * (high - low);
    return integer ? Math.min(max, Math.floor(drawn)) : Math.min(max, drawn);
  }

  private numberPlan(type: TypeSchema): () => Json {
    const decimals = type.details?.decimals;
    if (type.type === 'int') {
      return () => ({
        $numberInt: String(Math.max(smallestInt32, Math.min(largestInt32, this.drawNumber(type, true)))),
      });
    }
    if (type.type === 'long') {
      return () => ({ $numberLong: String(this.drawNumber(type, true)) });
    }
    if (type.type === 'decimal') {
      return () => ({ $numberDecimal: this.drawNumber(type, false).toFixed(Math.min(decimals ?? 2, 20)) });
    }
    return () => {
      const drawn = this.drawNumber(type, false);
      const value = decimals !== undefined && decimals < mostDecimals ? Number(drawn.toFixed(decimals)) : drawn;
      return { $numberDouble: doubleText(value) };
    };
  }

  private datePlan(type: TypeSchema): () => Json {
    const dateOnly = type.details?.dateOnly === true;
    return () => {
      const milliseconds = Math.round(this.drawNumber(type, false));
      return { $date: { $numberLong: String(dateOnly ? Math.floor(milliseconds / day) * day : milliseconds) } };
    };
  }

  /** New `ObjectId`s created between the earliest and the latest time of those seen. */
  private objectIdPlan(type: TypeSchema): () => Json {
    const times = (poolOf(type) ?? type.top ?? [])
      .map((each) => (isPlainObject(each.value) ? each.value['$oid'] : undefined))
      .filter((oid): oid is string => typeof oid === 'string')
      .map((oid) => parseInt(oid.slice(0, 8), 16))
      .filter((seconds) => !Number.isNaN(seconds));
    const from = times.length > 0 ? Math.min(...times) : this.options.now / 1000;
    const to = times.length > 0 ? Math.max(...times) : this.options.now / 1000;
    return () => ({ $oid: this.objectId(from + this.draw.random() * (to - from)) });
  }

  private objectId(seconds: number): string {
    this.objectIdCounter = (this.objectIdCounter + 1) % 0x1000000;
    return hex(Math.floor(seconds), 8) + this.draw.hexChars(10) + hex(this.objectIdCounter, 6);
  }

  private otherPlan(type: TypeSchema): () => Json {
    const example = type.details?.example;
    const binary = isPlainObject(example) ? example['$binary'] : undefined;
    if (type.type === 'binData' && isPlainObject(binary)) {
      return this.binaryPlan(binary);
    }
    if (type.type === 'timestamp') {
      return () => {
        this.timestampCounter += 1;
        return { $timestamp: { t: Math.floor(this.options.now / 1000), i: this.timestampCounter } };
      };
    }
    return () => (example ?? null) as Json;
  }

  /** Random bytes of the example's size and subtype; 16 bytes of subtype 4 are a version-4 UUID. */
  private binaryPlan(binary: Readonly<Record<string, unknown>>): () => Json {
    const subType = typeof binary['subType'] === 'string' ? binary['subType'] : '00';
    const base64 = typeof binary['base64'] === 'string' ? binary['base64'] : '';
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const size = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
    return () => {
      const bytes = Array.from({ length: size }, () => this.draw.below(256));
      if (subType === '04' && size === 16) {
        bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
        bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
      }
      return { $binary: { base64: btoa(bytes.map((byte) => String.fromCharCode(byte)).join('')), subType } };
    };
  }

  private stringPlan(type: TypeSchema, name: string): () => Json {
    const seen = (poolOf(type) ?? type.top ?? []).filter((each) => typeof each.value === 'string');
    const examples = seen.map((each) => String(each.value)).filter((example) => example !== '');
    const empty = seen.find((each) => each.value === '')?.count ?? 0;
    const length = this.strings.lengthPlan(examples, type.details?.chars ?? lengthsOf(examples));
    const make = this.strings.kind(nameKey(name), examples, length);
    const emptyShare = type.count > 0 ? empty / type.count : 0;
    return () => (emptyShare > 0 && this.draw.random() < emptyShare ? '' : make());
  }
}

/** A generator of documents like those of the analysis. */
export function documentGenerator(schema: SchemaSummary, options: GenerateOptions): DocumentGenerator {
  return new DocumentGenerator(schema, options);
}

/** Feature: transfer.generate-values — the next document of a generator. */
export function nextDocument(generator: DocumentGenerator): JsonDocument {
  return generator.next();
}

/** `count` documents at once. */
export function generateDocuments(schema: SchemaSummary, count: number, options: GenerateOptions): JsonDocument[] {
  const generator = documentGenerator(schema, options);
  return Array.from({ length: count }, () => nextDocument(generator));
}

/**
 * `count` new `ObjectId`s, all different, with the time `now` and a counter, their other bytes drawn from `salt`: an
 * import gives its documents without `_id` one, so that the undo can delete them.
 */
export function newObjectIds(count: number, now: number, salt: string): Json[] {
  const draw = new Draw(seededRandom(`${String(now)}\n${salt}`));
  const seconds = hex(Math.floor(now / 1000), 8);
  const middle = draw.hexChars(10);
  const start = draw.below(0x1000000);
  return Array.from({ length: count }, (_, index) => ({
    $oid: `${seconds}${middle}${hex((start + index) % 0x1000000, 6)}`,
  }));
}
