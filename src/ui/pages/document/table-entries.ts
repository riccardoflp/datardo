/**
 * What the entries and the keys of the table start of the document area (`@row-menu`, `@cell-menu`,
 * `@selection-bar`, `@table`): **Inspect document**, **Open in a tab**, **Edit value**, **Duplicate…**, **Delete
 * document**, and **Update** or **Delete** the selected rows. A selection of one row deletes that document
 * (`document.delete`); of several, the selected rows (`document.delete-selected`).
 */
import type { Cell } from '../../../features/table/rows';
import type { Document, TableTarget } from '../../../features/table/types';
import { canWrite } from '../../../features/table/types';
import { oneLineText } from '../../../features/document/write/values';
import { featureOfElement } from '../../query/built';
import type { CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { idsOf, openDocumentTab, startOnDocuments } from './document-actions';
import { beginInlineEdit, cellPath, isCellEditable } from './inline-edit-actions';
import { selectedRows, showInInspector } from './inspect-state';

/** What an entry of the document area acts on. */
export interface DocumentEntry {
  readonly ref: CollectionRef;
  readonly collection: CollectionTab;
  readonly documents: readonly Document[];
  readonly element: string;
  /** The cell of **Edit value**, and where its editor goes. */
  readonly cell?: { readonly cell: Cell; readonly row: number; readonly anchor: HTMLElement | null };
  readonly target: TableTarget;
}

/** Carries out an entry of the document area; `false` when the element is not one. */
export function chooseDocumentEntry(entry: DocumentEntry): boolean {
  const { ref, documents, element } = entry;
  const [first] = documents;
  switch (featureOfElement(element)) {
    case 'document.inspect':
      showInInspector(ref, first === undefined ? undefined : entry.collection.documents.indexOf(first));
      return true;
    case 'document.open':
      if (first !== undefined) {
        openDocumentTab(ref, first, element);
      }
      return true;
    case 'document.inline-edit':
      editCell(entry);
      return true;
    case 'document.duplicate':
    case 'document.delete':
      void startOnDocuments(ref, element, { id: first?.['_id'] ?? null });
      return true;
    case 'history.show': {
      const id = first?.['_id'];
      if (id !== undefined) {
        void startOnDocuments(ref, element, { id, idText: oneLineText(id) });
      }
      return true;
    }
    case 'document.update-selected':
    case 'document.delete-selected':
      void startOnDocuments(ref, element, { ids: idsOf(documents) });
      return true;
    default:
      return false;
  }
}

function editCell(entry: DocumentEntry): void {
  const at = entry.cell;
  const document = at === undefined ? undefined : entry.collection.documents[at.row];
  if (at === undefined || document === undefined || !isCellEditable(entry.target, document, at.cell)) {
    return;
  }
  const content = at.cell.content;
  beginInlineEdit({
    ref: entry.ref,
    place: entry.element.endsWith('@cell-menu') ? 'cell-menu' : 'table',
    document,
    path: cellPath(at.cell),
    shown: content.kind === 'value' ? content.value : undefined,
    anchor: at.anchor,
  });
}

/**
 * A double click on a cell, or `F2`: the editor over it where the value can be edited in place, otherwise the document
 * in the inspector (F2 alone does nothing there).
 */
export function editOrInspect(entry: Omit<DocumentEntry, 'documents' | 'element'>, inspectOtherwise: boolean): void {
  const at = entry.cell;
  const document = at === undefined ? undefined : entry.collection.documents[at.row];
  if (at !== undefined && document !== undefined && isCellEditable(entry.target, document, at.cell)) {
    editCell({ ...entry, documents: [document], element: 'document.inline-edit@table' });
  } else if (inspectOtherwise && at !== undefined) {
    showInInspector(entry.ref, at.row);
  }
}

/** The `Delete` key: the selected rows, or the row of the selected cell; nothing where the table cannot write. */
export function deleteKey(
  ref: CollectionRef,
  collection: CollectionTab,
  target: TableTarget,
  row: number | undefined,
): void {
  if (!canWrite(target)) {
    return;
  }
  const rows = selectedRows(collection);
  const chosen = rows.length > 0 ? rows : row === undefined ? [] : [row];
  const documents = chosen.flatMap((index) => {
    const document = collection.documents[index];
    return document === undefined ? [] : [document];
  });
  const ids = idsOf(documents);
  if (ids.length === 0 || ids.length < documents.length) {
    return;
  }
  const [only] = ids;
  if (ids.length === 1 && only !== undefined) {
    void startOnDocuments(ref, 'document.delete@table', { id: only });
  } else {
    void startOnDocuments(ref, 'document.delete-selected@table', { ids });
  }
}
