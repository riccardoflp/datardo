/**
 * Feature: value.typed-bytes — turns the text of an editor back into bytes, by the format it was typed in, changing
 * nothing the user did not type: text untouched gives the original bytes, a compact JSON value stays compact, and
 * hexadecimal is read two digits a byte.
 */
import { compactJson, hexPairs, jsonTokens, shown, type Format } from './format';
import { isUtf8, utf8, utf8Text } from './types';

/** The bytes saved, with the note the editor shows under itself; or why the text cannot be read. */
export type Typed = { readonly bytes: Uint8Array; readonly note?: string } | { readonly problem: string };

/** What is typed, in which format: what an editor or a form sends. */
export interface TypedText {
  readonly text: string;
  readonly format: Format;
}

/** The texts of this card. */
export const typedText = {
  notJson: (problem: string): string => `Not valid JSON: ${problem}`,
  formatted: 'Saved as formatted here: the original spacing is not kept. Use Text to keep it.',
  oddDigits: (count: number): string => `Hexadecimal needs two digits a byte: ${String(count)} digits found.`,
  notHex: (character: string, position: number): string =>
    `Not hexadecimal: ${JSON.stringify(character)} at position ${String(position)}.`,
};

/** Whether the original value's first line break is a carriage return and a line feed. */
function breaksWithReturn(original: Uint8Array | undefined): boolean {
  const index = original?.indexOf(0x0a) ?? -1;
  return index > 0 && original?.[index - 1] === 0x0d;
}

function fromText(text: string, original: Uint8Array | undefined): Typed {
  const written = breaksWithReturn(original) ? text.replace(/(?<!\r)\n/gu, '\r\n') : text;
  return { bytes: utf8(written) };
}

/** Whether the original bytes are JSON written with no white space between its tokens. */
function isCompactJson(original: Uint8Array | undefined): boolean {
  if (original === undefined || !isUtf8(original)) {
    return false;
  }
  const text = utf8Text(original);
  const read = jsonTokens(text);
  return !('problem' in read) && compactJson(read.tokens) === text;
}

function fromJson(text: string, original: Uint8Array | undefined): Typed {
  const read = jsonTokens(text);
  if ('problem' in read) {
    return { problem: typedText.notJson(read.problem) };
  }
  if (isCompactJson(original)) {
    return { bytes: utf8(compactJson(read.tokens)) };
  }
  return original === undefined && !text.includes('\n')
    ? { bytes: utf8(text) }
    : { bytes: utf8(text), note: typedText.formatted };
}

/** A line of the full hexadecimal form: the offset, the pairs, and the same bytes as ASCII between `|`. */
const dumpLine = /^[0-9a-fA-F]{8} {2}((?:[0-9a-fA-F]{2} {1,2}){0,15}[0-9a-fA-F]{2})\s*\|.*\|$/u;

/** The text without the offsets and the ASCII of the full form, when every line has that form. */
function withoutDump(text: string): string {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
  const pairs = lines.map((line) => dumpLine.exec(line)?.[1]);
  return lines.length > 0 && pairs.every((each) => each !== undefined) ? pairs.join(' ') : text;
}

function fromHex(typed: string): Typed {
  const text = withoutDump(typed);
  const digits: string[] = [];
  for (const [index, character] of Array.from(text).entries()) {
    if (/[0-9a-fA-F]/u.test(character)) {
      digits.push(character);
    } else if (!/\s/u.test(character)) {
      return { problem: typedText.notHex(character, index + 1) };
    }
  }
  if (digits.length % 2 === 1) {
    return { problem: typedText.oddDigits(digits.length) };
  }
  const bytes = new Uint8Array(digits.length / 2);
  bytes.forEach((_, index) => {
    bytes[index] = Number.parseInt(`${digits[index * 2] ?? '0'}${digits[index * 2 + 1] ?? '0'}`, 16);
  });
  return { bytes };
}

/** Whether the text is what the editor showed of the original bytes in this format. */
function isAsShown(text: string, format: Format, original: Uint8Array): boolean {
  return text === shown(original, format, 'full').text || (format === 'hex' && text === hexPairs(original));
}

/**
 * Feature: value.typed-bytes — the bytes of a text typed as **Text**, **JSON** or **Hex**, from the bytes the editor
 * started from (`undefined` for a new value), or why the text cannot be read.
 */
export function typedBytes(text: string, format: Format, original?: Uint8Array): Typed {
  if (original !== undefined && isAsShown(text, format, original)) {
    return { bytes: original };
  }
  switch (format) {
    case 'text':
      return fromText(text, original);
    case 'json':
      return fromJson(text, original);
    case 'hex':
      return fromHex(text);
  }
}

/** What an answer holds of a text typed in a format: `{ text, format }`; a bare text is **Text**. */
export function typedTextOf(value: unknown): TypedText | undefined {
  if (typeof value === 'string') {
    return { text: value, format: 'text' };
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { text, format } = value as { readonly text?: unknown; readonly format?: unknown };
  const known = format === 'json' || format === 'hex' ? format : 'text';
  return typeof text === 'string' ? { text, format: known } : undefined;
}
