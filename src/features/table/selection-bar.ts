/**
 * Feature: table.selection-bar
 *
 * Shows how many documents are selected and what can be done with them together, between the query bar and the table
 * while more than one row is selected.
 */
import { formatsFor } from './copy-as';
import type { CopyFormat } from './copy-text';
import { text } from './text';
import { canWrite, type Document, type TableTarget } from './types';

/** What the selection bar is drawn from: the selected documents and what the table shows. */
export interface SelectionBarState {
  readonly selected: readonly Document[];
  readonly target: TableTarget;
}

/** A button of the bar. */
export interface SelectionButton {
  readonly label: string;
  readonly element: string;
  readonly tip?: string;
}

/** What the selection bar shows; `undefined` from `view` when one row or none is selected. */
export interface SelectionBarView {
  /** `3 selected`, said to a screen reader when it changes. */
  readonly count: string;
  readonly copyAs: SelectionButton & {
    readonly formats: readonly { readonly format: CopyFormat; readonly label: string; readonly description: string }[];
  };
  readonly export?: SelectionButton;
  readonly update?: SelectionButton;
  readonly delete?: SelectionButton;
  readonly clear: SelectionButton;
}

/** Whether every document has an `_id`, which exporting, updating and deleting a selection need. */
export function allHaveId(documents: readonly Document[]): boolean {
  return documents.every((document) => Object.hasOwn(document, '_id'));
}

/**
 * Feature: table.selection-bar
 *
 * **3 selected**, **Copy as**, **Export 3 documents…** when each has an `_id`, **Update 3 documents…** and **Delete 3
 * documents…** besides on a collection that can be changed, and **Clear**.
 */
export function view(state: SelectionBarState): SelectionBarView | undefined {
  const count = state.selected.length;
  if (count < 2) {
    return undefined;
  }
  const withId = allHaveId(state.selected);
  const writes = withId && canWrite(state.target);
  return {
    count: text.selection.count(count),
    copyAs: { label: text.selection.copyAs, element: 'table.copy-as@selection-bar', formats: formatsFor(count) },
    ...(withId
      ? {
          export: {
            label: text.selection.export(count),
            element: 'transfer.export@selection-bar',
            tip: text.selection.exportTip,
          },
        }
      : {}),
    ...(writes
      ? { update: { label: text.selection.update(count), element: 'document.update-selected@selection-bar' } }
      : {}),
    ...(writes
      ? { delete: { label: text.selection.delete(count), element: 'document.delete-selected@selection-bar' } }
      : {}),
    clear: { label: text.selection.clear, element: 'table.selection@selection-bar', tip: text.selection.clearTip },
  };
}
