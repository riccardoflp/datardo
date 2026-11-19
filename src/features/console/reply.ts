/**
 * Feature: console.reply
 *
 * Writes a reply of the server as lines of text that say what type each part is, close to what `redis-cli` prints, so
 * that nil, an empty string, the text `nil` and the number 0 never look alike. A bulk string is written in double
 * quotes so that `console.parse-line` reads the same bytes back. Nothing is cut here: `console.output` decides how
 * much is drawn.
 */
import { characters } from '../../shared/text-units';
import type { CommandArguments, Protocol, Reply } from './types';
import { upperWords } from './types';

/** The color a line of a reply is drawn in. */
export type ReplyLineKind = 'value' | 'error' | 'note';

/** One line of a reply, with the bulk strings it shows, for **Copy value** and the inspector island. */
export interface ReplyLine {
  readonly text: string;
  readonly kind: ReplyLineKind;
  readonly strings: readonly Uint8Array[];
}

/** The commands whose bulk string is written as a verbatim string on RESP2, as `redis-cli` does. */
const verbatimOnResp2: ReadonlySet<string> = new Set([
  'INFO',
  'CLIENT LIST',
  'CLIENT INFO',
  'MEMORY DOCTOR',
  'MEMORY MALLOC-STATS',
  'LATENCY DOCTOR',
  'CLUSTER INFO',
  'CLUSTER NODES',
]);

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const lenientUtf8 = new TextDecoder('utf-8', { ignoreBOM: true });

/** The text of bytes that are valid UTF-8, or undefined. */
export function utf8Text(bytes: Uint8Array): string | undefined {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    // Not valid UTF-8: the caller writes the bytes one by one.
    return undefined;
  }
}

function value(line: string): ReplyLine {
  return { text: line, kind: 'value', strings: [] };
}

function hexByte(byte: number): string {
  return `\\x${byte.toString(16).padStart(2, '0')}`;
}

const characterEscapes: Readonly<Record<string, string>> = {
  '"': '\\"',
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\u0007': '\\a',
};

function escapedCharacter(character: string): string {
  const escape = characterEscapes[character];
  if (escape !== undefined) {
    return escape;
  }
  return /^\p{Cc}$/u.test(character) ? [...new TextEncoder().encode(character)].map(hexByte).join('') : character;
}

function escapedByte(byte: number): string {
  if (byte === 0x22) {
    return '\\"';
  }
  if (byte === 0x5c) {
    return '\\\\';
  }
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : hexByte(byte);
}

/** A bulk string in double quotes: as text when it is valid UTF-8, byte by byte otherwise. */
export function quotedString(bytes: Uint8Array): string {
  const decoded = utf8Text(bytes);
  const inside =
    decoded === undefined ? [...bytes].map(escapedByte).join('') : characters(decoded).map(escapedCharacter).join('');
  return `"${inside}"`;
}

function doubleText(number: number): string {
  if (Number.isNaN(number)) {
    return 'nan';
  }
  if (!Number.isFinite(number)) {
    return number > 0 ? 'inf' : '-inf';
  }
  return String(number);
}

function textLines(text: string): readonly ReplyLine[] {
  const lines = text.split(/\r?\n/u);
  if (lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map(value);
}

/** The lines of a part, under a prefix: the first line after it, the others under the first. */
function under(prefix: string, lines: readonly ReplyLine[]): readonly ReplyLine[] {
  const indent = ' '.repeat(prefix.length);
  return lines.map((line, index) => ({ ...line, text: `${index === 0 ? prefix : indent}${line.text}` }));
}

function numbered(index: number, count: number, mark: string): string {
  return `${String(index + 1).padStart(String(count).length)}${mark} `;
}

function aggregateLines(items: readonly Reply[], mark: string, empty: string): readonly ReplyLine[] {
  if (items.length === 0) {
    return [value(empty)];
  }
  return items.flatMap((item, index) => under(numbered(index, items.length, mark), linesOf(item)));
}

function pairLines(key: Reply, each: Reply): readonly ReplyLine[] {
  const keyLines = linesOf(key);
  const last = keyLines[keyLines.length - 1] ?? value('');
  const valueLines = under(`${last.text} => `, linesOf(each)).map((line, index) =>
    index === 0 ? { ...line, strings: [...last.strings, ...line.strings] } : line,
  );
  return [...keyLines.slice(0, -1), ...valueLines];
}

function mapLines(entries: readonly (readonly [Reply, Reply])[]): readonly ReplyLine[] {
  if (entries.length === 0) {
    return [value('(empty map)')];
  }
  return entries.flatMap(([key, each], index) => under(numbered(index, entries.length, '#'), pairLines(key, each)));
}

function linesOf(reply: Reply): readonly ReplyLine[] {
  switch (reply.kind) {
    case 'null':
      return [value('(nil)')];
    case 'integer':
      return [value(`(integer) ${reply.value.toString()}`)];
    case 'simple':
      return [value(reply.text)];
    case 'bulk':
      return [{ text: quotedString(reply.bytes), kind: 'value', strings: [reply.bytes] }];
    case 'verbatim':
      return textLines(reply.text);
    case 'double':
      return [value(`(double) ${doubleText(reply.value)}`)];
    case 'boolean':
      return [value(reply.value ? '(true)' : '(false)')];
    case 'big-number':
      return [value(`(big number) ${reply.digits}`)];
    case 'error':
      return [{ text: `(error) ${reply.message}`, kind: 'error', strings: [] }];
    case 'array':
      return aggregateLines(reply.items, ')', '(empty array)');
    case 'set':
      return aggregateLines(reply.items, '~', '(empty set)');
    case 'push':
      return under('(push) ', aggregateLines(reply.items, ')', '(empty array)'));
    case 'map':
      return mapLines(reply.entries);
  }
}

function isVerbatimOnResp2(command: CommandArguments): boolean {
  const [name = '', second] = upperWords(command);
  return verbatimOnResp2.has(name) || (second !== undefined && verbatimOnResp2.has(`${name} ${second}`));
}

/** Feature: console.reply — the lines of a reply to `command`, read in `protocol`. */
export function replyLines(reply: Reply, command: CommandArguments, protocol: Protocol): readonly ReplyLine[] {
  if (protocol === 2 && reply.kind === 'bulk' && isVerbatimOnResp2(command)) {
    return textLines(lenientUtf8.decode(reply.bytes));
  }
  return linesOf(reply);
}
