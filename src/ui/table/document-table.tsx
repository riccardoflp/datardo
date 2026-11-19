/**
 * The grid of documents (`table.show`, `table.rows`): one stop for `Tab`, a header that stays in place, the row
 * number and the pinned columns that stay at the left, and only the documents near the visible ones drawn (RS11). The
 * selected cell is kept by the tab; the keys move it (`table.navigate`).
 */
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firstCell, type Position } from '../../features/table/navigate';
import { text as tableText } from '../../features/table/text';
import type { CollectionTab } from '../query/collection-store';
import { subRowHeight } from './grid-model';
import { useGridView, type GridView, type Resizing } from './grid-view';
import { selectCell } from './table-actions';
import { TableHeader } from './table-header';
import { elementIn, tableKeyDown, type KeyPlace } from './table-keys';
import { DocumentRows } from './table-row';
import type { TablePartProps } from './table-parts';
import styles from './table.module.css';

/** The documents of the page are drawn this many beyond the visible ones. */
const overscan = 8;

function Columns({ grid }: { readonly grid: GridView }): React.JSX.Element {
  return (
    <colgroup>
      <col style={{ width: grid.numberWidth }} />
      {grid.drawn.map((leaf, index) => (
        <col key={leaf.node.key} style={{ width: grid.widths[index] }} />
      ))}
    </colgroup>
  );
}

/** A page turn shows the top of the table, with its first cell selected. */
function usePageTop(
  collection: CollectionTab,
  tab: TablePartProps['collectionRef'],
  scroller: React.RefObject<HTMLDivElement | null>,
): void {
  const { page, pageSize } = collection.query;
  const seen = useRef(`${String(page)} ${String(pageSize)}`);
  useEffect(() => {
    const now = `${String(page)} ${String(pageSize)}`;
    if (seen.current === now) {
      return;
    }
    seen.current = now;
    scroller.current?.scrollTo({ top: 0 });
    selectCell(tab, firstCell);
  }, [page, pageSize, scroller, tab]);
}

/** The grid. */
export function DocumentTable(props: TablePartProps & { readonly dimmed: boolean }): React.JSX.Element {
  const { collectionRef: ref, collection, columns, target, dimmed } = props;
  const [resizing, setResizing] = useState<Resizing | undefined>(undefined);
  const grid = useGridView(ref, collection, { columns, target, dimmed }, resizing);
  const scroller = useRef<HTMLDivElement>(null);
  const focusWanted = useRef(false);
  // TanStack Virtual (D22) returns functions the React Compiler cannot memoize: it leaves this component as it is.
  // eslint-disable-next-line react-hooks/incompatible-library
  const list = useVirtualizer({
    count: grid.rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: (index) => (grid.rows[index]?.height ?? 1) * subRowHeight,
    overscan,
  });
  usePageTop(collection, ref, scroller);
  const elementOf = useCallback((position: Position) => elementIn(scroller.current, position), []);
  const focusOn = useCallback(
    (position: Position, tries: number) => {
      const element = elementOf(position);
      if (element === null) {
        if (position.at === 'cell' && tries > 0) {
          list.scrollToIndex(position.row, { align: 'auto' });
          requestAnimationFrame(() => {
            focusOn(position, tries - 1);
          });
        }
        return;
      }
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      element.focus({ preventScroll: true });
    },
    [elementOf, list],
  );
  useEffect(() => {
    if (focusWanted.current) {
      focusWanted.current = false;
      focusOn(grid.cell, 3);
    }
  }, [grid.cell, focusOn]);
  const place: KeyPlace = {
    visibleRows: () =>
      Math.max(1, Math.floor((scroller.current?.clientHeight ?? subRowHeight) / subRowHeight) - grid.header.length),
    focusSelected: () => {
      focusWanted.current = true;
    },
    elementOf,
  };
  const items = list.getVirtualItems();
  const before = items[0]?.start ?? 0;
  const after = list.getTotalSize() - (items[items.length - 1]?.end ?? 0);
  const width = grid.numberWidth + grid.widths.reduce((sum, each) => sum + each, 0);
  return (
    <div ref={scroller} className={styles['scroller']} data-dimmed={dimmed ? 'true' : undefined}>
      <table
        role="grid"
        className={styles['grid']}
        style={{ width }}
        aria-label={tableText.commands.show}
        aria-rowcount={grid.header.length + grid.subRows}
        aria-colcount={grid.drawn.length + 1}
        aria-busy={dimmed}
        aria-multiselectable
        data-feature="table.navigate@table"
        onKeyDown={(event) => {
          tableKeyDown(grid, event, place);
        }}
      >
        <Columns grid={grid} />
        <TableHeader grid={grid} documents={collection.documents} onResizing={setResizing} />
        <tbody className={styles['body']} data-feature="table.selection@table">
          {before > 0 ? <tr role="presentation" style={{ height: before }} /> : null}
          {items.map((item) => (
            <DocumentRows key={item.key} grid={grid} index={item.index} />
          ))}
          {after > 0 ? <tr role="presentation" style={{ height: after }} /> : null}
        </tbody>
      </table>
    </div>
  );
}
