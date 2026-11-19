/**
 * Feature: console.autocomplete
 *
 * Offers, as the user types, the commands whose name starts with the first word, and the subcommands of a command
 * that has them in the second word; nothing anywhere else, and nothing inside quotes. Deprecated commands come after
 * the others, each with what replaces it. A suggestion writes the name in upper case, in place of the word typed,
 * followed by one space.
 */
import { commandArguments } from './parse-line';
import { text } from './text';
import type { CommandDoc } from './types';

/** One suggestion of the list. */
export interface Suggestion {
  /** What it writes: `GETRANGE`, `REWRITE`. */
  readonly name: string;
  readonly summary: string;
  /** *deprecated since 2.0.0: use GETRANGE*, for a deprecated command. */
  readonly deprecated?: string;
}

/** The list, and the part of the line a suggestion replaces: from `from` to `to`, in UTF-16 code units. */
export interface Suggestions {
  readonly from: number;
  readonly to: number;
  readonly items: readonly Suggestion[];
}

/** Whether the list was asked for with `Ctrl+Space`, which opens it with nothing typed. */
export type Opening = 'typing' | 'asked';

/** How many suggestions the list shows at a time; it scrolls for the others (Datardo's choice). */
export const suggestionsShown = 10;

function isSeparator(character: string | undefined): boolean {
  return character === ' ' || character === '\t';
}

/** The word the caret is in: its place among the words, its start, and what is typed of it before the caret. */
interface CaretWord {
  readonly index: number;
  readonly start: number;
  readonly typed: string;
  readonly words: readonly string[];
}

function caretWord(line: string, caret: number): CaretWord | undefined {
  const before = line.slice(0, caret);
  const read = commandArguments(before);
  if (read.kind === 'invalid') {
    return undefined;
  }
  const words = read.spans.map((span) => before.slice(span.start, span.end));
  const last = read.spans[read.spans.length - 1];
  if (last === undefined || last.end < caret) {
    return { index: words.length, start: caret, typed: '', words };
  }
  return { index: words.length - 1, start: last.start, typed: words[words.length - 1] ?? '', words };
}

function wordEnd(line: string, caret: number): number {
  let end = caret;
  while (end < line.length && !isSeparator(line[end])) {
    end += 1;
  }
  return end;
}

function suggestionOf(command: CommandDoc, name: string): Suggestion {
  const deprecated = command.deprecated;
  return {
    name,
    summary: command.summary,
    ...(deprecated === undefined
      ? {}
      : { deprecated: text.autocomplete.deprecated(deprecated.since, deprecated.replacedBy.replace(/[`!]/gu, '')) }),
  };
}

/** By name, the deprecated ones after the others. */
function ordered(items: readonly (readonly [CommandDoc, string])[]): readonly Suggestion[] {
  const byName = [...items].sort(([, first], [, second]) => (first < second ? -1 : first > second ? 1 : 0));
  return [
    ...byName.filter(([command]) => command.deprecated === undefined),
    ...byName.filter(([command]) => command.deprecated !== undefined),
  ].map(([command, name]) => suggestionOf(command, name));
}

function matching(
  commands: readonly CommandDoc[],
  typed: string,
  nameOf: (command: CommandDoc) => string,
): readonly Suggestion[] {
  const prefix = typed.toUpperCase();
  return ordered(
    commands.map((command) => [command, nameOf(command)] as const).filter(([, name]) => name.startsWith(prefix)),
  );
}

function candidates(word: CaretWord, docs: readonly CommandDoc[], opening: Opening): readonly Suggestion[] {
  if (/["']/u.test(word.typed)) {
    return [];
  }
  if (word.index === 0) {
    return word.typed === '' && opening === 'typing'
      ? []
      : matching(docs, word.typed, (each) => each.name.toUpperCase());
  }
  if (word.index !== 1) {
    return [];
  }
  const command = docs.find((each) => each.name === (word.words[0] ?? '').toLowerCase());
  const subcommands = command?.subcommands ?? [];
  return matching(subcommands, word.typed, (each) => each.name.slice(each.name.indexOf('|') + 1).toUpperCase());
}

/** Feature: console.autocomplete — the suggestions for the line the caret is on, or none: the list does not open. */
export function suggestions(
  line: string,
  caret: number,
  docs: readonly CommandDoc[],
  opening: Opening = 'typing',
): Suggestions | undefined {
  const word = caretWord(line, caret);
  if (word === undefined) {
    return undefined;
  }
  const items = candidates(word, docs, opening);
  return items.length === 0 ? undefined : { from: word.start, to: wordEnd(line, caret), items };
}

/** The line once a suggestion is taken (`Tab`), and the caret after the space that follows the name. */
export function lineWithSuggestion(
  line: string,
  list: Suggestions,
  chosen: Suggestion,
): { readonly line: string; readonly caret: number } {
  const after = line.slice(list.to);
  const space = isSeparator(after[0]) ? '' : ' ';
  const written = `${line.slice(0, list.from)}${chosen.name}${space}`;
  return { line: `${written}${after}`, caret: written.length + (space === '' ? 1 : 0) };
}
