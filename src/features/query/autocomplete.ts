/**
 * Feature: query.autocomplete
 *
 * While a filter, a sort or a projection is typed, a list under the cursor offers the collection's own field names,
 * the operators that fit there, and the values the field most often has (`query.suggestions`).
 */
import type { Suggestion, SuggestionKind, Suggestions } from './suggestions';
import { text } from './text';

/** How many suggestions the list shows at most. */
export const mostSuggestions = 50;

/** How far `PageDown` and `PageUp` move. */
export const pageStep = 8;

/** The list of suggestions of an editor: closed, or open on suggestions with one of them selected. */
export interface AutocompleteState {
  readonly open: boolean;
  readonly suggestions?: Suggestions;
  readonly selected: number;
}

/** The list closed. */
export const closedList: AutocompleteState = { open: false, selected: 0 };

/** A line of the list. */
export interface SuggestionLine {
  readonly kind: SuggestionKind;
  readonly label: string;
  /** The part of the label already typed, drawn in bold: from, to. */
  readonly typed?: readonly [number, number];
  readonly detail?: string;
  readonly selected: boolean;
  readonly id: string;
}

/** What the list shows. */
export interface AutocompleteView {
  readonly element: string;
  readonly role: 'listbox';
  readonly name: string;
  readonly lines: readonly SuggestionLine[];
  /** The id of the line the keys moved to, which a screen reader says. */
  readonly active?: string;
}

function typedPart(label: string, prefix: string): readonly [number, number] | undefined {
  if (prefix === '') {
    return undefined;
  }
  const at = label.toLowerCase().indexOf(prefix.toLowerCase());
  return at < 0 ? undefined : [at, at + prefix.length];
}

/**
 * Feature: query.autocomplete
 *
 * The list under the cursor: at most 50 suggestions, each with the mark of its kind, its text with the part typed in
 * bold and its detail, the selected one known to a screen reader; nothing when the list is closed or empty.
 */
export function view(state: AutocompleteState): AutocompleteView | undefined {
  const found = state.suggestions;
  if (!state.open || found === undefined || found.items.length === 0) {
    return undefined;
  }
  const lines = found.items.slice(0, mostSuggestions).map((item, index): SuggestionLine => {
    const typed = typedPart(item.label, found.prefix);
    return {
      kind: item.kind,
      label: item.label,
      ...(typed === undefined ? {} : { typed }),
      ...(item.detail === undefined ? {} : { detail: item.detail }),
      selected: index === state.selected,
      id: `suggestion-${String(index)}`,
    };
  });
  const active = lines.find((line) => line.selected)?.id;
  return {
    element: 'query.autocomplete@editor',
    role: 'listbox',
    name: text.autocomplete.list,
    lines,
    ...(active === undefined ? {} : { active }),
  };
}

/**
 * Whether typing a character opens the list (when there is something to suggest): a letter, a digit, `_`, `$`, a
 * quote, `:`, `{` or `.`; with nothing typed yet of the word at the cursor, only right after `{`, `[`, `:` or `,`.
 * `lastBefore` is the last character before the cursor that is not a space, the one typed included.
 */
export function opensOnTyping(typed: string, lastBefore: string, prefix: string): boolean {
  if (!/^[\w$"'`:{.[,]$/.test(typed)) {
    return false;
  }
  return prefix !== '' || /^["'`]$/.test(typed) || ['{', '[', ':', ','].includes(lastBefore);
}

/** The list open on what is suggested, the first selected; closed when nothing is. */
export function opened(found: Suggestions | undefined): AutocompleteState {
  return found === undefined || found.items.length === 0 ? closedList : { open: true, suggestions: found, selected: 0 };
}

/** What a key does while the list is open. */
export type ListKey =
  | 'ArrowDown'
  | 'ArrowUp'
  | 'PageDown'
  | 'PageUp'
  | 'Enter'
  | 'Tab'
  | 'Escape'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End';

/** The list after a key, and the suggestion to insert for `Enter` and `Tab`. */
export function afterKey(
  state: AutocompleteState,
  key: ListKey,
): { readonly state: AutocompleteState; readonly insert?: Suggestion } {
  const items = state.suggestions?.items.slice(0, mostSuggestions) ?? [];
  const count = items.length;
  if (!state.open || count === 0) {
    return { state: closedList };
  }
  switch (key) {
    case 'ArrowDown':
      return { state: { ...state, selected: (state.selected + 1) % count } };
    case 'ArrowUp':
      return { state: { ...state, selected: (state.selected - 1 + count) % count } };
    case 'PageDown':
      return { state: { ...state, selected: Math.min(count - 1, state.selected + pageStep) } };
    case 'PageUp':
      return { state: { ...state, selected: Math.max(0, state.selected - pageStep) } };
    case 'Enter':
    case 'Tab': {
      const insert = items[state.selected];
      return insert === undefined ? { state: closedList } : { state: closedList, insert };
    }
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'End':
    case 'Escape':
    case 'Home':
      return { state: closedList };
  }
}

/** The text with a suggestion inserted in place of what was typed, and where the cursor goes: one step for `Ctrl+Z`. */
export function inserted(
  written: string,
  found: Suggestions,
  item: Suggestion,
): { readonly text: string; readonly cursor: number } {
  return {
    text: written.slice(0, found.from) + item.insert + written.slice(found.to),
    cursor: found.from + (item.cursor ?? item.insert.length),
  };
}

/** Whether the list opens again at once after an insertion: a key was inserted with its `: `, and a value is now expected. */
export function reopensAfter(found: Suggestions, item: Suggestion): boolean {
  return found.position === 'key' && item.kind === 'field' && item.insert.endsWith(': ');
}
