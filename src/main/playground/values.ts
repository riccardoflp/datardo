/**
 * The values of a script in the process of a run (`playground.runtime`): the BSON types a script has, and how a value
 * of the script becomes canonical Extended JSON and back, so that a value read keeps its BSON type through the script
 * and back (R5.5). A value of a type JavaScript lacks (an `ObjectId`, a `Long`, a `Double` that is a whole number) is a
 * {@link BsonValue}, which holds its canonical Extended JSON; numbers that JavaScript holds as they are become numbers.
 *
 * The script runs in a context of its own (`node:vm`), whose `Date`, `RegExp` and `Array` are not those of this module:
 * values are told apart by what they are, never with `instanceof` of this side.
 */
import { randomBytes } from 'node:crypto';
import type { Json } from '../../shared/engine-request';
import { dateValue, doubleText, helperValue } from '../../features/aggregate/mongosh/helpers';
import { isTypedValue } from '../../features/aggregate/mongosh/format';

type JsonObject = { readonly [key: string]: Json };

/** A value of Extended JSON as an object, when it is one. */
function jsonObject(value: Json | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

/** A value of a BSON type that JavaScript lacks, as its canonical Extended JSON: `{ $oid: "Ã¢â‚¬Â¦" }`. */
export class BsonValue {
  /** Made from its canonical Extended JSON. */
  constructor(readonly json: JsonObject) {}

  /** Its type, as the first key of its Extended JSON says it: `$oid`, `$numberLong`. */
  get wrapper(): string {
    return Object.keys(this.json)[0] ?? '';
  }

  /** A number for the numeric types, so that `doc.total + 1` works; the value itself for the others. */
  valueOf(): unknown {
    const inner = this.json[this.wrapper];
    switch (this.wrapper) {
      case '$numberLong':
      case '$numberDouble':
      case '$numberInt':
      case '$numberDecimal':
        return Number(inner);
      default:
        return this;
    }
  }

  /** The hexadecimal digits of an `ObjectId`, the digits of a number, the text of the others. */
  toString(): string {
    const inner = this.json[this.wrapper];
    return typeof inner === 'string' ? inner : JSON.stringify(this.json);
  }

  /** The hexadecimal digits of an `ObjectId`. */
  toHexString(): string {
    return this.toString();
  }

  /** The hexadecimal digits of an `ObjectId`, as mongosh's `str`. */
  get str(): string {
    return this.toString();
  }

  /** The time of an `ObjectId`. */
  getTimestamp(): Date {
    return new Date(parseInt(this.toString().slice(0, 8), 16) * 1000);
  }

  /** Whether another value is the same value of the same type. */
  equals(other: unknown): boolean {
    return other instanceof BsonValue && JSON.stringify(other.json) === JSON.stringify(this.json);
  }

  /** `t` of a `Timestamp`. */
  get t(): number | undefined {
    return this.timestampPart('t');
  }

  /** `i` of a `Timestamp`. */
  get i(): number | undefined {
    return this.timestampPart('i');
  }

  /** As JSON.stringify writes it: its canonical Extended JSON. */
  toJSON(): JsonObject {
    return this.json;
  }

  private timestampPart(part: 't' | 'i'): number | undefined {
    const inner = this.json['$timestamp'];
    const value = jsonObject(inner)?.[part];
    return typeof value === 'number' ? value : undefined;
  }
}

/** What turns a value of the script into Extended JSON cannot: a function, a cycle, an object of the runtime. */
export class NotBson extends Error {
  /** Made with what was met. */
  constructor(message: string) {
    super(message);
    this.name = 'TypeError';
  }
}

/** Whether a value is a date of any context. */
function isDate(value: object): value is Date {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** Whether a value is a regular expression of any context. */
function isRegExp(value: object): value is RegExp {
  return Object.prototype.toString.call(value) === '[object RegExp]';
}

function numberJson(value: number): Json {
  const whole = Number.isInteger(value) && !Object.is(value, -0) && value >= -2147483648 && value <= 2147483647;
  return whole ? { $numberInt: String(value) } : { $numberDouble: doubleText(value) };
}

function regExpJson(value: RegExp): Json {
  return { $regularExpression: { pattern: value.source, options: value.flags.split('').sort().join('') } };
}

/** Says of an object of the runtime (`db`, a cursor) that it is not a value: a name for the message, or none. */
export type RuntimeName = (value: object) => string | undefined;

function objectJson(value: object, seen: Set<object>, runtimeName: RuntimeName): Json {
  if (value instanceof BsonValue) {
    return value.json;
  }
  if (isDate(value)) {
    return dateValue(value.getTime());
  }
  if (isRegExp(value)) {
    return regExpJson(value);
  }
  const name = runtimeName(value);
  if (name !== undefined) {
    throw new NotBson(`${name} is not a value that can be sent to the database`);
  }
  if (seen.has(value)) {
    throw new NotBson('Converting circular structure to BSON');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return (value as readonly unknown[]).map((each) => scriptJson(each, seen, runtimeName) ?? null);
    }
    const fields: Record<string, Json> = {};
    for (const [key, each] of Object.entries(value)) {
      const json = scriptJson(each, seen, runtimeName);
      if (json !== undefined) {
        fields[key] = json;
      }
    }
    return fields;
  } finally {
    seen.delete(value);
  }
}

/** A value of the script as canonical Extended JSON; `undefined` stays undefined, and is left out of a document. */
export function scriptJson(value: unknown, seen: Set<object>, runtimeName: RuntimeName): Json | undefined {
  switch (typeof value) {
    case 'undefined':
      return undefined;
    case 'boolean':
    case 'string':
      return value;
    case 'number':
      return numberJson(value);
    case 'bigint':
      return { $numberLong: value.toString() };
    case 'object':
      return value === null ? null : objectJson(value, seen, runtimeName);
    case 'function':
      throw new NotBson(`The function ${value.name === '' ? '(anonymous)' : value.name} is not a value of BSON`);
    case 'symbol':
      throw new NotBson('A symbol is not a value of BSON');
  }
}

/** A value of the script as canonical Extended JSON, `null` for `undefined`. */
export function toJson(value: unknown, runtimeName: RuntimeName = () => undefined): Json {
  return scriptJson(value, new Set(), runtimeName) ?? null;
}

const regExpFlags = /^[imsu]*$/u;

function typedScriptValue(json: JsonObject): unknown {
  const wrapper = Object.keys(json)[0] ?? '';
  const inner = json[wrapper];
  switch (wrapper) {
    case '$numberInt':
      return Number(inner);
    case '$numberDouble': {
      const number = Number(inner);
      return Number.isInteger(number) || !Number.isFinite(number) ? new BsonValue(json) : number;
    }
    case '$date': {
      const milliseconds = jsonObject(inner)?.['$numberLong'] ?? inner;
      return new Date(Number(milliseconds));
    }
    case '$regularExpression': {
      const parts = jsonObject(inner) ?? {};
      const { pattern, options } = parts as { pattern?: unknown; options?: unknown };
      return typeof pattern === 'string' && typeof options === 'string' && regExpFlags.test(options)
        ? new RegExp(pattern, options)
        : new BsonValue(json);
    }
    default:
      return new BsonValue(json);
  }
}

/** A value of canonical Extended JSON as the script sees it: numbers, dates, documents, and {@link BsonValue}s. */
export function scriptValue(json: Json): unknown {
  if (Array.isArray(json)) {
    return (json as readonly Json[]).map(scriptValue);
  }
  if (typeof json !== 'object' || json === null) {
    return json;
  }
  if (isTypedValue(json)) {
    return typedScriptValue(json as JsonObject);
  }
  return Object.fromEntries(Object.entries(json).map(([key, value]) => [key, scriptValue(value)]));
}

let counter = randomBytes(3).readUIntBE(0, 3);
const machine = randomBytes(5).toString('hex');

/** A new `ObjectId`, as the drivers make them: the time, a random part of this process, and a counter. */
export function newObjectId(now: number): string {
  counter = (counter + 1) % 0x1000000;
  const time = Math.floor(now / 1000)
    .toString(16)
    .padStart(8, '0');
  return `${time}${machine}${counter.toString(16).padStart(6, '0')}`;
}

/** The arguments of a BSON type as its helper reads them: whole numbers as their digits, the rest as Extended JSON. */
function helperArgument(value: unknown): Json {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return String(value);
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof BsonValue)) {
    if (Object.prototype.toString.call(value) === '[object Object]') {
      return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, helperArgument(each)]));
    }
  }
  return toJson(value);
}

/** The value a BSON type gives: `ObjectId("Ã¢â‚¬Â¦")`, `NumberLong(5)`, `ISODate()`; dates are dates of the script. */
export function bsonTypeValue(name: string, args: readonly unknown[]): unknown {
  const now = Date.now();
  const given = args.filter((each) => each !== undefined).map(helperArgument);
  const helper = name === 'UUID' && given.length === 0 ? null : undefined;
  if (helper === null) {
    return new BsonValue({ $binary: { base64: uuidBase64(), subType: '04' } });
  }
  const json = helperValue(name, given, { now, newId: () => newObjectId(now) });
  return name === 'ISODate' ? scriptValue(json) : new BsonValue(json as JsonObject);
}

function uuidBase64(): string {
  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return bytes.toString('base64');
}

/** `EJSON` of the script: Extended JSON as text, and values as Extended JSON, both ways. */
export function extendedJson(runtimeName: RuntimeName): Readonly<Record<string, unknown>> {
  return {
    stringify: (value: unknown, _replacer?: unknown, space?: string | number) =>
      JSON.stringify(toJson(value, runtimeName), null, space),
    parse: (text: string) => scriptValue(JSON.parse(text) as Json),
    serialize: (value: unknown) => toJson(value, runtimeName),
    deserialize: (json: Json) => scriptValue(json),
  };
}
