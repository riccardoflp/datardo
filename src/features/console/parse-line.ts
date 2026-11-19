/**
 * Feature: console.parse-line
 *
 * Turns the line the user typed into the arguments the server receives, with the quoting rules of `redis-cli`
 * (`sdssplitargs` in Redis's `sds.c`), so that a line copied from a terminal or from Redis's documentation means the
 * same in Datardo. Text is encoded as UTF-8; `\xNN` inside double quotes is the only way to write a byte that is not
 * text.
 */
import { text } from './text';
import type { CommandArguments } from './types';

/** Where an argument is in the line: from `start` to `end` (excluded), in UTF-16 code units. */
export interface ArgumentSpan {
  readonly start: number;
  readonly end: number;
}

/** What a line reads as: its arguments with where each is, or why it cannot be read and at which column (from 1). */
export type ReadLine =
  | { readonly kind: 'arguments'; readonly arguments: CommandArguments; readonly spans: readonly ArgumentSpan[] }
  | { readonly kind: 'invalid'; readonly column: number; readonly message: string };

type Invalid = Extract<ReadLine, { kind: 'invalid' }>;

/** The bytes of one argument, gathered from text and from bytes written as `\xNN`. */
class ArgumentBytes {
  private readonly chunks: Uint8Array[] = [];
  private pending = '';

  addText(characters: string): void {
    this.pending += characters;
  }

  addByte(byte: number): void {
    this.flush();
    this.chunks.push(Uint8Array.of(byte));
  }

  bytes(): Uint8Array {
    this.flush();
    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private flush(): void {
    if (this.pending !== '') {
      this.chunks.push(new TextEncoder().encode(this.pending));
      this.pending = '';
    }
  }
}

const escapes: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', a: '\u0007' };

function isSeparator(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

function isHexDigit(character: string | undefined): boolean {
  return character !== undefined && /^[0-9a-fA-F]$/u.test(character);
}

function unclosed(open: number): Invalid {
  return { kind: 'invalid', column: open + 1, message: text.parseLine.unclosed(open + 1) };
}

/** The end of a quoted part after its closing quote at `close`, or the refusal when no space follows it. */
function afterClosing(line: string, close: number): number | Invalid {
  const next = line[close + 1];
  return next === undefined || isSeparator(next)
    ? close + 1
    : { kind: 'invalid', column: close + 1, message: text.parseLine.closingQuote(close + 1) };
}

/** Text in double quotes from `open`: the escapes `\n`, `\r`, `\t`, `\b`, `\a`, `\xNN`, and `\` before any other. */
function readDoubleQuoted(line: string, open: number, bytes: ArgumentBytes): number | Invalid {
  let index = open + 1;
  while (index < line.length) {
    const character = line[index] ?? '';
    const next = line[index + 1];
    if (character === '\\' && next !== undefined) {
      if (next === 'x' && isHexDigit(line[index + 2]) && isHexDigit(line[index + 3])) {
        bytes.addByte(Number.parseInt(line.slice(index + 2, index + 4), 16));
        index += 4;
      } else {
        bytes.addText(escapes[next] ?? next);
        index += 2;
      }
    } else if (character === '"') {
      return afterClosing(line, index);
    } else {
      bytes.addText(character);
      index += 1;
    }
  }
  return unclosed(open);
}

/** Text in single quotes from `open`: only `\'` is an escape. */
function readSingleQuoted(line: string, open: number, bytes: ArgumentBytes): number | Invalid {
  let index = open + 1;
  while (index < line.length) {
    const character = line[index] ?? '';
    if (character === '\\' && line[index + 1] === "'") {
      bytes.addText("'");
      index += 2;
    } else if (character === "'") {
      return afterClosing(line, index);
    } else {
      bytes.addText(character);
      index += 1;
    }
  }
  return unclosed(open);
}

/** One argument from `start`, which is not a separator: where it ends and its bytes. */
function readArgument(line: string, start: number): { readonly end: number; readonly bytes: Uint8Array } | Invalid {
  const bytes = new ArgumentBytes();
  let index = start;
  while (index < line.length && !isSeparator(line[index])) {
    const character = line[index] ?? '';
    if (character === '"' || character === "'") {
      const end = character === '"' ? readDoubleQuoted(line, index, bytes) : readSingleQuoted(line, index, bytes);
      if (typeof end !== 'number') {
        return end;
      }
      index = end;
    } else {
      bytes.addText(character);
      index += 1;
    }
  }
  return { end: index, bytes: bytes.bytes() };
}

/** Feature: console.parse-line — the arguments of a line, or why it cannot be read. */
export function commandArguments(line: string): ReadLine {
  const found: Uint8Array[] = [];
  const spans: ArgumentSpan[] = [];
  let index = 0;
  for (;;) {
    while (isSeparator(line[index])) {
      index += 1;
    }
    if (index >= line.length) {
      return { kind: 'arguments', arguments: found, spans };
    }
    const argument = readArgument(line, index);
    if ('kind' in argument) {
      return argument;
    }
    found.push(argument.bytes);
    spans.push({ start: index, end: argument.end });
    index = argument.end;
  }
}
