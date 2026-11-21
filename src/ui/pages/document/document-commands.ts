/**
 * The commands of the document area, carried out by the window the same way for their key and their row in Go to
 * (`palette.run-command`): on the active collection tab, **Inspect document**, **Open document in a tab**, **Edit
 * value**, **Duplicate document…** and **Delete document** act on the selected row or the row of the selected cell;
 * **Insert documents…**, **Update many…** and **Delete many…** on the collection; on a document tab, **Save
 * document**. A command not offered now does nothing.
 */
import { intentOf } from '../../../features/palette/run-command';
import type { Document } from '../../../features/table/types';
import type { AppState } from '../../../shared/state';
import { rememberedColumns } from '../../../shared/state/table';
import { activeTabOf } from '../../../shared/state/tabs';
import { collectionRefOf, type CollectionRef } from '../../query/collection-reads';
import { collectionOf, type CollectionTab } from '../../query/collection-store';
import { selectedCell, type SelectedCell } from '../../table/selected-cell';
import { tableColumnsOf, tableTargetOf } from '../../table/table-columns';
import { elementIn } from '../../table/table-keys';
import { openDocumentTab, startOnDocuments, startOnFilter } from './document-actions';
import { saveTab } from './document-tab-actions';
import { isReadOnly, selectedRows, showInInspector } from './inspect-state';
import { editOrInspect } from './table-entries';

/** Whether a command is one of the document area's, carried out here. */
export function isDocumentCommand(id: string): boolean {
  return id.startsWith('document.');
}

interface On {
  readonly ref: CollectionRef;
  readonly collection: CollectionTab;
  readonly cell: SelectedCell | undefined;
}

function onActive(state: AppState): On | undefined {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return undefined;
  }
  const collection = collectionOf(ref.tab);
  const columns = tableColumnsOf(rememberedColumns(state.table, ref), collection.documents);
  const at = collection.cell;
  return { ref, collection, cell: at === undefined ? undefined : selectedCell(collection.documents, columns, at) };
}

/** The row a command on one document acts on: the first selected, else the row of the selected cell. */
function rowOf(on: On): number | undefined {
  return selectedRows(on.collection)[0] ?? on.cell?.row;
}

function documentOf(on: On): Document | undefined {
  const row = rowOf(on);
  return row === undefined ? undefined : on.collection.documents[row];
}

function editValue(state: AppState, on: On): void {
  const { cell, collection, ref } = on;
  const position = collection.cell;
  if (cell?.cell === undefined || cell.row === undefined || position === undefined) {
    return;
  }
  const target = tableTargetOf(collection, { view: ref.kind === 'view', readOnly: isReadOnly(state, ref) });
  const anchor = elementIn(document.querySelector<HTMLElement>('[data-island="main"]'), position);
  editOrInspect({ ref, collection, target, cell: { cell: cell.cell, row: cell.row, anchor } }, false);
}

function onDocument(id: string, state: AppState, on: On): void {
  const chosen = documentOf(on);
  switch (id) {
    case 'document.inspect':
      showInInspector(on.ref, rowOf(on));
      return;
    case 'document.open':
      if (chosen !== undefined) {
        openDocumentTab(on.ref, chosen, 'document.open');
      }
      return;
    case 'document.inline-edit':
      editValue(state, on);
      return;
    case 'document.duplicate':
    case 'document.delete':
      if (chosen?.['_id'] !== undefined) {
        void startOnDocuments(on.ref, id, { id: chosen['_id'] });
      }
      return;
    case 'document.insert':
      void startOnDocuments(on.ref, id);
      return;
    case 'document.update-many':
    case 'document.delete-many':
      void startOnFilter(on.ref, id);
      return;
    default:
      return;
  }
}

/** Runs a command of the document area now. */
export function runDocumentCommand(id: string, state: AppState): void {
  if (intentOf(state, id) === undefined) {
    return;
  }
  const active = activeTabOf(state.tabs);
  if (id === 'document.save') {
    if (active?.shows.kind === 'document') {
      void saveTab(active.id, active.shows);
    }
    return;
  }
  const on = onActive(state);
  if (on !== undefined) {
    onDocument(id, state, on);
  }
}
