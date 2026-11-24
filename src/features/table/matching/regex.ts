/**
 * Regular expressions of a filter (`table.match`): MongoDB's as JavaScript's, with the options JavaScript has (`i`,
 * `m`, `s`) and `x` dropping the pattern's spaces and comments. Run on the strings of the page shown only.
 */
import type { Json } from '../../../shared/engine-request';
import { objectField, textOfJson, wrapperType, isJsonObject } from '../../query/mongosh/ejson';
import { text } from '../text';
import { missing, type Found } from './order';
import { refuseFilter } from './refusal';

/** Whether a value of a filter is a regular expression. */
export function isRegexValue(value: Json | undefined): boolean {
  return isJsonObject(value) && wrapperType(value) === 'regex';
}

function withoutSpaces(pattern: string): string {
  return pattern.replace(/\\[\s\S]|\[(?:\\.|[^\]\\])*\]|#[^\n]*|\s+/gu, (part) =>
    part.startsWith('\\') || part.startsWith('[') ? part : '',
  );
}

function compiled(source: string, flags: string): RegExp | Error {
  try {
    return new RegExp(source, flags);
  } catch (error: unknown) {
    // A pattern JavaScript cannot read is the answer: the caller refuses it with the reason.
    return error instanceof Error ? error : new Error(String(error));
  }
}

/** A pattern of MongoDB with its options as a JavaScript regular expression, or the refusal of the filter. */
export function regexOf(pattern: string, options: string): RegExp {
  const source = options.includes('x') ? withoutSpaces(pattern) : pattern;
  const flags = [...new Set(options.replace(/[^ims]/gu, ''))].join('');
  // With `u` first, so that code points outside the first plane are one character; without it for the patterns
  // that `u` makes stricter than PCRE (an escaped letter that means nothing).
  const unicode = compiled(source, `${flags}u`);
  if (unicode instanceof RegExp) {
    return unicode;
  }
  const plain = compiled(source, flags);
  return plain instanceof RegExp ? plain : refuseFilter(text.match.badRegex(pattern, plain.message));
}

/** The regular expression of a value of a filter that is one. */
export function regexOfValue(value: Json, options?: string): RegExp {
  const inner = objectField(value, '$regularExpression');
  return regexOf(textOfJson(objectField(inner, 'pattern')), options ?? textOfJson(objectField(inner, 'options')));
}

/** Whether a found value is a string, or a symbol, that the expression matches. */
export function regexMatches(expression: RegExp, value: Found): boolean {
  if (value === missing) {
    return false;
  }
  const written = typeof value === 'string' ? value : objectField(value, '$symbol');
  if (typeof written !== 'string') {
    return false;
  }
  expression.lastIndex = 0;
  return expression.test(written);
}

/** The expression of `$regex`, with `$options` when given. */
export function regexOperand(operand: Json, options: Json | undefined): RegExp {
  if (options !== undefined && typeof options !== 'string') {
    refuseFilter(text.match.optionsText);
  }
  if (isRegexValue(operand)) {
    return regexOfValue(operand, options);
  }
  return typeof operand === 'string' ? regexOf(operand, options ?? '') : refuseFilter(text.match.regexOperand);
}
