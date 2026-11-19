/**
 * Feature: query.highlight
 *
 * Says what each part of a text in mongosh syntax is, so that the editors color field names, operators, strings,
 * numbers, ids, dates, regular expressions and comments as the user types. A text that `query.parse` refuses is
 * still colored to its end.
 */

/** What a part of the text is; each role has one color in each theme (`window.theme`). */
export type SyntaxRole = 'key' | 'op' | 'string' | 'ref' | 'number' | 'bool' | 'oid' | 'date' | 'regex' | 'comment';

/** A colored part: where it starts and ends, as offsets of the text, and its role. */
export interface SyntaxToken {
  readonly from: number;
  readonly to: number;
  readonly role: SyntaxRole;
}

/** The helpers and constants of mongosh syntax, colored as the values they make. */
const words: Readonly<Record<string, SyntaxRole>> = {
  ObjectId: 'oid',
  UUID: 'oid',
  BinData: 'oid',
  Binary: 'oid',
  HexData: 'oid',
  MD5: 'oid',
  DBRef: 'oid',
  Code: 'oid',
  BSONSymbol: 'oid',
  ISODate: 'date',
  Date: 'date',
  Timestamp: 'date',
  NumberLong: 'number',
  NumberInt: 'number',
  NumberDecimal: 'number',
  Decimal128: 'number',
  Long: 'number',
  Int32: 'number',
  Double: 'number',
  NaN: 'number',
  Infinity: 'number',
  true: 'bool',
  false: 'bool',
  null: 'bool',
  undefined: 'bool',
  MinKey: 'bool',
  MaxKey: 'bool',
  new: 'op',
};

const identifier = /[A-Za-z_$][\w$]*/uy;
const number = /-?(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/uy;
const regexLiteral = /\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/uy;
/** The argument a helper is colored with: one string or one number in parentheses, or nothing. */
const call = /\(\s*(?:"[^"\n]*"|'[^'\n]*'|-?[\d.eE+]*)\s*\)/uy;

/** The characters after which a value can start, so that a `/` opens a regular expression. */
const valueStarts = ':[,(=!&|?{';

function stringEnd(source: string, start: number): number {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      index += 1;
    } else if (character === quote) {
      return index + 1;
    } else if (character === '\n') {
      return index;
    }
  }
  return source.length;
}

/** Whether a `:` follows, past spaces: what was just read is a key. */
function beforeColon(source: string, at: number): boolean {
  let index = at;
  while (index < source.length && /[ \t\r\n]/u.test(source[index] ?? '')) {
    index += 1;
  }
  return source[index] === ':';
}

function stringRole(source: string, start: number, end: number): SyntaxRole {
  const dollar = source[start + 1] === '$';
  if (beforeColon(source, end)) {
    return dollar ? 'op' : 'key';
  }
  return dollar && /[A-Za-z_$]/u.test(source[start + 2] ?? '') ? 'ref' : 'string';
}

function wordRole(source: string, word: string, end: number): SyntaxRole | undefined {
  if (beforeColon(source, end)) {
    return word.startsWith('$') ? 'op' : 'key';
  }
  return Object.hasOwn(words, word) ? words[word] : undefined;
}

/** What the scan read at one place: a token or none, where it ends, and the last character for what follows. */
interface Step {
  readonly token?: SyntaxToken;
  readonly end: number;
  readonly last: string;
}

function commentStep(source: string, start: number): Step | undefined {
  if (source[start] !== '/' || (source[start + 1] !== '/' && source[start + 1] !== '*')) {
    return undefined;
  }
  const line = source[start + 1] === '/';
  const close = line ? source.indexOf('\n', start) : source.indexOf('*/', start + 2);
  const end = close < 0 ? source.length : line ? close : close + 2;
  return { token: { from: start, to: end, role: 'comment' }, end, last: '' };
}

function matched(pattern: RegExp, source: string, start: number): number | undefined {
  pattern.lastIndex = start;
  const match = pattern.exec(source);
  return match === null ? undefined : start + match[0].length;
}

function valueStep(source: string, start: number, last: string): Step | undefined {
  const character = source[start] ?? '';
  const valueStart = last === '' || valueStarts.includes(last);
  if (character === '/' && valueStart) {
    const end = matched(regexLiteral, source, start);
    if (end !== undefined) {
      return { token: { from: start, to: end, role: 'regex' }, end, last: '/' };
    }
  }
  if (/[\d.]/u.test(character) || (character === '-' && valueStart)) {
    const end = matched(number, source, start);
    if (end !== undefined) {
      return { token: { from: start, to: end, role: 'number' }, end, last: '0' };
    }
  }
  return undefined;
}

function wordStep(source: string, start: number): Step | undefined {
  const end = matched(identifier, source, start);
  if (end === undefined) {
    return undefined;
  }
  const role = wordRole(source, source.slice(start, end), end);
  const withCall = role === 'oid' || role === 'date' || role === 'number' ? (matched(call, source, end) ?? end) : end;
  return { ...(role === undefined ? {} : { token: { from: start, to: withCall, role } }), end: withCall, last: 'a' };
}

function stepAt(source: string, start: number, last: string): Step {
  const character = source[start] ?? '';
  const comment = commentStep(source, start);
  if (comment !== undefined) {
    return { ...comment, last };
  }
  if (character === '"' || character === "'" || character === '`') {
    const end = stringEnd(source, start);
    return { token: { from: start, to: end, role: stringRole(source, start, end) }, end, last: character };
  }
  return valueStep(source, start, last) ?? wordStep(source, start) ?? { end: start + 1, last: character };
}

/**
 * Feature: query.highlight
 *
 * The tokens of a text, in its order and never overlapping. Braces, colons, commas and unknown words have no token.
 */
export function syntaxTokens(source: string): readonly SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let last = '';
  let at = 0;
  while (at < source.length) {
    if (/\s/u.test(source[at] ?? '')) {
      at += 1;
      continue;
    }
    const step = stepAt(source, at, last);
    if (step.token !== undefined) {
      tokens.push(step.token);
    }
    last = step.last;
    at = step.end;
  }
  return tokens;
}
