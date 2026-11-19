/**
 * The commands of the table, carried out by the window on the active collection tab, the same way for their rows in
 * Go to (`palette.run-command`): **Documents**, **Refresh documents**, **Columns…**, the commands on the column of the
 * selected cell (expand, collapse, arrange, sort, copy its value or its path), the pages, the selection, and the copies
 * of the selected documents, or of the document of the selected cell.
 */
import type { LayoutChange } from '../../features/table/arrange-columns';
import type { CopyFormat } from '../../features/table/copy-text';
import { view as pagingView } from '../../features/table/paging';
import { selectedDocuments, selectionAfter, type SelectionAction } from '../../features/table/selection';
import type { Document } from '../../features/table/types';
import type { AppState } from '../../shared/state';
import { rememberedColumns } from '../../shared/state/table';
import { activeTabOf } from '../../shared/state/tabs';
import { collectionRefOf, runQuery, type CollectionRef } from '../query/collection-reads';
import { changeQuery, collectionOf, type CollectionTab } from '../query/collection-store';
import { pagingStateOf } from '../query/collection-view';
import { openColumnsPanel } from './columns-panel-store';
import { selectedCell } from './selected-cell';
import { sortByHeader } from './table-actions';
import { tableColumnsOf, type TableColumns } from './table-columns';
import { arrange, collapseColumn, copyDocuments, expandColumn, refreshTab, startOnCollection } from './table-start';

/** What a command acts on: the tab, what the window keeps of it, its columns. */
interface On {
  readonly ref: CollectionRef;
  readonly collection: CollectionTab;
  readonly columns: TableColumns;
}

/** Whether a command is one of the table's, carried out here. */
export function isTableCommand(id: string): boolean {
  return id.startsWith('table.');
}

function onActive(state: AppState): On | undefined {
  const active = activeTabOf(state.tabs);
  const ref = active === undefined ? undefined : collectionRefOf(active.id);
  if (ref === undefined) {
    return undefined;
  }
  const collection = collectionOf(ref.tab);
  return { ref, collection, columns: tableColumnsOf(rememberedColumns(state.table, ref), collection.documents) };
}

function cellOf(on: On) {
  const at = on.collection.cell;
  return at === undefined ? undefined : selectedCell(on.collection.documents, on.columns, at);
}

/** The documents a copy acts on: those selected, or the document of the selected cell. */
function copiedDocuments(on: On): readonly Document[] {
  const selected = selectedDocuments(on.collection.query.selection, on.collection.documents);
  if (selected.length > 0) {
    return selected;
  }
  const document = cellOf(on)?.document;
  return document === undefined ? [] : [document];
}

/** The sort of the column alone, then the other direction, then none; and run, as a click on its header. */
function onColumn(on: On, id: string): void {
  const column = cellOf(on)?.column;
  if (column === undefined) {
    return;
  }
  const { key } = column;
  const [feature = id, variant = ''] = id.split(':');
  const table = { columns: on.columns, documents: on.collection.documents };
  switch (feature) {
    case 'table.expand':
      expandColumn(on.ref, table, { key, allLevels: variant !== '' }, feature);
      return;
    case 'table.collapse':
      if (column.path.length > 1) {
        collapseColumn(on.ref, on.columns, column.path.slice(0, -1).join('.'), feature);
      }
      return;
    case 'table.arrange-columns':
      arrange(on.ref, on.columns, { kind: variant, key } as LayoutChange, feature);
      return;
    case 'table.sort':
      sortByHeader(on.ref, key);
      return;
    case 'table.copy-path':
      void startOnCollection(on.ref, feature, { key });
      return;
    default:
      return;
  }
}

function turnPage(on: On, to: 'next' | 'previous' | 'first'): void {
  const paging = pagingView(pagingStateOf(on.collection));
  const button = to === 'next' ? paging.next : paging.previous;
  if (to === 'first' ? on.collection.query.page === 1 : !button.enabled) {
    return;
  }
  void runQuery(on.ref, { texts: 'ran', page: to === 'first' ? 1 : button.page, count: false });
}

function select(on: On, action: SelectionAction): void {
  changeQuery(on.ref.tab, (query) => ({
    ...query,
    selection: selectionAfter(query.selection, action, on.collection.documents),
  }));
}

/** Carries out a command of the table on the active collection tab; with none, it does nothing. */
export function runTableCommand(id: string, state: AppState): void {
  const on = onActive(state);
  if (on === undefined) {
    return;
  }
  const [feature = id, variant = ''] = id.split(':');
  switch (feature) {
    case 'table.show':
      document.querySelector<HTMLElement>('[role="grid"]')?.focus();
      return;
    case 'table.refresh':
      refreshTab(on.ref);
      return;
    case 'table.columns':
      openColumnsPanel(on.ref.tab);
      return;
    case 'table.paging':
      turnPage(on, variant as 'next' | 'previous' | 'first');
      return;
    case 'table.selection':
      select(on, variant === 'all' ? { kind: 'all' } : { kind: 'clear' });
      return;
    case 'table.copy-as': {
      const format = variant === '' ? {} : { format: variant as CopyFormat };
      copyDocuments(on.ref, on.columns, { documents: copiedDocuments(on), ...format }, feature);
      return;
    }
    case 'table.arrange-columns':
      if (variant === 'show-all' || variant === 'reset') {
        arrange(on.ref, on.columns, { kind: variant }, feature);
      } else {
        onColumn(on, id);
      }
      return;
    case 'table.copy-value': {
      const cell = cellOf(on);
      if (cell?.value !== undefined) {
        void startOnCollection(on.ref, feature, { value: cell.value });
      }
      return;
    }
    default:
      onColumn(on, id);
  }
}
