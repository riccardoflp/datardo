/**
 * Everything the grid of a tab draws from, worked out once per change of its documents, columns or selection: the
 * columns in the order of their layout, the header rows, the rows with the colors of the formatting rules, the widths and the pinned lefts, the selected
 * cell, the selected rows and the directions of the sort.
 */
import { useMemo } from 'react';
import type { Leaf } from '../../features/table/detect-columns';
import { arrangedColumns, type Arranged } from '../../features/table/layout';
import { firstCell, type Position } from '../../features/table/navigate';
import { rowsOfDocuments, type Row } from '../../features/table/rows';
import { sortDirections, type Direction } from '../../features/table/sort';
import type { RowKey, TableTarget } from '../../features/table/types';
import { pipelineHooksOf, type CollectionRef } from '../query/collection-reads';
import type { CollectionTab } from '../query/collection-store';
import {
  columnPlaces,
  drawnLeaves,
  headerRows,
  leafWidths,
  numberWidth,
  pinnedLefts,
  rowOffsets,
  type HeaderCell,
} from './grid-model';
import { useRowsFormatting } from './formatting-rules';
import type { TableColumns } from './table-columns';

/** A width being dragged, drawn before it is saved. */
export interface Resizing {
  readonly key: string;
  readonly width: number;
}

/** What the grid draws. */
export interface GridView {
  readonly ref: CollectionRef;
  readonly columns: TableColumns;
  readonly arranged: Arranged;
  readonly drawn: readonly Leaf[];
  readonly header: readonly (readonly HeaderCell[])[];
  readonly places: ReadonlyMap<string, number>;
  readonly widths: readonly number[];
  readonly lefts: readonly (number | undefined)[];
  readonly numberWidth: number;
  readonly rows: readonly Row[];
  readonly offsets: readonly number[];
  readonly subRows: number;
  readonly cell: Position;
  readonly selected: ReadonlySet<RowKey>;
  readonly directions: ReadonlyMap<string, Direction>;
  readonly target: TableTarget;
  readonly dimmed: boolean;
}

/** The selected cell, the first one when none is or the one kept is no longer in the page. */
export function cellIn(cell: Position | undefined, rows: readonly Row[], width: number): Position {
  if (cell === undefined) {
    return firstCell;
  }
  if (cell.at === 'header') {
    return cell.column > width ? { at: 'header', column: width } : cell;
  }
  return cell.row < rows.length && cell.column <= width ? cell : firstCell;
}

function widthsWith(widths: readonly number[], drawn: readonly Leaf[], resizing: Resizing | undefined): number[] {
  return widths.map((width, index) => (drawn[index]?.node.key === resizing?.key ? (resizing?.width ?? width) : width));
}

/** The grid of a tab. */
export function useGridView(
  ref: CollectionRef,
  collection: CollectionTab,
  parts: { readonly columns: TableColumns; readonly target: TableTarget; readonly dimmed: boolean },
  resizing: Resizing | undefined,
): GridView {
  const { columns, target, dimmed } = parts;
  const { documents, query } = collection;
  // The colors of the formatting rules (`table.format-table`), `ISODate()` in a condition being the time of the read.
  const formatting = useRowsFormatting(ref, documents, collection.ranAt);
  const layoutPart = useMemo(() => {
    const arranged = arrangedColumns(columns.columns, columns.layout);
    const drawn = drawnLeaves(arranged.columns);
    const first = (query.page - 1) * query.pageSize + 1;
    const rows = rowsOfDocuments(documents, arranged.columns, first, formatting);
    return {
      arranged,
      drawn,
      header: headerRows(arranged.columns),
      places: columnPlaces(drawn),
      widths: leafWidths(drawn, columns.layout, documents),
      numberWidth: numberWidth(first + documents.length),
      rows,
      ...rowOffsets(rows.map((row) => row.height)),
    };
  }, [columns, documents, query.page, query.pageSize, formatting]);
  const widths = widthsWith(layoutPart.widths, layoutPart.drawn, resizing);
  const sortText = query.ran?.sort ?? query.texts.sort;
  const findDirections = useMemo(() => sortDirections(sortText), [sortText]);
  // In Aggregate, the directions of the `$sort` at the point the table shows (`aggregate.sort-column`).
  const directions =
    query.mode === 'aggregate' ? (pipelineHooksOf()?.directions(ref.tab) ?? findDirections) : findDirections;
  const selected = useMemo(() => new Set(query.selection.keys), [query.selection.keys]);
  return {
    ref,
    columns,
    ...layoutPart,
    subRows: layoutPart.total,
    widths,
    lefts: pinnedLefts(widths, layoutPart.arranged.pinned, layoutPart.numberWidth),
    cell: cellIn(collection.cell, layoutPart.rows, layoutPart.drawn.length),
    selected,
    directions,
    target,
    dimmed,
  };
}
