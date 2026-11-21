/**
 * The editor over a cell or a line of the inspector's tree (`document.inline-edit`): the one open, where it is, and
 * what it says. The window keeps it; the edit itself is the Operation, started when `Enter` is pressed.
 */
import { useSyncExternalStore } from 'react';
import type { Json } from '../../../shared/engine-request';
import type { CollectionRef } from '../../query/collection-reads';

/** Where the editor was opened from, which is the place of its element. */
export type EditPlace = 'table' | 'cell-menu' | 'inspector';

/** The editor open over a value. */
export interface OpenEdit {
  readonly ref: CollectionRef;
  readonly place: EditPlace;
  /** The `_id` of the document, as canonical Extended JSON. */
  readonly id: Json;
  /** The field path, with the positions of arrays: `items.2.qty`. */
  readonly path: string;
  /** The value as the table or the tree shows it; absent for a missing field. */
  readonly shown?: Json;
  /** Where the editor is drawn: over the cell or the line. */
  readonly box: { readonly left: number; readonly top: number; readonly width: number };
  /** The element the focus goes back to when the editor closes. */
  readonly returnFocus: HTMLElement | null;
  readonly text: string;
  /** The parser's error, the server's, or *Not saved: …*, shown in place of the hint. */
  readonly problem?: string;
  readonly saving: boolean;
  /** Counts the opened editors, so that a new one is drawn afresh. */
  readonly number: number;
}

let open: OpenEdit | undefined;
let opened = 0;
const listeners = new Set<() => void>();

function changed(next: OpenEdit | undefined): void {
  open = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Opens the editor over a value; one that was open is closed. */
export function openInlineEdit(edit: Omit<OpenEdit, 'saving' | 'number'>): void {
  opened += 1;
  changed({ ...edit, saving: false, number: opened });
}

/** Changes the editor that is open. */
export function changeInlineEdit(change: (before: OpenEdit) => OpenEdit): void {
  if (open !== undefined) {
    changed(change(open));
  }
}

/** Closes the editor, the focus going back where it was. */
export function closeInlineEdit(): void {
  const focus = open?.returnFocus;
  changed(undefined);
  focus?.focus();
}

/** The editor that is open, if any. */
export function currentInlineEdit(): OpenEdit | undefined {
  return open;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The editor that is open, drawn again whenever it changes. */
export function useInlineEdit(): OpenEdit | undefined {
  return useSyncExternalStore(subscribe, () => open);
}
