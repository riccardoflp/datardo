/**
 * Feature: query.suggestions
 *
 * Decides, from the text before the cursor, whether a key or a value is expected there and of what, and gives the
 * suggestions in order. The text is read, never evaluated (R9.1).
 */
import { childPlace, rootPlace, type Place, type TextKind } from './completion/contexts';
import {
  keySuggestions,
  valueSuggestions,
  type KeySuggestion,
  type SearchIndexHint,
  type Suggestion,
} from './completion/items';
import { scanned, wordCharacter } from './completion/scan';
import type { FieldHint } from './field-hints';

export type { TextKind } from './completion/contexts';
export type { SearchIndexHint, Suggestion, SuggestionKind } from './completion/items';

/** What is suggested at the cursor. */
export interface Suggestions {
  /** The range of the text a suggestion replaces. */
  readonly from: number;
  readonly to: number;
  /** What was typed of it, without the opening quote. */
  readonly prefix: string;
  readonly position: 'key' | 'value';
  readonly items: readonly Suggestion[];
}

/** 0: no match. A prefix beats a prefix ignoring case and `$`, which beats a later segment, which beats a substring. */
function matchScore(label: string, prefix: string): number {
  if (prefix === '') {
    return 1;
  }
  const needle = prefix.toLowerCase();
  const bare = label.replace(/^"/, '');
  if (needle.startsWith('$') && !bare.startsWith('$')) {
    return 0;
  }
  const lower = bare.toLowerCase().replace(/^\$+/, '');
  const word = needle.replace(/^\$+/, '');
  if (label.startsWith(prefix) || bare.startsWith(prefix)) {
    return 6;
  }
  if (lower.startsWith(word)) {
    return 5;
  }
  if (lower.split('.').some((segment) => segment.startsWith(word))) {
    return 3;
  }
  return word.length >= 2 && lower.includes(word) ? 2 : 0;
}

function withValue(item: KeySuggestion, colon: boolean): Suggestion {
  const { template, cursor: _cursor, ...rest } = item;
  if (colon) {
    return rest;
  }
  const skeleton = template ?? '';
  const caret = skeleton.indexOf('|');
  const value = skeleton.replace('|', '');
  return {
    ...rest,
    insert: `${item.insert}: ${value}`,
    cursor: item.insert.length + 2 + (caret < 0 ? value.length : caret),
  };
}

interface Found {
  readonly from: number;
  readonly to: number;
  readonly prefix: string;
  readonly text: string;
}

function finished(found: Found, position: 'key' | 'value', items: readonly KeySuggestion[]): Suggestions {
  const scored = items
    .map((item, order) => ({ item, order, score: matchScore(item.label, found.prefix) }))
    .filter((each) => each.score > 0 && each.item.label !== found.prefix)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((each) => each.item);
  // A key gets `: ` and the skeleton of its value, unless the colon is already there.
  const colon = /^\s*:/.test(found.text.slice(found.to));
  const written =
    position === 'key'
      ? scored.map((item) => withValue(item, colon))
      : scored.map(({ template: _template, ...rest }) => rest);
  return { from: found.from, to: found.to, prefix: found.prefix, position, items: written };
}

/**
 * Feature: query.suggestions
 *
 * The suggestions at `cursor` in `text` of a kind, from the fields of the collection (`query.field-hints`) and its
 * search indexes; `undefined` where nothing applies: inside a comment or a regular expression, inside the parentheses
 * of a helper, between a key and its `:`, after a complete value.
 */
export function suggestions(
  text: string,
  cursor: number,
  kind: TextKind,
  known: { readonly fields: readonly FieldHint[]; readonly searchIndexes?: readonly SearchIndexHint[] },
): Suggestions | undefined {
  const { fields, searchIndexes = [] } = known;
  const scan = scanned(text, cursor);
  if (scan.quote !== undefined && !/^["'`]$/.test(scan.quote)) {
    return undefined;
  }
  const { quote } = scan;
  const prefix = text.slice(scan.tokenStart, cursor);
  if (quote === undefined && prefix !== '' && !wordCharacter.test(prefix[0] ?? '')) {
    return undefined;
  }
  let to = cursor;
  while (to < text.length && wordCharacter.test(text[to] ?? '')) {
    to += 1;
  }
  if (quote !== undefined && text[to] === quote) {
    to += 1;
  }
  const found: Found = { from: scan.tokenStart, to, prefix, text };
  let place: Place = rootPlace(kind);
  const [first, ...rest] = scan.frames;
  if (first === undefined) {
    return scan.done ? undefined : finished(found, 'value', valueSuggestions(place, fields, quote, searchIndexes));
  }
  let parent = first;
  for (const frame of rest) {
    if (parent.type !== '(') {
      place = childPlace(place, parent.type === '[' ? null : frame.key);
    }
    parent = frame;
  }
  if (parent.type === '(') {
    return undefined;
  }
  if (parent.type === '[') {
    return finished(found, 'value', valueSuggestions(childPlace(place, null), fields, quote, searchIndexes));
  }
  if (parent.state === 'key') {
    return finished(found, 'key', keySuggestions(place, fields, quote));
  }
  return parent.state === 'value'
    ? finished(
        found,
        'value',
        valueSuggestions(childPlace(place, parent.currentKey ?? null), fields, quote, searchIndexes),
      )
    : undefined;
}
