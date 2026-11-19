/**
 * The text read up to the cursor: the objects, arrays and calls still open around it, and where the word at the cursor
 * starts. Nothing is evaluated (D10). Ported from Mongoster's `src/shared/complete.ts` (`scan`).
 */

/** An object, an array or a call still open at the cursor. */
export interface Frame {
  readonly type: '{' | '[' | '(';
  /** The key this container is the value of; `null` for an element of an array or the root. */
  readonly key: string | null;
  /** In an object: a key is expected, then a colon, then a value, then a comma. */
  state: 'key' | 'colon' | 'value' | 'after';
  currentKey?: string | undefined;
}

/** What the text is at the cursor. */
export interface Scan {
  readonly frames: readonly Frame[];
  /** The root value is complete: the cursor is after it. */
  readonly done: boolean;
  /** Where the word at the cursor starts. */
  readonly tokenStart: number;
  /** The quote of the string the cursor is in, or `//`, `/*` or `/` inside a comment or a regex. */
  readonly quote?: string;
}

/** A character of a word: a key, a number, `$field`, `true`. */
export const wordCharacter = /[\w$.]/u;

class Scanner {
  readonly frames: Frame[] = [];
  done = false;
  rootAfter = false;
  index = 0;

  constructor(
    readonly text: string,
    readonly cursor: number,
  ) {}

  top(): Frame | undefined {
    return this.frames[this.frames.length - 1];
  }

  /** A whole value or key was read. */
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
    const scan = { frames: this.frames, done: this.done, tokenStart };
    return quote === undefined ? scan : { ...scan, quote };
  }

  comment(close: string, quote: string): Scan | undefined {
    const end = this.text.indexOf(close, this.index + 2);
    if (end < 0 || end + close.length > this.cursor) {
      return this.stop(this.cursor, quote);
    }
    this.index = end + close.length;
    return undefined;
  }

  string(quote: string): Scan | undefined {
    let end = this.index + 1;
    let value = '';
    while (end < this.text.length && this.text[end] !== quote) {
      const character = this.text[end] ?? '';
      value += character === '\\' ? (this.text[end + 1] ?? '') : character;
      end += character === '\\' ? 2 : 1;
    }
    if (end >= this.cursor) {
      return this.stop(this.index + 1, quote);
    }
    this.token(value);
    this.index = end + 1;
    return undefined;
  }

  regex(): Scan | undefined {
    let end = this.index + 1;
    while (end < this.text.length && this.text[end] !== '/' && this.text[end] !== '\n') {
      end += this.text[end] === '\\' ? 2 : 1;
    }
    if (end >= this.cursor) {
      return this.stop(this.cursor, '/');
    }
    end += 1;
    while (end < this.text.length && /[a-z]/u.test(this.text[end] ?? '')) {
      end += 1;
    }
    this.token(undefined);
    this.index = end;
    return undefined;
  }

  word(): Scan | undefined {
    let end = this.index;
    while (end < this.text.length && wordCharacter.test(this.text[end] ?? '')) {
      end += 1;
    }
    if (end >= this.cursor) {
      return this.stop(this.index);
    }
    const word = this.text.slice(this.index, end);
    let next = end;
    while (next < this.text.length && /\s/u.test(this.text[next] ?? '')) {
      next += 1;
    }
    // A call such as ObjectId(…) or new Date(…) ends with its closing parenthesis.
    if (this.text[next] !== '(' && word !== 'new') {
      this.token(word);
    }
    this.index = end;
    return undefined;
  }

  open(type: Frame['type']): void {
    const parent = this.top();
    const key = parent?.type === '{' ? (parent.currentKey ?? null) : parent?.type === '(' ? parent.key : null;
    this.frames.push({ type, key, state: 'key' });
  }

  close(character: string): void {
    this.frames.pop();
    this.token(undefined);
    if (this.frames.length === 0 && character !== ')') {
      this.done = true;
    }
  }

  punctuation(character: string): void {
    const frame = this.top();
    if (frame?.type !== '{') {
      return;
    }
    if (character === ':') {
      frame.state = 'value';
    } else if (character === ',') {
      frame.state = 'key';
      frame.currentKey = undefined;
    }
  }

  structure(character: string): void {
    if (character === '{' || character === '[' || character === '(') {
      this.open(character);
    } else if (character === '}' || character === ']' || character === ')') {
      this.close(character);
    } else {
      this.punctuation(character);
    }
    this.index += 1;
  }

  /** Reads one token; a scan when the cursor is inside it. */
  step(): Scan | undefined {
    const character = this.text[this.index] ?? '';
    const next = this.text[this.index + 1];
    if (/\s/u.test(character)) {
      this.index += 1;
      return undefined;
    }
    if (character === '/' && (next === '/' || next === '*')) {
      return next === '/' ? this.comment('\n', '//') : this.comment('*/', '/*');
    }
    if (character === '"' || character === "'" || character === '`') {
      return this.string(character);
    }
    if (character === '/' && this.top()?.state !== 'key') {
      return this.regex();
    }
    if (wordCharacter.test(character)) {
      return this.word();
    }
    this.structure(character);
    return undefined;
  }

  run(): Scan {
    while (this.index < this.cursor) {
      const stopped = this.step();
      if (stopped !== undefined) {
        return stopped;
      }
    }
    if (this.frames.length === 0 && this.rootAfter) {
      this.done = true;
    }
    return this.stop(this.cursor);
  }
}

/** What `text` is at `cursor`. */
export function scan(text: string, cursor: number): Scan {
  return new Scanner(text, cursor).run();
}
