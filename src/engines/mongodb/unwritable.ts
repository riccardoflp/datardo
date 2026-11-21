/**
 * The two values the driver cannot write as they are: a BSON undefined, which it writes as a null, and a date beyond
 * the range of a JavaScript `Date`, which it cannot hold. A write that carries one fails before anything is sent, so
 * that no type is changed without a word (R5.5); reading them keeps them (`replyOf`).
 */
import type { Json } from '../../shared/engine-request';
import { EngineError } from '../engine';

/** The methods that send documents or values to the server. */
const writeMethods: ReadonlySet<string> = new Set([
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'bulkWrite',
  'findOneAndUpdate',
  'findOneAndReplace',
]);

/** The most milliseconds from 1970 a JavaScript Date holds, on either side. */
const mostJavaScriptMilliseconds = 8_640_000_000_000_000n;

function objectOf(value: Json | undefined): Readonly<Record<string, Json>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : undefined;
}

function isFarDate(value: Readonly<Record<string, Json>>): boolean {
  const milliseconds = objectOf(value['$date'])?.['$numberLong'];
  if (typeof milliseconds !== 'string' || !/^-?\d+$/.test(milliseconds)) {
    return false;
  }
  const number = BigInt(milliseconds);
  return number > mostJavaScriptMilliseconds || number < -mostJavaScriptMilliseconds;
}

/** What the driver cannot write in a value, as `undefined at a.b`, or nothing. */
function unwritableIn(value: Json, path: string): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of (value as readonly Json[]).entries()) {
      const found = unwritableIn(item, path === '' ? String(index) : `${path}.${String(index)}`);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  const object = objectOf(value);
  if (object === undefined) {
    return undefined;
  }
  if (object['$undefined'] === true) {
    return `a BSON undefined at ${path}`;
  }
  if (isFarDate(object)) {
    return `a date beyond the range of JavaScript at ${path}`;
  }
  for (const [name, item] of Object.entries(object)) {
    const found = unwritableIn(item, path === '' ? name : `${path}.${name}`);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Fails before a write that would change the type of a value it carries; anything else passes. */
export function checkWritable(method: string, args: readonly Json[]): void {
  if (!writeMethods.has(method)) {
    return;
  }
  for (const argument of args) {
    const found = unwritableIn(argument, '');
    if (found !== undefined) {
      throw new EngineError(`Datardo cannot write ${found}: the driver would change its type, so nothing was sent.`);
    }
  }
}
