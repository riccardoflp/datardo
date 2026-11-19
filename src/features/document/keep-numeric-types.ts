/**
 * Feature: document.keep-numeric-types
 *
 * A number typed as plain text (`5`, `6.5`, `5000000000`) cannot say whether it is an `Int32`, a `Double` or a `Long`:
 * it keeps the type the value had in the database, unless the user wrote another type explicitly (`NumberInt(5)`,
 * `NumberLong(8)`, `NumberDecimal("1.10")`). The text is read by the mongosh reader of `query.parse` (for now the one of
 * the pipeline editor, `src/features/aggregate/mongosh`), which says which numbers were written as digits alone.
 */
import type { Json } from '../../shared/engine-request';
import { isTypedValue } from '../aggregate/mongosh/format';
import { doubleText, type Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { isRecord } from './types';
import { isDocumentValue } from './write/values';

/** A value read from the user's text, with the numbers that were written as digits alone. */
export interface EditedValue {
  readonly value: Json;
  /** The numbers written as digits alone, by the identity of their value in `value`, with their digits. */
  readonly plain: ReadonlyMap<object, string>;
}

/** The value of a text the user typed, or the reader's message when it is not one. */
export type ReadEdit =
  { readonly ok: true; readonly edited: EditedValue } | { readonly ok: false; readonly message: string };

/** Reads the text of an edit as `query.parse` reads it, noting which numbers were written as digits alone. */
export function editedValueOf(source: string, makers: Makers): ReadEdit {
  const plain = new Map<object, string>();
  const read = valueOf(source, {
    ...makers,
    onPlainNumber: (value, digits) => {
      if (isRecord(value)) {
        plain.set(value, digits);
      }
    },
  });
  return read.ok ? { ok: true, edited: { value: read.value, plain } } : { ok: false, message: read.message };
}

/** A value that the user typed and that has no number to restore: Extended JSON written by Datardo, for instance. */
export function editedOf(value: Json): EditedValue {
  return { value, plain: new Map() };
}

type NumericKind = '$numberInt' | '$numberDouble' | '$numberLong';

const numericKinds: readonly NumericKind[] = ['$numberInt', '$numberDouble', '$numberLong'];

/** The kind and the text of an `Int32`, a `Double` or a `Long`; `undefined` for any other value. */
function numericOf(value: Json | undefined): { readonly kind: NumericKind; readonly text: string } | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1) {
    return undefined;
  }
  const kind = numericKinds.find((each) => typeof value[each] === 'string');
  return kind === undefined ? undefined : { kind, text: value[kind] as string };
}

const longLeast = -(2n ** 63n);
const longMost = 2n ** 63n - 1n;

/** The whole number the digits write, exactly; `undefined` for a number with decimals or one that is not whole. */
function wholeOf(digits: string): bigint | undefined {
  const negative = digits.startsWith('-');
  const unsigned = digits.replace(/^[-+]/u, '');
  if (/^(0[xX][0-9a-fA-F]+|\d+)$/u.test(unsigned)) {
    const magnitude = BigInt(unsigned);
    return negative ? -magnitude : magnitude;
  }
  const number = Number(digits);
  return Number.isInteger(number) ? BigInt(number) : undefined;
}

/** Whether the digits typed read as the number stored: `5` and `Int32(5)`, `5` and `Double(5)`, `0.10` and `0.1`. */
function readsTheSame(digits: string, stored: { readonly kind: NumericKind; readonly text: string }): boolean {
  if (stored.kind === '$numberDouble') {
    return Object.is(Number(digits), Number(stored.text));
  }
  const whole = wholeOf(digits);
  return whole !== undefined && whole === BigInt(stored.text);
}

/** A number written as digits alone, against the value stored at its place (rule 2). */
function keptNumber(value: Json, digits: string, prev: Json | undefined): Json {
  const stored = numericOf(prev);
  if (stored === undefined || prev === undefined) {
    return value;
  }
  if (readsTheSame(digits, stored)) {
    return prev;
  }
  if (stored.kind === '$numberDouble') {
    return { $numberDouble: doubleText(Number(digits)) };
  }
  const whole = wholeOf(digits);
  if (stored.kind === '$numberLong' && whole !== undefined && whole >= longLeast && whole <= longMost) {
    return { $numberLong: whole.toString() };
  }
  return value;
}

function kept(value: Json, prev: Json | undefined, plain: ReadonlyMap<object, string>): Json {
  if (Array.isArray(value)) {
    const before: readonly Json[] = Array.isArray(prev) ? (prev as readonly Json[]) : [];
    return (value as readonly Json[]).map((item, index) => kept(item, before[index], plain));
  }
  if (!isRecord(value)) {
    return value;
  }
  const digits = plain.get(value);
  if (digits !== undefined) {
    return keptNumber(value, digits, prev);
  }
  if (isTypedValue(value)) {
    return value;
  }
  const before = isDocumentValue(prev) ? prev : {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      kept(item, Object.hasOwn(before, key) ? before[key] : undefined, plain),
    ]),
  );
}

/**
 * Feature: document.keep-numeric-types
 *
 * The value to write: `next` as the user typed it, with each number written as digits alone given the type of the
 * value at the same place of `prev` (the value as stored, or `undefined`), by the rules of the card.
 */
export function withKeptTypes(next: EditedValue, prev: Json | undefined): Json {
  return kept(next.value, prev, next.plain);
}
