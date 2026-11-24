/**
 * The rows of one document (`table.rows`): one row of the grid per sub-row, the row number across all of them, and its
 * cells, each written as `table.cell-text` says with the color of its kind. A click selects the cell and the document
 * (`table.navigate`, `table.selection`); a cell that holds a value is dragged onto the bar (`query.drag`); a right
 * click opens the menu of the cell or of the row.
 */
import { cellOfValue } from '../../features/table/cell-text';
import type { Cell, PaintedColor, Row } from '../../features/table/rows';
import { text as tableText } from '../../features/table/text';
import type { Position } from '../../features/table/navigate';
import { startDrag } from '../query/drag-data';
import { positionKey, subRowHeight, syntaxOf } from './grid-model';
import type { GridView } from './grid-view';
import { openTableMenu } from './menu-request';
import { editOrInspect } from '../pages/document/table-entries';
import { collectionOf } from '../query/collection-store';
import { changeSelection, selectCell } from './table-actions';
import type { TableReferences } from '../../features/relation/follow';
import { useTableReferences } from '../pages/relation/references';
import { followCell, linkClass, linkOf } from '../pages/relation/table-links';
import styles from './table.module.css';

/** A click on a cell or a row number: the cell selected, and the document alone, added, or the range to it. */
function clicked(grid: GridView, index: number, at: Position, event: React.MouseEvent): void {
  selectCell(grid.ref, at);
  if (event.ctrlKey || event.metaKey) {
    changeSelection(grid.ref, { kind: 'toggle', index });
  } else if (event.shiftKey) {
    changeSelection(grid.ref, { kind: 'range', index });
  } else {
    changeSelection(grid.ref, { kind: 'only', index });
  }
}

/**
 * How a row or a cell is drawn in the color of a formatting rule (`table.format-table`): the preset in `data-format`,
 * which `theme/base.css` turns into its formatting token, mixed into the surface at the share given; a scale between
 * two presets with the second in `data-format-toward` at its share; a pinned value among the shades of its own color
 * outlined.
 */
function formatAttributes(color: PaintedColor | undefined): {
  readonly 'data-format'?: string;
  readonly 'data-format-toward'?: string;
  readonly 'data-format-outlined'?: boolean;
  readonly style?: React.CSSProperties;
} {
  if (color === undefined) {
    return {};
  }
  const { drawn } = color;
  return {
    'data-format': drawn.color,
    ...(drawn.toward === undefined ? {} : { 'data-format-toward': drawn.toward.color }),
    ...(drawn.outlined === true ? { 'data-format-outlined': true } : {}),
    style: {
      '--format-share': `${String(drawn.percent)}%`,
      ...(drawn.toward === undefined ? {} : { '--format-toward-share': `${String(drawn.toward.percent)}%` }),
    } as React.CSSProperties,
  };
}

function contentOf(cell: Cell): {
  readonly text: string;
  readonly title?: string;
  readonly kind?: string;
  readonly type?: string;
} {
  const { content } = cell;
  switch (content.kind) {
    case 'value': {
      const written = cellOfValue(content.value);
      const tip = [cell.note, written.tooltip, written.type].filter((each) => each !== undefined).join('\n');
      const kind = syntaxOf(written.kind);
      return {
        text: written.text,
        title: tip,
        ...(written.type === undefined ? {} : { type: written.type }),
        ...(kind === undefined ? {} : { kind }),
      };
    }
    case 'more':
      return { text: tableText.rows.more(content.count) };
    case 'missing':
    case 'filler':
      return { text: '' };
  }
}

function ValueCell(props: {
  readonly grid: GridView;
  readonly index: number;
  readonly cell: Cell;
  readonly references: TableReferences;
}) {
  const { grid, index, cell } = props;
  const column = grid.places.get(cell.column) ?? 1;
  const at: Position = { at: 'cell', row: index, subRow: cell.subRow, column };
  const selected = grid.cell.at === 'cell' && positionKey(grid.cell) === positionKey(at);
  const shown = contentOf(cell);
  const left = grid.lefts[column - 1];
  const value = cell.content.kind === 'value' ? cell.content.value : undefined;
  const within = cell.element?.array;
  // A cell that holds a reference is a link (`relation.follow`): `Ctrl`+click and `Ctrl+Enter` follow it.
  const link = linkOf(props.references, cell.column, value);
  const title = [shown.title, link?.tooltip, cell.color?.line].filter(Boolean).join('\n');
  const format = formatAttributes(cell.color);
  const sticky = left === undefined ? {} : { left, position: 'sticky', zIndex: 'var(--z-sticky-number)' };
  return (
    <td
      colSpan={cell.span}
      rowSpan={cell.height}
      className={link === undefined ? styles['cell'] : `${styles['cell'] ?? ''} ${linkClass}`}
      data-format={format['data-format']}
      data-format-toward={format['data-format-toward']}
      data-format-outlined={format['data-format-outlined']}
      style={{ ...format.style, ...sticky } as React.CSSProperties}
      data-pos={positionKey(at)}
      data-selected={selected ? 'true' : undefined}
      data-content={cell.content.kind}
      data-column={cell.column}
      data-syntax={shown.kind}
      aria-colindex={column + 1}
      tabIndex={selected ? 0 : -1}
      title={title}
      draggable={value !== undefined}
      data-feature={value === undefined ? undefined : link === undefined ? 'query.drag@table' : link.element}
      // A cell that holds a reference is marked by `relation.follow`, and following it is `relation.open-referenced`.
      data-follow={link === undefined ? undefined : 'relation.follow@table'}
      onClick={(event) => {
        if (link !== undefined && value !== undefined && (event.ctrlKey || event.metaKey)) {
          followCell(grid.ref, props.references, cell.column, value);
          return;
        }
        clicked(grid, index, at, event);
      }}
      onKeyDown={(event) => {
        if (link !== undefined && value !== undefined && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          followCell(grid.ref, props.references, cell.column, value);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        selectCell(grid.ref, at);
        openTableMenu({
          kind: 'cell',
          tab: grid.ref.tab,
          row: index,
          column: cell.column,
          x: event.clientX,
          y: event.clientY,
          returnFocus: event.currentTarget,
          cell,
          ...(within === undefined ? {} : { within }),
          ...(value === undefined ? {} : { value }),
        });
      }}
      onDoubleClick={(event) => {
        const collection = collectionOf(grid.ref.tab);
        const at = { cell, row: index, anchor: event.currentTarget };
        editOrInspect({ ref: grid.ref, collection, target: grid.target, cell: at }, true);
      }}
      onDragStart={(event) => {
        if (value !== undefined) {
          startDrag(event.dataTransfer, {
            kind: 'cell',
            field: cell.column,
            value,
            ...(within === undefined ? {} : { within }),
          });
        }
      }}
    >
      <span className={styles['cell-text']}>{shown.text}</span>
      {shown.type === undefined ? null : <span className={styles['spoken']}>, {shown.type}</span>}
      {cell.color === undefined ? null : <span className={styles['spoken']}>, {cell.color.line}</span>}
    </td>
  );
}

function NumberCell({ grid, index, row }: { readonly grid: GridView; readonly index: number; readonly row: Row }) {
  const at: Position = { at: 'cell', row: index, subRow: 0, column: 0 };
  const selected = grid.cell.at === 'cell' && grid.cell.row === index && grid.cell.column === 0;
  return (
    <td
      rowSpan={row.height}
      className={`${styles['cell'] ?? ''} ${styles['number'] ?? ''}`}
      style={{ left: 0 }}
      data-pos={positionKey(at)}
      data-selected={selected ? 'true' : undefined}
      aria-colindex={1}
      tabIndex={selected ? 0 : -1}
      title={row.color === undefined ? tableText.rows.inspect : `${tableText.rows.inspect}\n${row.color.line}`}
      onClick={(event) => {
        clicked(grid, index, at, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        selectCell(grid.ref, at);
        openTableMenu({
          kind: 'row',
          tab: grid.ref.tab,
          row: index,
          x: event.clientX,
          y: event.clientY,
          returnFocus: event.currentTarget,
        });
      }}
    >
      {row.number}
      {row.color === undefined ? null : <span className={styles['spoken']}>, {row.color.line}</span>}
    </td>
  );
}

/** The rows of one document. */
export function DocumentRows({
  grid,
  index,
}: {
  readonly grid: GridView;
  readonly index: number;
}): React.JSX.Element | null {
  const row = grid.rows[index];
  const references = useTableReferences(grid.ref, grid.target.mode);
  if (row === undefined) {
    return null;
  }
  const selected = grid.selected.has(row.key);
  const first = grid.header.length + (grid.offsets[index] ?? 0) + 1;
  const rowFormat = formatAttributes(row.color);
  return (
    <>
      {Array.from({ length: row.height }, (_, subRow) => (
        <tr
          key={String(subRow)}
          className={styles['row']}
          data-format={rowFormat['data-format']}
          data-format-toward={rowFormat['data-format-toward']}
          data-format-outlined={rowFormat['data-format-outlined']}
          style={{ height: subRowHeight, ...rowFormat.style }}
          aria-rowindex={first + subRow}
          aria-selected={selected}
          data-row={index}
        >
          {subRow === 0 ? <NumberCell grid={grid} index={index} row={row} /> : null}
          {row.cells
            .filter((cell) => cell.subRow === subRow)
            .map((cell) => (
              <ValueCell key={cell.column} grid={grid} index={index} cell={cell} references={references} />
            ))}
        </tr>
      ))}
    </>
  );
}
