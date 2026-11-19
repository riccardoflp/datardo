/**
 * The context menus of the table (`table.row-menu`, `table.cell-menu`, `table.column-menu`), drawn where the grid
 * asked for one. A menu on a row that is not selected selects it alone first; on a row of a selection of several it
 * is the menu of the selection. Entries whose feature is not built are not drawn.
 */
import { useEffect, useRef } from 'react';
import { view as cellMenuView } from '../../features/table/cell-menu';
import { view as columnMenuView } from '../../features/table/column-menu';
import { columnByKey } from '../../features/table/detect-columns';
import { view as rowMenuView } from '../../features/table/row-menu';
import { selectedDocuments, selectionAfter } from '../../features/table/selection';
import { text } from '../../features/table/text';
import { rowKeyOf, type Document, type MenuEntry } from '../../features/table/types';
import { isBuilt } from '../query/built';
import { changeQuery, type CollectionTab } from '../query/collection-store';
import { chooseEntry, type EntryContext } from './menu-entries';
import { MenuList } from './menu-list';
import { closeTableMenu, useTableMenu, type TableMenuRequest } from './menu-request';
import { shownEntries } from './shown-entries';
import type { TablePartProps } from './table-parts';

/** What a menu shows and acts on. */
interface BuiltMenu {
  readonly label: string;
  readonly element: string;
  readonly entries: readonly MenuEntry[];
  readonly context: EntryContext;
}

/** The number of a row in the column `#`, as the grid writes it: from the first document of the result. */
function rowNumber(collection: CollectionTab, row: number): number {
  const { page, pageSize } = collection.query;
  return (page - 1) * pageSize + row + 1;
}

/** The documents a menu on a row acts on: the selection when the row is one of several selected, or the row. */
function documentsOf(collection: CollectionTab, document: Document): readonly Document[] {
  const selected = selectedDocuments(collection.query.selection, collection.documents);
  return selected.length > 1 && selected.includes(document) ? selected : [document];
}

function rowOrCellMenu(props: TablePartProps, request: Extract<TableMenuRequest, { kind: 'row' | 'cell' }>) {
  const { collection, target } = props;
  const document = collection.documents[request.row];
  if (document === undefined) {
    return undefined;
  }
  const selected = selectedDocuments(collection.query.selection, collection.documents);
  const base = {
    ref: props.collectionRef,
    collection,
    columns: props.columns,
    documents: documentsOf(collection, document),
  };
  const number = rowNumber(collection, request.row);
  if (request.kind === 'row') {
    const entries = rowMenuView({ document, selected, target });
    return { label: text.names.rowMenu(number), element: 'table.row-menu@row-menu', entries, context: base };
  }
  const column = columnByKey(props.columns.columns, request.column);
  if (column === undefined) {
    return undefined;
  }
  const within = request.within === undefined ? {} : { within: request.within };
  const value = request.value === undefined ? {} : { value: request.value };
  const entries = cellMenuView({ document, selected, target, column, ...value, ...within });
  return {
    label: text.names.cellMenu(request.column, number),
    element: 'table.cell-menu@cell-menu',
    entries,
    context: { ...base, field: { key: request.column, ...value, ...within } },
  };
}

function columnMenu(props: TablePartProps, request: Extract<TableMenuRequest, { kind: 'column' }>) {
  const { collection, columns, target } = props;
  const column = request.column === '#' ? '#' : columnByKey(columns.columns, request.column);
  if (column === undefined) {
    return undefined;
  }
  const within = request.within === undefined ? {} : { within: request.within };
  const entries = columnMenuView({ column, layout: columns.layout, texts: collection.query.texts, target, ...within });
  const context: EntryContext = {
    ref: props.collectionRef,
    collection,
    columns,
    documents: [],
    ...(request.column === '#' ? {} : { field: { key: request.column, ...within } }),
  };
  return { label: text.names.columnMenu(request.column), element: 'table.column-menu@column-menu', entries, context };
}

function menuOf(props: TablePartProps, request: TableMenuRequest): BuiltMenu | undefined {
  return request.kind === 'column' ? columnMenu(props, request) : rowOrCellMenu(props, request);
}

/**
 * A menu on a row that is not selected selects it alone first, once when it opens: an entry that changes the
 * selection afterwards (**Clear selection**) is not undone.
 */
function useRowSelected(props: TablePartProps, request: TableMenuRequest | undefined): void {
  const { collection, collectionRef } = props;
  const handled = useRef<TableMenuRequest | undefined>(undefined);
  useEffect(() => {
    if (request === undefined || request.kind === 'column' || handled.current === request) {
      return;
    }
    handled.current = request;
    const document = collection.documents[request.row];
    if (document === undefined || collection.query.selection.keys.includes(rowKeyOf(document, request.row))) {
      return;
    }
    changeQuery(collectionRef.tab, (query) => ({
      ...query,
      selection: selectionAfter(query.selection, { kind: 'only', index: request.row }, collection.documents),
    }));
  }, [request, collection.documents, collection.query.selection, collectionRef.tab]);
}

/** The menu open on the table, where the grid asked for it. */
export function TableMenus(props: TablePartProps): React.JSX.Element | null {
  const request = useTableMenu(props.collectionRef.tab);
  useRowSelected(props, request);
  const menu = request === undefined ? undefined : menuOf(props, request);
  if (request === undefined || menu === undefined) {
    return null;
  }
  return (
    <MenuList
      key={`${request.kind} ${String(request.x)} ${String(request.y)}`}
      label={menu.label}
      element={menu.element}
      x={request.x}
      y={request.y}
      entries={shownEntries(menu.entries, isBuilt)}
      returnFocus={request.returnFocus ?? null}
      onChoose={(entry) => {
        chooseEntry(menu.context, entry);
      }}
      onClose={closeTableMenu}
    />
  );
}
