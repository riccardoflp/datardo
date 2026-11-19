/**
 * The selected cell of a tab's table, as the commands of Go to act on it (`table.copy-value`, `table.copy-path`,
 * `table.expand`, `table.arrange-columns:…`, `table.sort`): its document, the column it is in, and its value when it
 * holds one. A position on a header has a column and no document.
 */
import { leaves } from '../../features/table/detect-columns';
import { arrangedColumns } from '../../features/table/layout';
import type { Position } from '../../features/table/navigate';
import { rowsOfDocuments, type Cell } from '../../features/table/rows';
import type { ColumnLayout, ColumnNode, Document } from '../../features/table/types';
import type { Json } from '../../shared/engine-request';

/** What the selected cell is. */
export interface SelectedCell {
  /** The index of its document in the page; none on a header. */
  readonly row?: number;
  readonly document?: Document;
  /** Its leaf column; none on the row number. */
  readonly column?: ColumnNode;
  /** Its value, when it holds one. */
  readonly value?: Json;
  /** The expanded array it is an element of. */
  readonly within?: string;
}

function firstLeaves(columns: readonly ColumnNode[]): ReadonlyMap<string, number> {
  const first = new Map<string, number>();
  leaves(columns).forEach((leaf, index) => {
    first.set(leaf.node.key, index + 1);
    for (const group of leaf.starts) {
      if (!first.has(group)) {
        first.set(group, index + 1);
      }
    }
  });
  return first;
}

function coveringCell(cells: readonly Cell[], first: ReadonlyMap<string, number>, at: Position): Cell | undefined {
  if (at.at !== 'cell') {
    return undefined;
  }
  return cells.find((cell) => {
    const start = first.get(cell.column) ?? 0;
    const across = at.column >= start && at.column < start + cell.span;
    return across && at.subRow >= cell.subRow && at.subRow < cell.subRow + cell.height;
  });
}

/** The selected cell of a table, from its position; `undefined` when the position is not in the table. */
export function selectedCell(
  documents: readonly Document[],
  table: { readonly columns: readonly ColumnNode[]; readonly layout: ColumnLayout },
  at: Position,
): SelectedCell | undefined {
  const drawn = arrangedColumns(table.columns, table.layout).columns;
  const column = at.column === 0 ? undefined : leaves(drawn)[at.column - 1]?.node;
  if (at.at === 'header') {
    return column === undefined ? {} : { column };
  }
  const document = documents[at.row];
  if (document === undefined) {
    return undefined;
  }
  const rows = rowsOfDocuments([document], drawn, 1);
  const cell = coveringCell(rows[0]?.cells ?? [], firstLeaves(drawn), at);
  const value = cell?.content.kind === 'value' ? { value: cell.content.value } : {};
  const within = cell?.element === undefined ? {} : { within: cell.element.array };
  return { row: at.row, document, ...(column === undefined ? {} : { column }), ...value, ...within };
}
