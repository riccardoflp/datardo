/**
 * The operators of a filter that test one value by itself (`table.match`): `$type` by the exact BSON type, `$mod` on
 * the integer part, `$size` of an array.
 */
import type { Json } from '../../../shared/engine-request';
import { isJsonArray, type BsonType } from '../../query/mongosh/ejson';
import { text } from '../text';
import { numericOf, typeOf, type Found } from './order';
import { refuseFilter } from './refusal';

/** A test of one value. */
export type ValueTest = (value: Found) => boolean;

/** The numbers MongoDB gives the BSON types, which `$type` accepts as well as the names. */
const typeNumbers: Readonly<Record<BsonType, number>> = {
  double: 1,
  string: 2,
  object: 3,
  array: 4,
  binData: 5,
  undefined: 6,
  objectId: 7,
  bool: 8,
  date: 9,
  null: 10,
  regex: 11,
  dbPointer: 12,
  javascript: 13,
  symbol: 14,
  javascriptWithScope: 15,
  int: 16,
  timestamp: 17,
  long: 18,
  decimal: 19,
  minKey: -1,
  maxKey: 127,
};

const numberTypes: readonly BsonType[] = ['int', 'long', 'double', 'decimal'];

function typesNamed(written: Json): readonly BsonType[] {
  if (written === 'number') {
    return numberTypes;
  }
  if (typeof written === 'string' && Object.hasOwn(typeNumbers, written)) {
    return [written as BsonType];
  }
  const number = numericOf(written);
  const value = number === undefined ? undefined : Number(number.value);
  const named = (Object.keys(typeNumbers) as BsonType[]).filter((type) => typeNumbers[type] === value);
  if (named.length === 0) {
    const shown = number === undefined ? JSON.stringify(written) : String(value);
    refuseFilter(text.match.unknownType(shown));
  }
  return named;
}

/** `$type`: a name, a number or `"number"`, or a list of them; a value matches by its exact type. */
export function typeTest(operand: Json): ValueTest {
  const wanted = (isJsonArray(operand) ? operand : [operand]).flatMap(typesNamed);
  if (wanted.length === 0) {
    refuseFilter(text.match.noType);
  }
  return (value) => {
    const type = typeOf(value);
    return type !== undefined && wanted.includes(type);
  };
}

/** A whole number of an operand of `$mod`, truncated; the refusal of `$mod` for anything else. */
function wholeOperand(written: Json | undefined): bigint {
  const number = written === undefined ? undefined : numericOf(written);
  if (number === undefined || (!number.whole && !Number.isFinite(number.value))) {
    return refuseFilter(text.match.mod);
  }
  return number.whole ? number.value : BigInt(Math.trunc(number.value));
}

/** `$mod: [divisor, remainder]`, on the integer part of a number, the remainder with the sign of the value. */
export function modTest(operand: Json): ValueTest {
  if (!isJsonArray(operand) || operand.length !== 2) {
    return refuseFilter(text.match.mod);
  }
  const divisor = wholeOperand(operand[0]);
  const remainder = wholeOperand(operand[1]);
  if (divisor === 0n) {
    refuseFilter(text.match.modZero);
  }
  return (value) => {
    const number = numericOf(value);
    if (number === undefined || (!number.whole && !Number.isFinite(number.value))) {
      return false;
    }
    const whole = number.whole ? number.value : BigInt(Math.trunc(number.value));
    return whole % divisor === remainder;
  };
}

/** The length `$size` wants: a whole number, not negative. */
export function sizeOperand(operand: Json): number {
  const number = numericOf(operand);
  const size = number === undefined ? Number.NaN : Number(number.value);
  return Number.isInteger(size) && size >= 0 ? size : refuseFilter(text.match.size);
}
