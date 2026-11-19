/**
 * Feature: value.format — decides whether bytes are shown as text, as formatted JSON or in hexadecimal, and writes
 * them so, in the full form of an editor or the compact form of a cell. What the user chooses wins over what it
 * decides. Nothing is decompressed or decoded: bytes that are not text are shown in hexadecimal.
 *
 * JSON is read by its own tokenizer (RFC 8259), so that formatting changes only the white space between tokens: every
 * number keeps its digits, every string its escapes, every object the order and the repetitions of its names.
 */
import { groupThousands } from '../../shared/text-units';
import { byteUnits, isControl, isUtf8, utf8Text, type ByteUnit } from './types';

/** How bytes are shown. */
export type Format = 'text' | 'json' | 'hex';

/** The two forms of a value (glossary): in a cell or the inspector island, and in an editor. */
export type Form = 'full' | 'compact';

/** What `value.format` gives: the format, its text, a note when the choice could not be kept, and whether it can be edited. */
export interface Shown {
  readonly format: Format;
  readonly text: string;
  readonly editable: boolean;
  readonly note?: string;
}

/** Text is shown as JSON with no choice only up to 1,048,576 bytes (Datardo's choice). */
export const jsonLimit = 1_048_576;

/** A cell shows the first 200 characters of a text (Datardo's choice). */
export const compactCharacters = 200;

/** A cell shows the first 32 bytes of a value that is not text (Datardo's choice). */
export const compactBytes = 32;

/** JSON nested deeper than this is not read (R14.4). */
export const jsonDepth = 1000;

/** The notes of a choice that could not be kept. */
export const formatText = {
  notUtf8: 'Not valid UTF-8: the bytes that are not text are shown as �. Edit the value as Hex.',
  controls: 'Holds control characters: edit the value as Hex.',
  notJson: (problem: string): string => `Not JSON: ${problem}`,
};

/** A token of JSON as it is written. */
export interface JsonToken {
  readonly kind: 'open' | 'close' | 'colon' | 'comma' | 'scalar';
  readonly text: string;
  readonly at: number;
}

/** The tokens of a JSON text, or the parser's problem with its line and column. */
export type JsonRead = { readonly tokens: readonly JsonToken[] } | { readonly problem: string };

function where(text: string, index: number): string {
  const before = text.slice(0, index).split('\n');
  return `line ${String(before.length)}, column ${String((before.at(-1) ?? '').length + 1)}`;
}

const scalarPatterns = [
  /"(?:[ !#-[\]-\u{10FFFF}]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"/uy,
  /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy,
  /true|false|null/uy,
];

const punctuation: Readonly<Record<string, JsonToken['kind']>> = {
  '{': 'open',
  '[': 'open',
  '}': 'close',
  ']': 'close',
  ':': 'colon',
  ',': 'comma',
};

/** The tokens of a text, or the first character that starts none. */
function lexed(text: string): { readonly tokens: JsonToken[] } | { readonly problem: string } {
  const tokens: JsonToken[] = [];
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (' \t\n\r'.includes(character)) {
      index += 1;
      continue;
    }
    const kind = punctuation[character];
    if (kind !== undefined) {
      tokens.push({ kind, text: character, at: index });
      index += 1;
      continue;
    }
    const length = scalarPatterns.reduce((found, pattern) => {
      pattern.lastIndex = index;
      return found > 0 ? found : (pattern.exec(text)?.[0].length ?? 0);
    }, 0);
    if (length === 0) {
      return { problem: `Unexpected character ${JSON.stringify(character)} at ${where(text, index)}` };
    }
    tokens.push({ kind: 'scalar', text: text.slice(index, index + length), at: index });
    index += length;
  }
  return { tokens };
}

type Expecting = 'value' | 'first-value' | 'name' | 'first-name' | 'colon' | 'after';

/** What is expected after a token, or undefined when the token cannot come there. */
function nextExpected(expecting: Expecting, token: JsonToken, stack: string[]): Expecting | undefined {
  const top = stack.at(-1);
  const closes = token.kind === 'close' && (token.text === '}' ? top === '{' : top === '[');
  switch (expecting) {
    case 'value':
    case 'first-value':
      if (token.kind === 'open') {
        stack.push(token.text);
        return token.text === '{' ? 'first-name' : 'first-value';
      }
      if (expecting === 'first-value' && closes) {
        stack.pop();
        return 'after';
      }
      return token.kind === 'scalar' ? 'after' : undefined;
    case 'name':
    case 'first-name':
      if (expecting === 'first-name' && closes) {
        stack.pop();
        return 'after';
      }
      return token.kind === 'scalar' && token.text.startsWith('"') ? 'colon' : undefined;
    case 'colon':
      return token.kind === 'colon' ? 'value' : undefined;
    case 'after':
      if (token.kind === 'comma' && top !== undefined) {
        return top === '{' ? 'name' : 'value';
      }
      if (!closes) {
        return undefined;
      }
      stack.pop();
      return 'after';
  }
}

/** The tokens of a JSON text (RFC 8259), or the parser's problem: `Unexpected "}" at line 1, column 6`. */
export function jsonTokens(text: string): JsonRead {
  const lexedText = lexed(text);
  if ('problem' in lexedText) {
    return lexedText;
  }
  const stack: string[] = [];
  let expecting: Expecting = 'value';
  for (const token of lexedText.tokens) {
    const next = nextExpected(expecting, token, stack);
    if (next === undefined) {
      return { problem: `Unexpected ${JSON.stringify(token.text)} at ${where(text, token.at)}` };
    }
    if (stack.length > jsonDepth) {
      return { problem: `Nested more than ${groupThousands(jsonDepth)} levels at ${where(text, token.at)}` };
    }
    expecting = next;
  }
  if (expecting !== 'after' || stack.length > 0) {
    return { problem: `Unexpected end of the text at ${where(text, text.length)}` };
  }
  return lexedText;
}

/** The parser's problem with a JSON text, or undefined when it parses. */
export function jsonProblem(text: string): string | undefined {
  const read = jsonTokens(text);
  return 'problem' in read ? read.problem : undefined;
}

/** The tokens indented by two spaces, one member or element a line; an empty object or array stays on its line. */
export function prettyJson(tokens: readonly JsonToken[]): string {
  let text = '';
  let depth = 0;
  const newLine = (): string => `\n${'  '.repeat(depth)}`;
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    if (token.kind === 'open') {
      depth += tokens[index + 1]?.kind === 'close' ? 0 : 1;
      text += tokens[index + 1]?.kind === 'close' ? token.text : `${token.text}${newLine()}`;
    } else if (token.kind === 'close') {
      depth -= previous?.kind === 'open' ? 0 : 1;
      text += previous?.kind === 'open' ? token.text : `${newLine()}${token.text}`;
    } else if (token.kind === 'comma') {
      text += `,${newLine()}`;
    } else {
      text += token.kind === 'colon' ? ': ' : token.text;
    }
  });
  return text;
}

/** The tokens with no white space between them: the compact form of a JSON text. */
export function compactJson(tokens: readonly JsonToken[]): string {
  return tokens.map((token) => token.text).join('');
}

/** The bytes as text, each byte that starts no character as `�`, and each control character by `picture`. */
function unitsText(units: readonly ByteUnit[], picture: (codePoint: number) => string): string {
  return units.map((unit) => (unit.kind === 'byte' ? '�' : picture(unit.codePoint))).join('');
}

/** The picture of a control character (`␀`, `␛`, `␡`); `�` for the controls of Latin-1, which have none. */
function controlPicture(codePoint: number): string {
  if (!isControl(codePoint)) {
    return String.fromCodePoint(codePoint);
  }
  if (codePoint <= 0x1f) {
    return String.fromCodePoint(0x2400 + codePoint);
  }
  return codePoint === 0x7f ? '␡' : '�';
}

/** The format chosen with no choice (rules 1 to 5 of the card). */
export function decidedFormat(bytes: Uint8Array): Format {
  if (bytes.length === 0) {
    return 'text';
  }
  const units = byteUnits(bytes);
  if (units.some((unit) => unit.kind === 'byte' || isControl(unit.codePoint))) {
    return 'hex';
  }
  if (bytes.length > jsonLimit) {
    return 'text';
  }
  const text = unitsText(units, (codePoint) => String.fromCodePoint(codePoint));
  return /^[ \t\n\r]*[{[]/u.test(text) && jsonProblem(text) === undefined ? 'json' : 'text';
}

/** The bytes as pairs of lower-case hexadecimal digits with a space between: `68 65 6c 6c 6f`. */
export function hexPairs(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

/** Lines of 16 bytes: the offset, the bytes in two groups of 8, and the same bytes as ASCII between `|`. */
export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const line = bytes.subarray(offset, offset + 16);
    const left = hexPairs(line.subarray(0, 8)).padEnd(23);
    const right = hexPairs(line.subarray(8)).padEnd(23);
    const ascii = Array.from(line, (byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${left}  ${right}  |${ascii}|`);
  }
  return lines.join('\n');
}

/** A text on one line for a cell: a line break as `↵`, a tab as `→`, cut after 200 characters with `…`. */
export function oneLine(text: string): string {
  const characters = Array.from(text.replace(/\r\n|\r|\n/gu, '↵').replaceAll('\t', '→'));
  return characters.length > compactCharacters
    ? `${characters.slice(0, compactCharacters).join('')}…`
    : characters.join('');
}

/** The first 32 bytes as pairs, then `…` and the length: `00 01 … (1,024 bytes)`. */
export function compactHex(bytes: Uint8Array): string {
  if (bytes.length <= compactBytes) {
    return hexPairs(bytes);
  }
  return `${hexPairs(bytes.subarray(0, compactBytes))}… (${groupThousands(bytes.length)} bytes)`;
}

function hexShown(bytes: Uint8Array, form: Form): Shown {
  return { format: 'hex', text: form === 'full' ? hexDump(bytes) : compactHex(bytes), editable: form === 'full' };
}

function textShown(bytes: Uint8Array, form: Form): Shown {
  const units = byteUnits(bytes);
  const invalid = units.some((unit) => unit.kind === 'byte');
  const controls = !invalid && units.some((unit) => unit.kind === 'character' && isControl(unit.codePoint));
  const text = unitsText(units, controlPicture);
  const written = form === 'full' ? text : oneLine(text);
  if (invalid) {
    return { format: 'text', text: written, editable: false, note: formatText.notUtf8 };
  }
  return controls
    ? { format: 'text', text: written, editable: false, note: formatText.controls }
    : { format: 'text', text: written, editable: form === 'full' };
}

function jsonShown(bytes: Uint8Array, form: Form): Shown {
  if (!isUtf8(bytes)) {
    return textShown(bytes, form);
  }
  const text = utf8Text(bytes);
  const read = jsonTokens(text);
  if ('problem' in read) {
    return { ...textShown(bytes, form), note: formatText.notJson(read.problem) };
  }
  return { format: 'json', text: form === 'full' ? prettyJson(read.tokens) : oneLine(text), editable: form === 'full' };
}

/**
 * Feature: value.format — the bytes as shown, in the format chosen or, with no choice, the one the card's rules
 * decide; in the full form of an editor or the compact form of a cell.
 */
export function shown(bytes: Uint8Array, choice: Format | undefined, form: Form): Shown {
  switch (choice ?? decidedFormat(bytes)) {
    case 'hex':
      return hexShown(bytes, form);
    case 'json':
      return jsonShown(bytes, form);
    case 'text':
      return textShown(bytes, form);
  }
}
