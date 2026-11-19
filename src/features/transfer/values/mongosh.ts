/**
 * A reader of values written in mongosh syntax, `{ when: ISODate("2024-01-01"), n: NumberLong(5), name: /^a/i }`, for
 * the files an import reads and the filter of a copy. It reads literals only and runs nothing (R14.4). It stands in
 * for `query.parse` until that card's reader is in the code; it gives values of relaxed Extended JSON, made canonical
 * by `./canonical`.
 */
import { doubleText, mostNesting } from './canonical';

/** A value read: relaxed Extended JSON, as `JSON.parse` of the same text in Extended JSON would give. */
type Read = unknown;

const identifierStart = /[A-Za-z_$]/u;
const identifierPart = /[A-Za-z0-9_$]/u;
const numberText = /^[-+]?(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?|Infinity|NaN)/u;

/** The text of a helper's argument: a string or a number as text, otherwise empty. */
function argText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** The options of a regular expression that MongoDB knows, in the order canonical Extended JSON writes them. */
const regexOptions: readonly string[] = ['i', 'l', 'm', 's', 'u', 'x'];

/** The helpers of mongosh that make a value, by name, and how their arguments become one. */
const helpers: Readonly<Record<string, (args: readonly Read[]) => Read>> = {
  ObjectId: ([hex]) => ({ $oid: argText(hex) }),
  ISODate: ([text]) => ({ $date: argText(text) }),
  Date: ([text]) => ({ $date: typeof text === 'number' ? { $numberLong: String(text) } : argText(text) }),
  NumberLong: ([value]) => ({ $numberLong: argText(value) }),
  Long: ([value]) => ({ $numberLong: argText(value) }),
  NumberInt: ([value]) => ({ $numberInt: argText(value) }),
  Int32: ([value]) => ({ $numberInt: argText(value) }),
  Double: ([value]) => ({ $numberDouble: doubleText(Number(value)) }),
  NumberDecimal: ([value]) => ({ $numberDecimal: argText(value) }),
  Decimal128: ([value]) => ({ $numberDecimal: argText(value) }),
  UUID: ([text]) => ({ $uuid: argText(text) }),
  BinData: ([subType, base64]) => ({
    $binary: { base64: argText(base64), subType: Number(subType).toString(16).padStart(2, '0') },
  }),
  Timestamp: ([t, i]) =>
    typeof t === 'object' && t !== null ? { $timestamp: t } : { $timestamp: { t: Number(t), i: Number(i ?? 0) } },
  MinKey: () => ({ $minKey: 1 }),
  MaxKey: () => ({ $maxKey: 1 }),
};

const escapes: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

class Reader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): Read {
    const value = this.value(0);
    this.skipSpace();
    if (this.index < this.text.length) {
      this.fail(`Unexpected ${this.text[this.index] ?? ''}`);
    }
    return value;
  }

  private fail(message: string): never {
    throw new Error(`${message} at position ${String(this.index + 1)}`);
  }

  private skipSpace(): void {
    for (;;) {
      const rest = this.text.slice(this.index, this.index + 2);
      if (/^\s/u.test(rest)) {
        this.index += 1;
      } else if (rest === '//') {
        const end = this.text.indexOf('\n', this.index);
        this.index = end < 0 ? this.text.length : end;
      } else if (rest === '/*') {
        const end = this.text.indexOf('*/', this.index + 2);
        this.index = end < 0 ? this.fail('Unterminated comment') : end + 2;
      } else {
        return;
      }
    }
  }

  private value(depth: number): Read {
    if (depth > mostNesting) {
      this.fail(`Nested deeper than ${String(mostNesting)} levels`);
    }
    this.skipSpace();
    const character = this.text[this.index] ?? '';
    if (character === '{') {
      return this.object(depth);
    }
    if (character === '[') {
      return this.array(depth);
    }
    if (character === '"' || character === "'") {
      return this.string();
    }
    if (character === '/') {
      return this.regex();
    }
    const number = numberText.exec(this.text.slice(this.index));
    if (number !== null) {
      this.index += number[0].length;
      return this.numberOf(number[0]);
    }
    return this.word(depth);
  }

  private numberOf(text: string): Read {
    const value = Number(text);
    return Number.isFinite(value) ? value : { $numberDouble: text.replace(/^\+/u, '') };
  }

  private expect(character: string): void {
    this.skipSpace();
    if (this.text[this.index] !== character) {
      this.fail(`Expected ${character}`);
    }
    this.index += 1;
  }

  /** Whether the next character is `character`, which is then passed. */
  private next(character: string): boolean {
    this.skipSpace();
    if (this.text[this.index] === character) {
      this.index += 1;
      return true;
    }
    return false;
  }

  /** Items up to `close`, separated by commas, a comma allowed after the last. */
  private items(close: string, item: () => void): void {
    while (!this.next(close)) {
      item();
      if (!this.next(',')) {
        this.expect(close);
        return;
      }
    }
  }

  private object(depth: number): Read {
    this.index += 1;
    const object: Record<string, Read> = {};
    this.items('}', () => {
      this.skipSpace();
      const quote = this.text[this.index];
      const key = quote === '"' || quote === "'" ? this.string() : this.identifier();
      this.expect(':');
      Object.defineProperty(object, key, { value: this.value(depth + 1), enumerable: true, writable: true });
    });
    return object;
  }

  private array(depth: number): Read {
    this.index += 1;
    const array: Read[] = [];
    this.items(']', () => array.push(this.value(depth + 1)));
    return array;
  }

  private string(): string {
    const quote = this.text[this.index];
    let index = this.index + 1;
    let text = '';
    while (index < this.text.length && this.text[index] !== quote) {
      const character = this.text[index] ?? '';
      if (character !== '\\') {
        text += character;
        index += 1;
        continue;
      }
      const escaped = this.text[index + 1] ?? '';
      const unicode = escaped === 'u' ? /^[0-9a-fA-F]{4}/u.exec(this.text.slice(index + 2)) : null;
      text += unicode === null ? (escapes[escaped] ?? escaped) : String.fromCharCode(parseInt(unicode[0], 16));
      index += unicode === null ? 2 : 6;
    }
    if (index >= this.text.length) {
      this.fail('Unterminated string');
    }
    this.index = index + 1;
    return text;
  }

  private regex(): Read {
    const match = /^\/((?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+)\/([a-z]*)/u.exec(this.text.slice(this.index));
    if (match === null) {
      return this.fail('Invalid regular expression');
    }
    this.index += match[0].length;
    const flags = match[2] ?? '';
    const options = regexOptions.filter((option) => flags.includes(option)).join('');
    return { $regularExpression: { pattern: match[1] ?? '', options } };
  }

  private identifier(): string {
    this.skipSpace();
    const start = this.index;
    if (!identifierStart.test(this.text[this.index] ?? '')) {
      this.fail('Expected a name');
    }
    while (identifierPart.test(this.text[this.index] ?? '')) {
      this.index += 1;
    }
    return this.text.slice(start, this.index);
  }

  private word(depth: number): Read {
    const name = this.identifier();
    const constants: Readonly<Record<string, Read>> = { true: true, false: false, null: null };
    if (name in constants) {
      return constants[name];
    }
    if (name === 'undefined') {
      return { $undefined: true };
    }
    const call = name === 'new' ? this.identifier() : name;
    const helper = helpers[call];
    if (helper === undefined) {
      return this.fail(`Unknown name ${call}`);
    }
    this.expect('(');
    const args: Read[] = [];
    this.items(')', () => args.push(this.value(depth + 1)));
    return helper(args);
  }
}

/** The value of mongosh text, as relaxed Extended JSON; an error that says where the text is wrong. */
export function readMongosh(text: string): Read {
  return new Reader(text).read();
}
