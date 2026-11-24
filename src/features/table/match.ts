/**
 * Feature: table.match
 *
 * Whether a document of the page matches a filter, decided in the window as MongoDB decides it, for the colors of the
 * table only: nothing that writes may rely on it. Comparison, sets, `$exists`, `$type`, `$regex`, `$mod`, arrays and
 * logic; what needs the server is refused rather than approximated.
 */
import type { Json } from '../../shared/engine-request';
import { isJsonArray, isSubdocument, type JsonObject } from '../query/mongosh/ejson';
import { text } from './text';
import type { Document } from './types';
import { compareValues, equalValues, isArrayFound, missing, numericOf, type Found } from './matching/order';
import { isRegexValue, regexMatches, regexOfValue, regexOperand } from './matching/regex';
import { FilterRefusal, refuseFilter } from './matching/refusal';
import { modTest, sizeOperand, typeTest, type ValueTest } from './matching/value-tests';

/** A filter made into a predicate on documents, or why it cannot be. */
export type Matcher =
  | { readonly ok: true; readonly matches: (document: Document) => boolean }
  | { readonly ok: false; readonly message: string };

/** The operators that need the server: refused rather than approximated. */
const needServer: ReadonlySet<string> = new Set([
  '$expr',
  '$where',
  '$text',
  '$jsonSchema',
  '$sampleRate',
  '$search',
  '$vectorSearch',
  '$geoWithin',
  '$geoIntersects',
  '$near',
  '$nearSphere',
  '$bitsAllSet',
  '$bitsAllClear',
  '$bitsAnySet',
  '$bitsAnyClear',
]);

function refuseOperator(operator: string): never {
  return refuseFilter(needServer.has(operator) ? text.match.unsupported(operator) : text.match.unknown(operator));
}

/** A test of a document, or of an element of an array inside `$elemMatch`. */
type DocumentTest = (document: Found) => boolean;

/** A test of the values found at a path. */
type ValuesTest = (values: readonly Found[]) => boolean;

/** The values at a path: through sub-documents, into the elements of arrays (a numeric segment is also an index). */
function valuesAt(value: Found, path: readonly string[], at: number, found: Found[]): void {
  const segment = path[at];
  if (segment === undefined) {
    found.push(value);
  } else if (isArrayFound(value)) {
    const index = /^\d+$/u.test(segment) ? Number(segment) : -1;
    if (index >= 0 && index < value.length) {
      valuesAt(value[index] ?? null, path, at + 1, found);
    }
    for (const element of value.filter((each) => isSubdocument(each))) {
      valuesAt(element, path, at, found);
    }
  } else if (value !== missing && isSubdocument(value) && Object.hasOwn(value, segment)) {
    valuesAt(value[segment] ?? null, path, at + 1, found);
  } else {
    found.push(missing);
  }
}

/** A test true when a value at the path, or an element of an array there, passes. */
function anyValue(test: ValueTest): ValuesTest {
  return (values) => values.some((value) => test(value) || (isArrayFound(value) && value.some(test)));
}

/** `{ $gt: 1 }`, as opposed to a sub-document to be equal to: its first key is an operator, and it is no DBRef. */
function isOperatorDocument(value: Json | undefined): value is JsonObject {
  if (!isSubdocument(value) || ('$ref' in value && '$id' in value)) {
    return false;
  }
  return Object.keys(value)[0]?.startsWith('$') ?? false;
}

/** `{ field: value }`: equal, or a string the regular expression matches when the value is one. */
function equalityTest(value: Json): ValueTest {
  if (isRegexValue(value)) {
    const expression = regexOfValue(value);
    return (found) => regexMatches(expression, found) || equalValues(found, value);
  }
  return (found) => equalValues(found, value);
}

function inTest(operator: string, operand: Json): ValueTest {
  if (!isJsonArray(operand)) {
    return refuseFilter(text.match.needsArray(operator));
  }
  const tests = operand.map((item) =>
    isOperatorDocument(item) ? refuseFilter(text.match.noOperatorIn(operator)) : equalityTest(item),
  );
  return (found) => tests.some((test) => test(found));
}

function comparison(operator: string, operand: Json, accept: (difference: number) => boolean): ValuesTest {
  if (isRegexValue(operand)) {
    refuseFilter(text.match.compareRegex(operator));
  }
  return anyValue((found) => {
    const difference = compareValues(found, operand);
    return difference !== undefined && accept(difference);
  });
}

function isFalse(operand: Json): boolean {
  return operand === false || operand === null || Number(numericOf(operand)?.value) === 0;
}

function allTest(operand: Json): ValuesTest {
  if (!isJsonArray(operand)) {
    return refuseFilter(text.match.needsArray('$all'));
  }
  if (operand.length === 0) {
    return () => false;
  }
  const parts = operand.map((item) =>
    isSubdocument(item) && Object.keys(item)[0] === '$elemMatch'
      ? elemMatchTest(item['$elemMatch'] ?? null)
      : anyValue(equalityTest(item)),
  );
  return (values) => parts.every((part) => part(values));
}

function elemMatchTest(operand: Json): ValuesTest {
  if (!isSubdocument(operand)) {
    return refuseFilter(text.match.elemMatch);
  }
  const keys = Object.keys(operand);
  const logic = keys.some((key) => key === '$and' || key === '$or' || key === '$nor');
  // { $gte: 80, $lt: 85 } tests the elements' values; { sku: "A1", qty: { $gt: 1 } } the elements as documents.
  if (keys.length > 0 && keys.every((key) => key.startsWith('$')) && !logic) {
    const test = operatorsTest(operand);
    return (values) => values.some((value) => isArrayFound(value) && value.some((element) => test([element])));
  }
  const test = documentTest(operand);
  return (values) =>
    values.some((value) => isArrayFound(value) && value.some((element) => isSubdocument(element) && test(element)));
}

function notTest(operand: Json): ValuesTest {
  if (isRegexValue(operand)) {
    const inner = anyValue(equalityTest(operand));
    return (values) => !inner(values);
  }
  if (!isOperatorDocument(operand)) {
    return refuseFilter(text.match.not);
  }
  const inner = operatorsTest(operand);
  return (values) => !inner(values);
}

function negation(test: ValuesTest): ValuesTest {
  return (values) => !test(values);
}

function comparisonOperator(operator: string, operand: Json): ValuesTest | undefined {
  switch (operator) {
    case '$eq':
      return anyValue((found) => equalValues(found, operand));
    case '$ne':
      return negation(anyValue((found) => equalValues(found, operand)));
    case '$gt':
      return comparison(operator, operand, (difference) => difference > 0);
    case '$gte':
      return comparison(operator, operand, (difference) => difference >= 0);
    case '$lt':
      return comparison(operator, operand, (difference) => difference < 0);
    case '$lte':
      return comparison(operator, operand, (difference) => difference <= 0);
    case '$in':
      return anyValue(inTest(operator, operand));
    case '$nin':
      return negation(anyValue(inTest(operator, operand)));
    default:
      return undefined;
  }
}

function operatorTest(operator: string, operand: Json, operators: JsonObject): ValuesTest {
  const compared = comparisonOperator(operator, operand);
  if (compared !== undefined) {
    return compared;
  }
  switch (operator) {
    case '$exists':
      return isFalse(operand)
        ? (values) => values.every((value) => value === missing)
        : (values) => values.some((value) => value !== missing);
    case '$type':
      return anyValue(typeTest(operand));
    case '$regex': {
      const expression = regexOperand(operand, operators['$options']);
      return anyValue((found) => regexMatches(expression, found));
    }
    case '$mod':
      return anyValue(modTest(operand));
    case '$size': {
      const size = sizeOperand(operand);
      return (values) => values.some((value) => isArrayFound(value) && value.length === size);
    }
    case '$all':
      return allTest(operand);
    case '$elemMatch':
      return elemMatchTest(operand);
    case '$not':
      return notTest(operand);
    case '$and':
    case '$or':
    case '$nor':
      return refuseFilter(text.match.logicOnField(operator));
    default:
      return refuseOperator(operator);
  }
}

function operatorsTest(operators: JsonObject): ValuesTest {
  const tests: ValuesTest[] = [];
  for (const [operator, operand] of Object.entries(operators)) {
    if (operator === '$options') {
      if (!('$regex' in operators)) {
        refuseFilter(text.match.optionsWithoutRegex);
      }
    } else {
      tests.push(operator.startsWith('$') ? operatorTest(operator, operand, operators) : refuseOperator(operator));
    }
  }
  return (values) => tests.every((test) => test(values));
}

function fieldTest(path: readonly string[], condition: Json): DocumentTest {
  const test = isOperatorDocument(condition) ? operatorsTest(condition) : anyValue(equalityTest(condition));
  return (document) => {
    const found: Found[] = [];
    valuesAt(document, path, 0, found);
    return test(found.length > 0 ? found : [missing]);
  };
}

function logicTest(operator: string, operand: Json): DocumentTest {
  if (!isJsonArray(operand) || operand.length === 0) {
    return refuseFilter(text.match.logic(operator));
  }
  const parts = operand.map((part) =>
    isSubdocument(part) ? documentTest(part) : refuseFilter(text.match.logicDocuments(operator)),
  );
  if (operator === '$and') {
    return (document) => parts.every((part) => part(document));
  }
  const some = (document: Found): boolean => parts.some((part) => part(document));
  return operator === '$or' ? some : (document) => !some(document);
}

function topOperatorTest(operator: string, operand: Json): DocumentTest | undefined {
  switch (operator) {
    case '$and':
    case '$or':
    case '$nor':
      return logicTest(operator, operand);
    case '$comment':
      return undefined;
    default:
      return refuseOperator(operator);
  }
}

/** The fields of a document joined by an and, with the logic operators at its top. */
function documentTest(filter: JsonObject): DocumentTest {
  const parts = Object.entries(filter).flatMap(([key, value]) => {
    const part = key.startsWith('$') ? topOperatorTest(key, value) : fieldTest(key.split('.'), value);
    return part === undefined ? [] : [part];
  });
  return (document) => parts.every((part) => part(document));
}

/**
 * Feature: table.match
 *
 * A filter as `query.parse` reads it, made once into a predicate on the documents of the page, or refused with the
 * message the user reads under the condition. A document the predicate cannot read does not match.
 */
export function matcherOfFilter(filter: Json): Matcher {
  try {
    if (!isSubdocument(filter)) {
      return { ok: false, message: text.match.notDocument };
    }
    const test = documentTest(filter);
    return { ok: true, matches: (document) => safely(test, document) };
  } catch (error: unknown) {
    // A filter the matcher refuses is the answer; anything else is a fault of the matcher.
    if (error instanceof FilterRefusal) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function safely(test: DocumentTest, document: Document): boolean {
  try {
    return test(document);
  } catch {
    // A value of a form the predicate does not expect does not match: drawing the table never stops for a rule.
    return false;
  }
}
