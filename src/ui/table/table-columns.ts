/**
 * The columns of a collection tab's table: those of the page shown (`table.detect-columns`), with the paths expanded
 * and the layout Datardo remembers for the collection (`table.columns`), which the app's state holds as
 * `table.save-columns` keeps them.
 */
import { useMemo } from 'react';
import { columnsOfDocuments } from '../../features/table/detect-columns';
import type { ColumnLayout, ColumnNode, Document, TableTarget } from '../../features/table/types';
import { rememberedColumns } from '../../shared/state/table';
import { useAppState } from '../state/store';
import type { CollectionRef } from '../query/collection-reads';
import type { CollectionTab } from '../query/collection-store';

/** The columns of the table, its layout and the expanded paths. */
export interface TableColumns {
  readonly columns: readonly ColumnNode[];
  readonly layout: ColumnLayout;
  readonly expanded: readonly string[];
}

/** The columns of a page, with what the collection remembers. */
export function tableColumnsOf(
  remembered: { readonly layout: ColumnLayout; readonly expanded: readonly string[] },
  documents: readonly Document[],
): TableColumns {
  return {
    columns: columnsOfDocuments(documents, remembered.expanded),
    layout: remembered.layout,
    expanded: remembered.expanded,
  };
}

/** The columns of a tab's table, drawn again when its documents or what the collection remembers change. */
export function useTableColumns(ref: CollectionRef, collection: CollectionTab): TableColumns {
  const state = useAppState();
  const remembered = rememberedColumns(state.table, ref);
  return useMemo(() => tableColumnsOf(remembered, collection.documents), [remembered, collection.documents]);
}

/** What the table shows, as the views of the table area take it. */
export function tableTargetOf(
  collection: CollectionTab,
  page: { readonly view: boolean; readonly readOnly: boolean },
): TableTarget {
  return { mode: collection.query.mode, view: page.view, readOnly: page.readOnly };
}
