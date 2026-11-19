/**
 * Reads mongosh syntax into a value as canonical Extended JSON, with the type of every value known: JSON with the
 * freedoms of JSON5 (keys without quotes, single quotes, comments, a comma after the last entry, `0x1F`, `.5`,
 * `Infinity`), the helpers of mongosh (`ObjectId("…")`, `ISODate("…")`, `NumberLong(5)`, …) and regular expressions.
 * It reads the text and never evaluates it.
 *
 * This is the stand-in for `query.parse` (M9) that the pipeline editor needs, with the card's function
 * `parsedValue(text, now, newId)`, until the two are merged. Its messages are worded as JSON5 words them
 * (`JSON5: invalid end of input at 1:11`), which the cards of the aggregate area quote.
 */
import type { Json } from '../../../shared/engine-request';
import { dateValue, doubleText, helperValue, HelperProblem, isHelper, noMakers, type Makers } from './helpers';

/** A value read, or why the text is not one and where. */
export type ParsedValue =
  | { readonly ok: true; readonly value: Json }
  | { readonly ok: false; readonly message: string; readonly line: number; readonly column: number };

class Problem extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
  }
}

const numberPattern = /[-+]?(0[xX][0-9a-fA-F]+|Infinity|NaN|(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?)/y;
const regexPattern = /\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([A-Za-z]*)/y;
const wordPattern = /[A-Za-z_$][\w$]*/y;
const int32Least = -2147483648n;
const int32Most = 2147483647n;
const int64Least = -9223372036854775808n;
const int64Most = 9223372036854775807n;

/** A character as JSON5 writes it in a message: `'"'` as `'\"'`, a line break as `'\n'`. */
function characterText(character: string): string {
  const escapes: Readonly<Record<string, string>> = { "'": "\\'", '"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r' };
  const escaped = escapes[character];
  if (escaped !== undefined) {
    return escaped;
  }
  const code = character.charCodeAt(0);
  return code < 0x20 ? `\\x${code.toString(16).padStart(2, '0')}` : character;
}

function wholeNumber(digits: string): Json {
  const negative = digits.startsWith('-');
  const unsigned = digits.replace(/^[-+]/u, '');
  const magnitude = BigInt(unsigned);
  const whole = negative ? -magnitude : magnitude;
  if (whole >= int32Least && whole <= int32Most) {
    return { $numberInt: whole.toString() };
  }
  if (whole >= int64Least && whole <= int64Most) {
    return { $numberLong: whole.toString() };
  }
  return { $numberDouble: doubleText(Number(whole)) };
}

function plainNumber(value: Json | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const inner = (value as Record<string, Json>)['$numberInt'] ?? (value as Record<string, Json>)['$numberDouble'];
  return typeof inner === 'string' ? Number(inner) : undefined;
}

/** Extended JSON written by hand, in its relaxed forms too, made canonical: `{ $date: "2024-01-01" }`. */
function canonicalWrapper(object: Readonly<Record<string, Json>>): Json {
  const keys = Object.keys(object);
  const [key] = keys;
  const inner = key === undefined ? undefined : object[key];
  if (key === undefined || keys.length !== 1 || inner === undefined) {
    return object;
  }
  switch (key) {
    case '$date': {
      const time = typeof inner === 'string' ? new Date(inner).getTime() : plainNumber(inner);
      return time === undefined || Number.isNaN(time) ? object : dateValue(time);
    }
    case '$timestamp': {
      const fields = inner as Record<string, Json>;
      return { $timestamp: { t: plainNumber(fields['t']) ?? 0, i: plainNumber(fields['i']) ?? 0 } };
    }
    case '$minKey':
    case '$maxKey':
      return { [key]: 1 };
    case '$uuid':
      return typeof inner === 'string' ? helperValue('UUID', [inner], noMakers) : object;
    default:
      return object;
  }
}

/** The reader of one text, from its start. */
class Reader {
  private position = 0;

  constructor(
    private readonly source: string,
    private readonly makers: Makers,
  ) {}

  /** The whole text as one value. */
  document(): Json {
    const value = this.value();
    this.skipSpace();
    if (this.position < this.source.length) {
      throw this.unexpected();
    }
    return value;
  }

  private peek(): string | undefined {
    return this.source[this.position];
  }

  private endOfInput(): Problem {
    return new Problem('JSON5: invalid end of input', this.position);
  }

  private unexpected(): Problem {
    const character = this.peek();
    return character === undefined
      ? this.endOfInput()
      : new Problem(`JSON5: invalid character '${characterText(character)}'`, this.position);
  }

  private skipSpace(): void {
    for (;;) {
      const rest = this.source.slice(this.position, this.position + 2);
      if (/^\s/u.test(rest)) {
        this.position += 1;
      } else if (rest === '//') {
        const end = this.source.indexOf('\n', this.position);
        this.position = end < 0 ? this.source.length : end;
      } else if (rest === '/*') {
        const end = this.source.indexOf('*/', this.position + 2);
        this.position = end < 0 ? this.source.length : end + 2;
        if (end < 0) {
          throw this.endOfInput();
        }
      } else {
        return;
      }
    }
  }

  private expect(character: string): void {
    this.skipSpace();
    if (this.peek() !== character) {
      throw this.unexpected();
    }
    this.position += 1;
  }

  private value(): Json {
    this.skipSpace();
    const character = this.peek();
    if (character === undefined) {
      throw this.endOfInput();
    }
    if (character === '{') {
      return this.object();
    }
    if (character === '[') {
      return this.list('[', ']');
    }
    if (character === '"' || character === "'") {
      return this.string();
    }
    if (character === '/') {
      return this.regex();
    }
    return /[-+.\d]/u.test(character) ? this.number() : this.word();
  }

  private object(): Json {
    this.position += 1;
    const entries: [string, Json][] = [];
    this.skipSpace();
    while (this.peek() !== '}') {
      const key = this.key();
      this.expect(':');
      entries.push([key, this.value()]);
      this.skipSpace();
      if (this.peek() !== ',') {
        break;
      }
      this.position += 1;
      this.skipSpace();
    }
    this.expect('}');
    return canonicalWrapper(Object.fromEntries(entries));
  }

  private key(): string {
    const character = this.peek();
    if (character === '"' || character === "'") {
      return this.string();
    }
    wordPattern.lastIndex = this.position;
    const word = wordPattern.exec(this.source)?.[0];
    if (word === undefined) {
      throw this.unexpected();
    }
    this.position += word.length;
    return word;
  }

  /** The items of a list, `[1, 2]` or the arguments of a helper `(1, 2)`; a comma may follow the last. */
  private list(open: string, close: string): Json[] {
    this.expect(open);
    const items: Json[] = [];
    this.skipSpace();
    while (this.peek() !== close) {
      items.push(this.value());
      this.skipSpace();
      if (this.peek() !== ',') {
        break;
      }
      this.position += 1;
      this.skipSpace();
    }
    this.expect(close);
    return items;
  }

  private string(): string {
    const quote = this.peek();
    let value = '';
    this.position += 1;
    for (let character = this.peek(); character !== quote; character = this.peek()) {
      if (character === undefined) {
        throw this.endOfInput();
      }
      if (character === '\n' || character === '\r') {
        throw this.unexpected();
      }
      value += character === '\\' ? this.escape() : character;
      this.position += 1;
    }
    this.position += 1;
    return value;
  }

  private escape(): string {
    this.position += 1;
    const character = this.peek();
    const simple: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };
    if (character === undefined) {
      throw this.endOfInput();
    }
    const hexLength = character === 'u' ? 4 : character === 'x' ? 2 : 0;
    if (hexLength === 0) {
      return character === '\n' ? '' : (simple[character] ?? character);
    }
    const hex = this.source.slice(this.position + 1, this.position + 1 + hexLength);
    if (!new RegExp(`^[0-9a-fA-F]{${String(hexLength)}}$`, 'u').test(hex)) {
      throw this.unexpected();
    }
    this.position += hexLength;
    return String.fromCharCode(parseInt(hex, 16));
  }

  private number(): Json {
    numberPattern.lastIndex = this.position;
    const digits = numberPattern.exec(this.source)?.[0];
    if (digits === undefined) {
      throw this.unexpected();
    }
    this.position += digits.length;
    const unsigned = digits.replace(/^[-+]/u, '');
    if (/^(0[xX][0-9a-fA-F]+|\d+)$/u.test(unsigned)) {
      return wholeNumber(digits);
    }
    return { $numberDouble: doubleText(Number(digits.replace(/^\+/u, ''))) };
  }

  private regex(): Json {
    regexPattern.lastIndex = this.position;
    const match = regexPattern.exec(this.source);
    if (match === null) {
      throw this.unexpected();
    }
    this.position += match[0].length;
    const options = [...new Set((match[2] ?? '').replace(/[^imsxu]/gu, ''))].sort().join('');
    return { $regularExpression: { pattern: match[1] ?? '', options } };
  }

  private word(): Json {
    const start = this.position;
    wordPattern.lastIndex = start;
    const word = wordPattern.exec(this.source)?.[0];
    if (word === undefined) {
      throw this.unexpected();
    }
    const constants: Readonly<Record<string, Json>> = {
      true: true,
      false: false,
      null: null,
      undefined: { $undefined: true },
      Infinity: { $numberDouble: 'Infinity' },
      NaN: { $numberDouble: 'NaN' },
    };
    const constant = constants[word];
    if (constant !== undefined) {
      this.position += word.length;
      return constant;
    }
    return this.helper(start, word);
  }

  private helper(start: number, word: string): Json {
    let name = word;
    this.position += word.length;
    const afterNew = word === 'new';
    if (afterNew) {
      this.skipSpace();
      wordPattern.lastIndex = this.position;
      name = wordPattern.exec(this.source)?.[0] ?? '';
      this.position += name.length;
    }
    this.skipSpace();
    if (!isHelper(name, afterNew) || this.peek() !== '(') {
      this.position = start;
      throw this.unexpected();
    }
    const args = this.list('(', ')');
    try {
      return helperValue(name, args, this.makers);
    } catch (error: unknown) {
      if (error instanceof HelperProblem) {
        throw new Problem(error.message, start);
      }
      throw error;
    }
  }
}

/** The line and the column, from 1, of a place in a text. */
function placeOf(text: string, position: number): { readonly line: number; readonly column: number } {
  const before = text.slice(0, position).split('\n');
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

/** The value of a text, or why it is not one: the card's `parsedValue` of `query.parse`. */
export function parsedValue(text: string, now?: number, newId?: () => string): ParsedValue {
  return valueOf(text, { ...(now === undefined ? {} : { now }), ...(newId === undefined ? {} : { newId }) });
}

/** The value of a text read with the makers given, or why it is not one. */
export function valueOf(text: string, makers: Makers): ParsedValue {
  try {
    return { ok: true, value: new Reader(text, makers).document() };
  } catch (error: unknown) {
    if (!(error instanceof Problem)) {
      throw error;
    }
    const { line, column } = placeOf(text, error.at);
    const message = error.message.startsWith('JSON5:')
      ? `${error.message} at ${String(line)}:${String(column)}`
      : error.message;
    return { ok: false, message, line, column };
  }
}
