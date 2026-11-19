/**
 * Feature: table.selection
 *
 * Says which documents are selected after a click or a key: one to inspect it, or several to copy, export, update or
 * delete them together. A document is known by its `_id`, or by its place in the page when it has none.
 */
import { emptySelection, rowKeyOf, type Document, type RowKey, type Selection } from './types';

/** What changes the selection; `index` is the place of the document in the page. */
export type SelectionAction =
  /** A click on a cell or a row number, or an arrow key: that document alone. */
  | { readonly kind: 'only'; readonly index: number }
  /** `Ctrl` with a click, `Ctrl+Space`: added, or taken out when in. */
  | { readonly kind: 'toggle'; readonly index: number }
  /** `Shift` with a click, `Shift+↑`, `Shift+↓`: every document from the anchor to this one. */
  | { readonly kind: 'range'; readonly index: number }
  /** `Ctrl+A`. */
  | { readonly kind: 'all' }
  /** `Esc`, **Clear**; also a query run again, a page changed, a mode changed. */
  | { readonly kind: 'clear' }
  /** A refresh of the same page: the documents still there stay selected. */
  | { readonly kind: 'refresh' };

function keysOf(documents: readonly Document[]): RowKey[] {
  return documents.map((document, index) => rowKeyOf(document, index));
}

function inPageOrder(keys: Iterable<RowKey>, page: readonly RowKey[]): RowKey[] {
  const chosen = new Set(keys);
  return page.filter((key) => chosen.has(key));
}

/**
 * Feature: table.selection
 *
 * The selection after an action, in the order of the page, with its anchor: the document last clicked or moved to
 * without `Shift`.
 */
export function selectionAfter(
  selection: Selection,
  action: SelectionAction,
  documents: readonly Document[],
): Selection {
  const page = keysOf(documents);
  switch (action.kind) {
    case 'only': {
      const key = page[action.index];
      return key === undefined ? selection : { keys: [key], anchor: key };
    }
    case 'toggle': {
      const key = page[action.index];
      if (key === undefined) {
        return selection;
      }
      const kept = selection.keys.includes(key)
        ? selection.keys.filter((each) => each !== key)
        : [...selection.keys, key];
      return { keys: inPageOrder(kept, page), anchor: key };
    }
    case 'range': {
      const anchor = selection.anchor === undefined ? -1 : page.indexOf(selection.anchor);
      if (anchor < 0) {
        return selectionAfter(selection, { kind: 'only', index: action.index }, documents);
      }
      const [from, to] = anchor <= action.index ? [anchor, action.index] : [action.index, anchor];
      return { keys: page.slice(from, to + 1), anchor: page[anchor] as RowKey };
    }
    case 'all':
      return page.length === 0
        ? emptySelection
        : { keys: page, ...(selection.anchor === undefined ? {} : { anchor: selection.anchor }) };
    case 'clear':
      return emptySelection;
    case 'refresh': {
      const keys = inPageOrder(selection.keys, page);
      const anchor = selection.anchor !== undefined && page.includes(selection.anchor) ? selection.anchor : undefined;
      return { keys, ...(anchor === undefined ? {} : { anchor }) };
    }
  }
}

/** The documents selected, in the order of the page. */
export function selectedDocuments(selection: Selection, documents: readonly Document[]): readonly Document[] {
  const chosen = new Set(selection.keys);
  return documents.filter((document, index) => chosen.has(rowKeyOf(document, index)));
}
