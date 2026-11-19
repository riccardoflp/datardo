/**
 * Feature: key.import-parse
 *
 * Reads the text of an export back into keys and their commands, and refuses anything an export would not have
 * written, so that importing a file can never run a command the user did not expect (R14.4).
 */
import { text } from './text';
import type { KeyName } from './types';
import { hexOf, nameText } from './types';

/** The kind of a key in a file: one of the six types, or a key written as `RESTORE`. */
export type ImportedType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'restore';

/** A command of the file, with the line it is on, counted from 1. */
export interface ImportedCommand {
  readonly line: number;
  readonly words: readonly Uint8Array[];
}

/** A key of the file: its name, its type, and its commands in order (the union of its lines). */
export interface ImportedKey {
  readonly name: KeyName;
  readonly type: ImportedType;
  readonly commands: readonly ImportedCommand[];
}

/** The keys of a file in the order they first appear, or the first problem with its line. */
export type ImportedFile =
  | { readonly kind: 'keys'; readonly keys: readonly ImportedKey[] }
  | { readonly kind: 'error'; readonly line: number; readonly message: string };

/** A line split into arguments, or why it cannot be. */
type Split = { readonly kind: 'words'; readonly words: readonly Uint8Array[] } | { readonly kind: 'unbalanced' };

const encoder = new TextEncoder();
const blank = /[ \t\r\n]/u;
const doubleEscapes: Readonly<Record<string, number>> = { n: 10, r: 13, t: 9, b: 8, a: 7 };

/** A quoted part from `at` (the opening quote): its bytes and the place after the closing quote, or none. */
function quotedPart(characters: readonly string[], at: number): { bytes: number[]; next: number } | undefined {
  const quote = characters[at];
  const bytes: number[] = [];
  let index = at + 1;
  while (index < characters.length) {
    const character = characters[index] ?? '';
    const following = characters[index + 1] ?? '';
    if (character === quote) {
      return { bytes, next: index + 1 };
    }
    if (
      quote === '"' &&
      character === '\\' &&
      following === 'x' &&
      /^[0-9a-fA-F]{2}$/u.test(characters.slice(index + 2, index + 4).join(''))
    ) {
      bytes.push(Number.parseInt(characters.slice(index + 2, index + 4).join(''), 16));
      index += 4;
    } else if (character === '\\' && (quote === '"' ? following !== '' : following === "'")) {
      bytes.push(
        ...(quote === '"' && doubleEscapes[following] !== undefined
          ? [doubleEscapes[following]]
          : encoder.encode(following)),
      );
      index += 2;
    } else {
      bytes.push(...encoder.encode(character));
      index += 1;
    }
  }
  return undefined;
}

/** A line split as `redis-cli` splits it: at spaces and tabs, with double and single quotes. */
export function splitArguments(line: string): Split {
  const characters = Array.from(line);
  const words: Uint8Array[] = [];
  let index = 0;
  while (index < characters.length) {
    if (blank.test(characters[index] ?? '')) {
      index += 1;
      continue;
    }
    const bytes: number[] = [];
    while (index < characters.length && !blank.test(characters[index] ?? '')) {
      const character = characters[index] ?? '';
      if (character !== '"' && character !== "'") {
        bytes.push(...encoder.encode(character));
        index += 1;
        continue;
      }
      const part = quotedPart(characters, index);
      if (part === undefined || (part.next < characters.length && !blank.test(characters[part.next] ?? ''))) {
        return { kind: 'unbalanced' };
      }
      bytes.push(...part.bytes);
      index = part.next;
    }
    words.push(Uint8Array.from(bytes));
  }
  return { kind: 'words', words };
}

const decoder = new TextDecoder();
const word = (bytes: Uint8Array | undefined): string => (bytes === undefined ? '' : decoder.decode(bytes));
const isPairs = (count: number): boolean => count >= 2 && count % 2 === 0;
const isScore = (score: string): boolean =>
  /^[+-]?inf$/iu.test(score) || /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/u.test(score);

/** The problem of a command's arguments after the key, or none: what an export would not have written. */
function argumentsProblem(command: string, rest: readonly Uint8Array[]): string | undefined {
  switch (command) {
    case 'SET':
      return rest.length === 1 ? undefined : text.importParse.set;
    case 'APPEND':
      return rest.length === 1 ? undefined : text.importParse.append;
    case 'HSET':
      return isPairs(rest.length) ? undefined : text.importParse.hset;
    case 'RPUSH':
      return rest.length >= 1 ? undefined : text.importParse.rpush;
    case 'SADD':
      return rest.length >= 1 ? undefined : text.importParse.sadd;
    case 'ZADD':
      return isPairs(rest.length) && rest.every((each, index) => index % 2 === 1 || isScore(word(each)))
        ? undefined
        : text.importParse.zadd;
    case 'XADD':
      return xaddProblem(rest);
    case 'RESTORE':
      return rest.length === 2 && word(rest[0]) === '0' ? undefined : text.importParse.restore;
    case 'PEXPIREAT':
      return rest.length === 1 && /^\d+$/u.test(word(rest[0])) ? undefined : text.importParse.pexpireat;
    default:
      return text.importParse.only(command);
  }
}

function xaddProblem(rest: readonly Uint8Array[]): string | undefined {
  if (word(rest[0]) === '*') {
    return text.importParse.xaddId;
  }
  return /^\d+-\d+$/u.test(word(rest[0])) && isPairs(rest.length - 1) ? undefined : text.importParse.xadd;
}

const typeOfCommand: Readonly<Record<string, ImportedType>> = {
  SET: 'string',
  APPEND: 'string',
  HSET: 'hash',
  RPUSH: 'list',
  SADD: 'set',
  ZADD: 'zset',
  XADD: 'stream',
  RESTORE: 'restore',
};

const typeWords: Readonly<Record<ImportedType, string>> = {
  string: 'string',
  hash: 'hash',
  list: 'list',
  set: 'set',
  zset: 'sorted set',
  stream: 'stream',
  restore: 'restored key',
};

interface Building {
  readonly name: KeyName;
  readonly type: ImportedType;
  readonly commands: ImportedCommand[];
  /** The line of its `SET` or `RESTORE`. */
  readonly setAt?: number;
}

/** The problem of a command with the keys read so far, or none; the key it belongs to is changed when there is none. */
function addCommand(
  keys: Map<string, Building>,
  command: string,
  words: readonly Uint8Array[],
  line: number,
): string | undefined {
  const name = words[1] ?? new Uint8Array();
  const id = hexOf(name);
  const known = keys.get(id);
  const type = typeOfCommand[command];
  if (type === undefined) {
    if (known === undefined) {
      return text.importParse.noValue(nameText(name));
    }
    pushTo(keys, id, known, { line, words });
    return undefined;
  }
  if (known === undefined) {
    if (command === 'APPEND') {
      return text.importParse.appendFirst(nameText(name));
    }
    const isSet = command === 'SET' || command === 'RESTORE';
    keys.set(id, { name, type, commands: [{ line, words }], ...(isSet ? { setAt: line } : {}) });
    return undefined;
  }
  if (known.type !== type) {
    return text.importParse.otherType(nameText(name), typeWords[known.type]);
  }
  if ((command === 'SET' || command === 'RESTORE') && known.setAt !== undefined) {
    return text.importParse.alreadySet(nameText(name), known.setAt);
  }
  pushTo(keys, id, known, { line, words });
  return undefined;
}

function pushTo(keys: Map<string, Building>, id: string, known: Building, command: ImportedCommand): void {
  keys.set(id, { ...known, commands: [...known.commands, command] });
}

/** The problem of one line, or none: its arguments, its command, then what it does to its key. */
function lineProblem(keys: Map<string, Building>, line: string, number: number): string | undefined {
  const split = splitArguments(line);
  if (split.kind === 'unbalanced') {
    return text.importParse.unbalanced;
  }
  const command = word(split.words[0]).toUpperCase();
  const problem = argumentsProblem(command, split.words.slice(2));
  if (problem !== undefined || split.words.length < 2) {
    return problem ?? argumentsProblem(command, []);
  }
  return addCommand(keys, command, [encoder.encode(command), ...split.words.slice(1)], number);
}

/**
 * Feature: key.import-parse — the keys of a file, each with its type and its commands, or the first line that is not
 * one an export writes: *Line 12: only the commands Datardo exports can be imported (…): found FLUSHALL.*
 */
export function importedKeys(fileText: string): ImportedFile {
  const keys = new Map<string, Building>();
  const lines = fileText.split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '' || line.startsWith('#')) {
      continue;
    }
    const problem = lineProblem(keys, line, index + 1);
    if (problem !== undefined) {
      return { kind: 'error', line: index + 1, message: text.importParse.line(index + 1, problem) };
    }
  }
  return {
    kind: 'keys',
    keys: [...keys.values()].map(({ name, type, commands }) => ({ name, type, commands })),
  };
}
