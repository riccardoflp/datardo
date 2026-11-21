/**
 * What opens the editor over a value and what saves it (`document.inline-edit`): it opens only where the card offers
 * it (in **Find**, on a collection that can be changed, on a document with an `_id`, never on `_id`); `Enter` checks
 * the text as the feature reads it and starts the edit with it. A double click where editing is not possible shows
 * the document in the inspector instead (`document.inspect`).
 */
import { isIdPath } from '../../../features/document/inline-edit';
import { editedValueOf } from '../../../features/document/keep-numeric-types';
import { text } from '../../../features/document/text';
import { prettyText } from '../../../features/document/write/values';
import type { Cell } from '../../../features/table/rows';
import { canWrite, type Document, type TableTarget } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import { runQuery, type CollectionRef } from '../../query/collection-reads';
import { startOnDocuments } from './document-actions';
import {
  changeInlineEdit,
  closeInlineEdit,
  currentInlineEdit,
  openInlineEdit,
  type EditPlace,
  type OpenEdit,
} from './inline-edit-store';

/** The element of the editor opened from each place. */
const elements: Readonly<Record<EditPlace, string>> = {
  table: 'document.inline-edit@table',
  'cell-menu': 'document.inline-edit@cell-menu',
  inspector: 'document.inline-edit@inspector',
};

/** The field path of a cell: its column, with the position of the element of an expanded array (`items.2.qty`). */
export function cellPath(cell: Cell): string {
  const element = cell.element;
  if (element === undefined || !(cell.column === element.array || cell.column.startsWith(`${element.array}.`))) {
    return cell.column;
  }
  return `${element.array}.${String(element.index)}${cell.column.slice(element.array.length)}`;
}

/** Whether a value of a document can be edited in place: the card's **Offered when**. */
export function isEditable(target: TableTarget, document: Document | undefined, path: string): boolean {
  return document !== undefined && canWrite(target) && document['_id'] !== undefined && !isIdPath(path);
}

/** Whether a cell can be edited: a value or an empty cell, never `… N more` or a filler. */
export function isCellEditable(target: TableTarget, document: Document | undefined, cell: Cell): boolean {
  const content = cell.content.kind;
  return (content === 'value' || content === 'missing') && isEditable(target, document, cellPath(cell));
}

/** What the editor is opened on. */
export interface EditRequest {
  readonly ref: CollectionRef;
  readonly place: EditPlace;
  readonly document: Document;
  readonly path: string;
  readonly shown: Json | undefined;
  readonly anchor: HTMLElement | null;
}

/** Opens the editor over a value, with the value in mongosh syntax (a sub-document or an array on several lines). */
export function beginInlineEdit(request: EditRequest): void {
  const id = request.document['_id'];
  if (id === undefined) {
    return;
  }
  const box = request.anchor?.getBoundingClientRect();
  openInlineEdit({
    ref: request.ref,
    place: request.place,
    id,
    path: request.path,
    ...(request.shown === undefined ? {} : { shown: request.shown }),
    box: { left: box?.left ?? 0, top: box?.top ?? 0, width: box?.width ?? 0 },
    returnFocus: request.anchor,
    text: request.shown === undefined ? '' : prettyText(request.shown),
  });
}

/** The arguments the edit is started with. */
function editArgs(edit: OpenEdit): { readonly [key: string]: Json } {
  return {
    id: edit.id,
    path: edit.path,
    text: edit.text,
    ...(edit.shown === undefined ? { missing: true } : { value: edit.shown }),
  };
}

/** What the editor says once the edit ended without being written; `undefined` closes it. */
async function afterEdit(edit: OpenEdit): Promise<string | undefined> {
  const result = await startOnDocuments(edit.ref, elements[edit.place], editArgs(edit));
  switch (result.kind) {
    case 'done':
    case 'read':
      return undefined;
    case 'cancelled':
      // **Overwrite** declined: nothing written, and the table shows the value as it is now.
      void runQuery(edit.ref, { texts: 'ran', refresh: true, count: false });
      return text.inlineEdit.notSaved;
    case 'refused':
    case 'failed':
      return result.message;
  }
}

/** `Enter`: the text checked as the feature reads it, then the edit; an error keeps the editor open. */
export async function saveInlineEdit(): Promise<void> {
  const edit = currentInlineEdit();
  if (edit === undefined || edit.saving) {
    return;
  }
  const read = editedValueOf(edit.text, { now: Date.now(), newId: () => '000000000000000000000000' });
  if (!read.ok) {
    changeInlineEdit((before) => ({ ...before, problem: read.message }));
    return;
  }
  changeInlineEdit((before) => {
    const { problem: _problem, ...rest } = before;
    return { ...rest, saving: true };
  });
  const problem = await afterEdit(edit);
  if (currentInlineEdit()?.number !== edit.number) {
    return;
  }
  if (problem === undefined) {
    closeInlineEdit();
    return;
  }
  changeInlineEdit((before) => ({ ...before, saving: false, problem }));
}
