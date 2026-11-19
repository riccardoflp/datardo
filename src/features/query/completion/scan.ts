/**
 * Reads the text before the cursor once, without evaluating it: strings, comments, regular expressions and the
 * nesting of `{`, `[` and `(` (`query.suggestions`), ported from Mongoster's `scan`.
 */

/** An open container of the text before the cursor. */
export interface Frame {
  readonly type: '{' | '[' | '(';
  /** The key the container is the value of; `null` for an element of an array, or the root. */
  readonly key: string | null;
  /** In an object: a key, a colon, a value, or a comma after the value is expected. */
  state: 'key' | 'colon' | 'value' | 'after';
  currentKey?: string | undefined;
}

/** Where the cursor stands. */
export interface Scan {
  readonly frames: readonly Frame[];
  /** Whether the whole value is complete before the cursor, as after the `}` of the root object. */
  readonly done: boolean;
  /** Where the token at the cursor starts. */
  readonly tokenStart: number;
  /** The quote of a string the cursor is in, or `//`, `/*` or `/` inside a comment or a regular expression. */
  readonly quote?: string;
}

/** The characters of a word: a name, a number, a dotted path. */
export const wordCharacter = /[\w$.]/;

class Scanner {
  readonly frames: Frame[] = [];
  done = false;
  rootAfter = false;
  at = 0;

  constructor(
    readonly text: string,
    readonly offset: number,
  ) {}

  top(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  /** A complete value, or key, was read. */
  token(value: string | undefined): void {
    const frame = this.top();
    if (frame === undefined) {
      this.rootAfter = true;
      return;
    }
    if (frame.type !== '{') {
      return;
    }
    if (frame.state === 'key') {
      frame.currentKey = value;
      frame.state = 'colon';
    } else if (frame.state === 'value') {
      frame.state = 'after';
    }
  }

  stop(tokenStart: number, quote?: string): Scan {
    return { frames: this.frames, done: this.done, tokenStart, ...(quote === undefined ? {} : { quote }) };
  }

  comment(close: string, quote: string): Scan | undefined {
    const end = this.text.indexOf(close, this.at + 2);
    if (end < 0 || end + close.length > this.offset) {
      return this.stop(this.offset, quote);
    }
    this.at = end + close.length;
    return undefined;
  }

  string(quote: string): Scan | undefined {
    let next = this.at + 1;
    let value = '';
    while (next < this.text.length && this.text[next] !== quote) {
      if (this.text[next] === '\\') {
        value += this.text[next + 1] ?? '';
        next += 2;
      } else {
        value += this.text[next] ?? '';
        next += 1;
      }
    }
    if (next >= this.offset) {
      return this.stop(this.at + 1, quote);
    }
    this.token(value);
    this.at = next + 1;
    return undefined;
  }

  regex(): Scan | undefined {
    let next = this.at + 1;
    while (next < this.text.length && this.text[next] !== '/' && this.text[next] !== '\n') {
      next += this.text[next] === '\\' ? 2 : 1;
    }
    if (next >= this.offset) {
      return this.stop(this.offset, '/');
    }
    next += 1;
    while (next < this.text.length && /[a-z]/.test(this.text[next] ?? '')) {
      next += 1;
    }
    this.token(undefined);
    this.at = next;
    return undefined;
  }

  word(): Scan | undefined {
    let next = this.at;
    while (next < this.text.length && wordCharacter.test(this.text[next] ?? '')) {
      next += 1;
    }
    if (next >= this.offset) {
      return this.stop(this.at);
    }
    const word = this.text.slice(this.at, next);
    let after = next;
    while (after < this.text.length && /\s/.test(this.text[after] ?? '')) {
      after += 1;
    }
    // A call such as ObjectId(…) or new Date(…): the value ends with its closing parenthesis.
    if (this.text[after] !== '(' && word !== 'new') {
      this.token(word);
    }
    this.at = next;
    return undefined;
  }

  open(type: '{' | '[' | '('): void {
    const parent = this.top();
    const key = parent?.type === '{' ? (parent.currentKey ?? null) : parent?.type === '(' ? parent.key : null;
    this.frames.push({ type, key, state: 'key' });
    this.at += 1;
  }

  close(character: string): void {
    this.frames.pop();
    this.token(undefined);
    if (this.frames.length === 0 && character !== ')') {
      this.done = true;
    }
    this.at += 1;
  }

  punctuation(character: string): void {
    const frame = this.top();
    if (frame?.type === '{' && character === ':') {
      frame.state = 'value';
    } else if (frame?.type === '{' && character === ',') {
      frame.state = 'key';
      frame.currentKey = undefined;
    }
    this.at += 1;
  }

  step(): Scan | undefined {
    const character = this.text[this.at] ?? '';
    const next = this.text[this.at + 1];
    if (/\s/.test(character)) {
      this.at += 1;
    } else if (character === '/' && (next === '/' || next === '*')) {
      return next === '/' ? this.comment('\n', '//') : this.comment('*/', '/*');
    } else if (character === '"' || character === "'" || character === '`') {
      return this.string(character);
    } else if (character === '/' && this.top()?.state !== 'key') {
      return this.regex();
    } else if (wordCharacter.test(character)) {
      return this.word();
    } else if (character === '{' || character === '[' || character === '(') {
      this.open(character);
    } else if (character === '}' || character === ']' || character === ')') {
      this.close(character);
    } else {
      this.punctuation(character);
    }
    return undefined;
  }
}

/** Where the cursor at `offset` stands in `text`. */
export function scanned(text: string, offset: number): Scan {
  const scanner = new Scanner(text, offset);
  while (scanner.at < offset) {
    const stopped = scanner.step();
    if (stopped !== undefined) {
      return stopped;
    }
  }
  if (scanner.frames.length === 0 && scanner.rootAfter) {
    scanner.done = true;
  }
  return scanner.stop(offset);
}
