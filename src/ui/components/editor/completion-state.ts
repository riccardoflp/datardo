/**
 * The list of suggestions of a mongosh editor (`query.autocomplete`) as a state of CodeMirror: what is suggested is
 * read by `query.suggestions` from the text and the cursor of each transaction, and what the keys do by the functions
 * of `src/features/query/autocomplete.ts`. Only `@codemirror/state` is used here, so the behavior can be tested
 * without a window.
 */
import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type StateCommand,
  type Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import {
  afterKey,
  closedList,
  inserted,
  opened,
  opensOnTyping,
  reopensAfter,
  type AutocompleteState,
  type ListKey,
} from '../../../features/query/autocomplete';
import type { FieldHint } from '../../../features/query/field-hints';
import { suggestions, type Suggestion, type Suggestions, type TextKind } from '../../../features/query/suggestions';

/** What the suggestions are read from: the kind of the text and the fields of the collection. */
export interface SuggestionSource {
  readonly kind: TextKind;
  readonly fields: readonly FieldHint[];
}

/** The list of an editor and what it is read from. */
export interface Completion {
  readonly source: SuggestionSource;
  readonly list: AutocompleteState;
}

/** Changes the kind of the text or the fields known: an open list is read again, so that the fields join it. */
export const setSource = StateEffect.define<SuggestionSource>();

/** Sets the list as it is: moved, or closed. */
const setList = StateEffect.define<AutocompleteState>();

/** Opens the list on what is suggested at the cursor of the transaction, or closes it when nothing is. */
const openAtCursor = StateEffect.define();

/** The keys that move the cursor as well as closing the list. */
const cursorKeys: readonly ListKey[] = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];

function suggestedAt(tr: Transaction, source: SuggestionSource): Suggestions | undefined {
  const selection = tr.newSelection.main;
  if (!selection.empty) {
    return undefined;
  }
  return suggestions(tr.newDoc.toString(), selection.head, source.kind, { fields: source.fields });
}

/** The one character a transaction typed, if it typed one. */
function typedCharacter(tr: Transaction): string | undefined {
  const typed: string[] = [];
  tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    typed.push(tr.newDoc.sliceString(fromB, toB));
  });
  const [only] = typed;
  return typed.length === 1 && only !== undefined && /^.$/u.test(only) ? only : undefined;
}

/** The list after an edit: kept open on what is now suggested while typing or deleting, opened by a typed character. */
function afterEdit(list: AutocompleteState, tr: Transaction, source: SuggestionSource): AutocompleteState {
  const typing = tr.isUserEvent('input.type');
  if (!typing && !tr.isUserEvent('delete')) {
    return closedList;
  }
  const found = suggestedAt(tr, source);
  if (list.open) {
    return opened(found);
  }
  const typed = typing ? typedCharacter(tr) : undefined;
  if (typed === undefined) {
    return closedList;
  }
  const cursor = tr.newSelection.main.head;
  const lastBefore = tr.newDoc.sliceString(0, cursor).trimEnd().slice(-1);
  return opensOnTyping(typed, lastBefore, found?.prefix ?? '') ? opened(found) : closedList;
}

/** The list read again with new fields, the selection kept where it can be. */
function refreshed(list: AutocompleteState, tr: Transaction, source: SuggestionSource): AutocompleteState {
  if (!list.open) {
    return list;
  }
  const next = opened(suggestedAt(tr, source));
  const count = next.suggestions?.items.length ?? 0;
  return next.open ? { ...next, selected: Math.min(list.selected, count - 1) } : next;
}

function updated(value: Completion, tr: Transaction): Completion {
  let { source, list } = value;
  let set = false;
  for (const effect of tr.effects) {
    if (effect.is(setSource)) {
      source = effect.value;
      list = refreshed(list, tr, source);
    } else if (effect.is(setList)) {
      list = effect.value;
      set = true;
    } else if (effect.is(openAtCursor)) {
      list = opened(suggestedAt(tr, source));
      set = true;
    }
  }
  if (!set && tr.docChanged) {
    list = afterEdit(list, tr, source);
  } else if (!set && tr.selection !== undefined && list.open) {
    // The cursor moved without an edit (a click, a key the list leaves alone): the list closes.
    list = closedList;
  }
  return source === value.source && list === value.list ? value : { source, list };
}

/** The list and its source, for what follows the list (the attributes a screen reader reads). */
export const listField = StateField.define<Completion>({
  create: () => ({ source: { kind: 'filter', fields: [] }, list: closedList }),
  update: updated,
});

/** The list of suggestions of an editor, read from a source that `setSource` changes later. */
export function suggestionList(source: SuggestionSource): Extension {
  return listField.init(() => ({ source, list: closedList }));
}

/** The list of an editor; closed for a state without one. */
export function listOf(state: EditorState): AutocompleteState {
  return state.field(listField, false)?.list ?? closedList;
}

/** The transaction that writes a suggestion in place of what was typed: one step for `Ctrl+Z`. */
function insertion(state: EditorState, found: Suggestions, item: Suggestion): TransactionSpec {
  const { cursor } = inserted(state.doc.toString(), found, item);
  return {
    changes: { from: found.from, to: found.to, insert: item.insert },
    selection: EditorSelection.cursor(cursor),
    effects: reopensAfter(found, item) ? openAtCursor.of(null) : setList.of(closedList),
    userEvent: 'input.complete',
    scrollIntoView: true,
  };
}

/** `Ctrl+Space`: opens the list wherever the cursor is, also with nothing typed. */
export const openList: StateCommand = ({ state, dispatch }) => {
  dispatch(state.update({ effects: openAtCursor.of(null) }));
  return true;
};

/** Closes the list, leaving the text; false when it was not open. */
export const closeList: StateCommand = ({ state, dispatch }) => {
  if (!listOf(state).open) {
    return false;
  }
  dispatch(state.update({ effects: setList.of(closedList) }));
  return true;
};

/**
 * What a key does while the list is open: moves through it, inserts the suggestion (`Enter`, `Tab`) or closes it.
 * False when the list is closed, and for the keys that also move the cursor, so that the editor moves it.
 */
export function pressListKey(key: ListKey): StateCommand {
  return ({ state, dispatch }) => {
    const list = listOf(state);
    if (!list.open) {
      return false;
    }
    const next = afterKey(list, key);
    if (next.insert !== undefined && list.suggestions !== undefined) {
      dispatch(state.update(insertion(state, list.suggestions, next.insert)));
      return true;
    }
    dispatch(state.update({ effects: setList.of(next.state) }));
    return !cursorKeys.includes(key);
  };
}

/** A click on a line of the list: inserts that suggestion. */
export function insertSuggestion(index: number): StateCommand {
  return ({ state, dispatch }) => {
    const found = listOf(state).suggestions;
    const item = found?.items[index];
    if (found === undefined || item === undefined) {
      return false;
    }
    dispatch(state.update(insertion(state, found, item)));
    return true;
  };
}
