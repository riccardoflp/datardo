/**
 * The right edge of a heading, which resizes its column (`table.arrange-columns`): dragged, the column follows the
 * pointer and its width is saved when the pointer is let go, never under 40 px; a double click gives it its automatic
 * width again. Neither sorts.
 */
import { useRef } from 'react';
import { narrowestColumn } from '../../features/table/layout';
import { text as tableText } from '../../features/table/text';
import type { ColumnNode } from '../../features/table/types';
import type { GridView, Resizing } from './grid-view';
import { arrangeColumns } from './table-actions';
import styles from './table.module.css';

/** The edge of a heading. */
export function ResizeEdge({
  grid,
  node,
  onResizing,
}: {
  readonly grid: GridView;
  readonly node: ColumnNode;
  readonly onResizing: (resizing: Resizing | undefined) => void;
}): React.JSX.Element {
  const start = useRef<{ readonly x: number; readonly width: number } | undefined>(undefined);
  const latest = useRef<number | undefined>(undefined);
  const widthNow = (): number => grid.widths[(grid.places.get(node.key) ?? 1) - 1] ?? narrowestColumn;
  return (
    <span
      className={styles['resize']}
      data-feature="table.arrange-columns@table"
      title={tableText.arrange.resizeTip}
      aria-hidden="true"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, width: widthNow() };
      }}
      onPointerMove={(event) => {
        if (start.current === undefined) {
          return;
        }
        const width = Math.max(narrowestColumn, Math.round(start.current.width + event.clientX - start.current.x));
        latest.current = width;
        onResizing({ key: node.key, width });
      }}
      onPointerUp={() => {
        const width = latest.current;
        start.current = undefined;
        latest.current = undefined;
        if (width !== undefined) {
          arrangeColumns(grid.ref, { kind: 'resize', key: node.key, width }, grid.columns);
        }
        onResizing(undefined);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        arrangeColumns(grid.ref, { kind: 'reset-width', key: node.key }, grid.columns);
      }}
    />
  );
}
