/**
 * The table of a value that is not a string (`value.show`): only the rows on screen are drawn. A click selects a row
 * and shows it in the inspector island, `Ctrl` and `Shift` with a click add and extend, the arrows move; a double click,
 * `Enter` or `F2` on a cell that can be changed opens `value.item-editor`, and on a member or an entry says why it
 * cannot; `Delete` removes the selected fields, elements, members or entries, `Ctrl+C` copies the cell or the rows,
 * `Ctrl+A` selects every row loaded, `Esc` clears; the context menu (`Shift+F10`, `value-menus.ts`) copies the cell or
 * the rows, edits, renames and removes. A click on the header of a hash or a set sorts the rows loaded.
 */
import { useRef, useState } from 'react';
import { rowName, type Column, type ValueRow } from '../../../features/value/show';
import { hexOf } from '../../../features/value/types';
import { KeysMenu, type OpenKeysMenu } from '../keys/keys-menu';
import { CellEditor } from './item-editor';
import { cellMenuOf, edit, rowMenuOf, select, type ValueTableProps } from './value-menus';
import { cellOf, copyCell, copyRows, removeRows, rowsInOrder, selectedRows } from './value-actions';
import { changeValue } from './value-store';
import styles from './value.module.css';

export type { ValueTableProps } from './value-menus';

/** The height of a row, in px. */
const rowHeight = 28;

/** What the table starts from its keys (`@table`): the editor, the removals and the copy. */
const tableElements = [
  'value.item-editor@table',
  'value.remove-fields@table',
  'value.remove-elements@table',
  'value.remove-members@table',
  'value.remove-scored-members@table',
  'value.delete-entries@table',
  'value.copy@table',
].join(' ');

/** The column `F2` and `Enter` edit: the one last clicked when it can be changed, else the first that can. */
function editedColumn(props: ValueTableProps): Column | undefined {
  const columns = props.table.columns;
  const clicked = columns.find((column) => column.name === props.tab.column);
  return clicked?.cell !== undefined || clicked?.tooltip !== undefined
    ? clicked
    : (columns.find((column) => column.name === 'Value') ??
        columns.find((column) => column.cell !== undefined) ??
        columns[0]);
}

function onTableKey(
  props: ValueTableProps,
  event: React.KeyboardEvent,
  current: ValueRow | undefined,
  say: (text: string) => void,
): void {
  const control = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const rows = rowsInOrder(props.tab);
  const moved = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (moved !== 0) {
    const at = current === undefined ? -1 : rows.indexOf(current);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + moved))];
    if (next !== undefined) {
      select(props, { kind: event.shiftKey ? 'extend' : 'click', key: rowName(next) });
    }
    event.preventDefault();
    return;
  }
  const action =
    control && key === 'c'
      ? () => void copyFromKeys(props, current)
      : control && key === 'a'
        ? () => {
            select(props, { kind: 'all' });
          }
        : event.key === 'Escape'
          ? () => {
              select(props, { kind: 'clear' });
            }
          : (event.key === 'Enter' || event.key === 'F2') && current !== undefined
            ? () => {
                edit(props, current, editedColumn(props), say);
              }
            : event.key === 'Delete' && !props.readOnly
              ? () => void removeRows(props.tabId, selectedRows(props.tab), 'table')
              : undefined;
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
}

/** `Ctrl+C`: the cell last clicked of the one row selected, or the selected rows. */
async function copyFromKeys(props: ValueTableProps, current: ValueRow | undefined): Promise<void> {
  const selected = selectedRows(props.tab);
  const column = props.tab.column;
  if (selected.length === 1 && current !== undefined && column !== undefined && props.tab.type !== 'stream') {
    await copyCell(props.tabId, cellOf(current, column), 'value', 'table');
    return;
  }
  await copyRows(props.tabId, selected, 'rows', 'table');
}

function Header(props: ValueTableProps): React.JSX.Element {
  const { tab, table } = props;
  const sortable = tab.type === 'hash' || tab.type === 'set';
  return (
    <div role="rowgroup" className={styles['head']}>
      <div role="row" aria-rowindex={1} className={styles['head-row']}>
        {table.columns.map((column) => (
          <div
            key={column.name}
            role="columnheader"
            className={styles['heading']}
            aria-sort={tab.sort?.column === column.name ? tab.sort.order : 'none'}
          >
            <button
              type="button"
              className={styles['heading-button']}
              aria-disabled={sortable ? undefined : true}
              onClick={() => {
                if (sortable) {
                  changeValue(props.tabId, (now) => {
                    const { sort, ...rest } = now;
                    const order =
                      sort?.column !== column.name
                        ? 'ascending'
                        : sort.order === 'ascending'
                          ? 'descending'
                          : undefined;
                    return order === undefined ? rest : { ...rest, sort: { column: column.name, order } };
                  });
                }
              }}
            >
              {column.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row(props: {
  readonly table: ValueTableProps;
  readonly row: ValueRow;
  readonly cells: readonly string[];
  readonly index: number;
  readonly say: (text: string) => void;
  readonly openMenu: (menu: OpenKeysMenu) => void;
}): React.JSX.Element {
  const { table, row, cells, index, say } = props;
  const name = hexOf(rowName(row));
  const selected = table.tab.selection.keys.has(name);
  const editing = table.tab.editing?.row === name ? table.tab.editing : undefined;
  return (
    <div
      role="row"
      className={styles['row']}
      aria-rowindex={index + 2}
      aria-selected={selected}
      style={{ top: index * rowHeight, height: rowHeight }}
    >
      {table.table.columns.map((column, at) => (
        <div
          key={column.name}
          role="gridcell"
          className={styles['cell']}
          title={column.tooltip ?? cells[at]}
          onClick={(event) => {
            const kind = event.shiftKey ? 'extend' : event.ctrlKey || event.metaKey ? 'toggle' : 'click';
            select(table, { kind, key: rowName(row) }, column.name);
          }}
          onDoubleClick={() => {
            edit(table, row, column, say);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            props.openMenu(cellMenuOf(table, row, column, { x: event.clientX, y: event.clientY }));
          }}
        >
          {cells[at]}
          {editing?.column === column.name ? <CellEditor tabId={table.tabId} row={row} editing={editing} /> : null}
        </div>
      ))}
    </div>
  );
}

/** The table, drawn from the View of the value. */
export function ValueTable(props: ValueTableProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ first: 0, count: 40 });
  const [said, say] = useState('');
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  const rows = rowsInOrder(props.tab);
  const anchor = props.tab.selection.anchor;
  const current = rows.find((row) => hexOf(rowName(row)) === anchor && props.tab.selection.keys.has(anchor));
  const columns = `repeat(${String(props.table.columns.length)}, minmax(0, 1fr))`;
  return (
    <>
      <div
        ref={scroller}
        role="grid"
        aria-label="Items"
        aria-multiselectable="true"
        aria-rowcount={rows.length + 1}
        tabIndex={0}
        className={styles['grid']}
        style={{ ['--value-columns' as string]: columns }}
        data-feature="value.item-editor@table"
        data-key-features={tableElements}
        onScroll={() => {
          const element = scroller.current;
          if (element !== null) {
            setRange({
              first: Math.max(0, Math.floor(element.scrollTop / rowHeight) - 1),
              count: Math.ceil(element.clientHeight / rowHeight) + 2,
            });
          }
        }}
        onKeyDown={(event) => {
          if (((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') && current !== undefined) {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            setMenu(rowMenuOf(props, current, box.left + rowHeight, box.top + rowHeight * 2));
            return;
          }
          onTableKey(props, event, current, say);
        }}
      >
        <Header {...props} />
        <div role="rowgroup" className={styles['body']} style={{ height: rows.length * rowHeight }}>
          {rows.slice(range.first, range.first + range.count).map((row, offset) => (
            <Row
              key={hexOf(rowName(row))}
              table={props}
              row={row}
              cells={props.table.rows[range.first + offset] ?? []}
              index={range.first + offset}
              say={say}
              openMenu={setMenu}
            />
          ))}
        </div>
      </div>
      <p className={styles['line']} role="status">
        {said}
      </p>
      <KeysMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </>
  );
}
