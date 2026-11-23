/**
 * The table of a keys tab (`key.show`, `key.select`, `key.sort`, `key.details`): only the rows on screen are drawn;
 * 150 ms after it stops scrolling, the rows on screen not read yet are read with `key.details`. A click selects, `Ctrl`
 * and `Shift` with a click add and extend, a double click or `Enter` opens, `F2` renames, `Delete` deletes, `Ctrl+C`
 * copies the names, `Ctrl+A` selects every loaded key, `Esc` clears, `Space` shows the inspector island.
 */
import { useEffect, useRef, useState } from 'react';
import { settleMs, unreadOnScreen } from '../../../features/key/details';
import { selectionAfter, type SelectGesture, type SelectView } from '../../../features/key/select';
import type { KeyRow, KeysPageView } from '../../../features/key/show';
import { text } from '../../../features/key/text';
import { startFeature } from '../../shell/intent';
import { onKey, onSelection } from './keys-actions';
import { readDetails } from './keys-reads';
import { changeTab, type KeysTab } from './keys-store';
import { KeysHeader } from './keys-header';
import styles from './keys-page.module.css';

/** The height of a row, in px: the table draws the rows that fit in the part scrolled into view. */
export const rowHeight = 28;

/**
 * What the table starts from its rows and its keys (`@table`), carried by the grid: selecting a row shows it in the
 * inspector island, `Enter` and a double click open it, `F2` renames, `Delete` deletes one or the selected, `Ctrl+C`
 * copies the names; a click on a header sorts.
 */
const tableElements = [
  'key.inspect@table',
  'key.open@table',
  'key.rename@table',
  'key.delete@table',
  'key.delete-selected@table',
  'key.copy-name@table',
  'key.sort@table',
].join(' ');

/** What the table is drawn with. */
export interface KeysTableProps {
  readonly tabId: string;
  readonly tab: KeysTab;
  readonly page: KeysPageView;
  readonly selection: SelectView;
  readonly readOnly: boolean;
  readonly openRowMenu: (row: KeyRow, x: number, y: number) => void;
}

function select(props: KeysTableProps, gesture: SelectGesture): void {
  const rows = props.page.rows.filter((row) => !row.gone).map((row) => row.name);
  changeTab(props.tabId, (state) => ({ ...state, selection: selectionAfter(state.selection, gesture, rows) }));
}

/** The keys of the table and what they do, by key pressed. */
function onTableKey(props: KeysTableProps, event: React.KeyboardEvent, current: KeyRow | undefined): void {
  const { tab, selection, readOnly } = props;
  const several = selection.count > 1;
  const control = event.ctrlKey || event.metaKey;
  const actions: Readonly<Record<string, (() => void) | undefined>> = {
    Enter:
      current === undefined || current.gone
        ? undefined
        : () => {
            onKey(tab, current, 'key.open', 'table');
          },
    F2:
      readOnly || current === undefined
        ? undefined
        : () => {
            onKey(tab, current, 'key.rename', 'table');
          },
    Delete: readOnly
      ? undefined
      : several
        ? () => {
            onSelection(tab, selection.keys, 'key.delete-selected', 'table');
          }
        : current === undefined
          ? undefined
          : () => {
              onKey(tab, current, 'key.delete', 'table');
            },
    Escape: () => {
      select(props, { kind: 'clear' });
    },
    ' ': () => {
      startFeature('nav.toggle-inspector', { place: 'table', args: { hidden: false } });
    },
  };
  const copying = control && event.key.toLowerCase() === 'c';
  const all = control && event.key.toLowerCase() === 'a';
  const action = copying
    ? () => {
        onSelection(tab, selection.keys, 'key.copy-name', 'table');
      }
    : all
      ? () => {
          select(props, { kind: 'all' });
        }
      : actions[event.key];
  const moved = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (moved !== 0) {
    const rows = props.page.rows.filter((row) => !row.gone);
    const at = current === undefined ? -1 : rows.findIndex((row) => row.id === current.id);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + moved))];
    if (next !== undefined) {
      select(props, { kind: event.shiftKey ? 'extend' : 'click', key: next.name });
    }
    event.preventDefault();
    return;
  }
  if (action !== undefined) {
    event.preventDefault();
    action();
  }
}

/** The rows on screen, 150 ms after scrolling stops, and whether they were read. */
function useRowsOnScreen(props: KeysTableProps, scroller: React.RefObject<HTMLDivElement | null>) {
  const [range, setRange] = useState({ first: 0, count: 40 });
  const { tabId, page } = props;
  useEffect(() => {
    const timer = setTimeout(() => {
      const shown = page.rows.slice(range.first, range.first + range.count).filter((row) => !row.gone);
      const unread = unreadOnScreen(
        shown.map((row) => row.name),
        new Set(shown.filter((row) => row.read).map((row) => row.id)),
      );
      void readDetails(tabId, unread);
    }, settleMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, page.rows, range]);
  const onScroll = (): void => {
    const element = scroller.current;
    if (element !== null) {
      const first = Math.max(0, Math.floor(element.scrollTop / rowHeight) - 1);
      setRange({ first, count: Math.ceil(element.clientHeight / rowHeight) + 2 });
    }
  };
  return { range, onScroll };
}

function Row(props: { readonly table: KeysTableProps; readonly row: KeyRow; readonly index: number }) {
  const { table, row, index } = props;
  return (
    <div
      role="row"
      className={styles['row']}
      aria-rowindex={index + 2}
      aria-selected={row.selected}
      data-gone={row.gone ? 'true' : undefined}
      style={{ top: index * rowHeight, height: rowHeight }}
      onClick={(event) => {
        if (!row.gone) {
          const kind = event.shiftKey ? 'extend' : event.ctrlKey || event.metaKey ? 'toggle' : 'click';
          select(table, { kind, key: row.name });
        }
      }}
      onDoubleClick={() => {
        onKey(table.tab, row, 'key.open', 'table');
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!row.gone) {
          table.openRowMenu(row, event.clientX, event.clientY);
        }
      }}
    >
      <div role="gridcell" className={styles['cell']} title={row.key}>
        {row.key}
      </div>
      <div role="gridcell" className={styles['cell']}>
        {row.gone ? text.show.gone : row.type}
      </div>
      <div role="gridcell" className={styles['cell']}>
        {row.expiry}
      </div>
      <div role="gridcell" className={styles['cell']}>
        {row.size}
      </div>
    </div>
  );
}

/** The table, drawn from the View of the page. */
export function KeysTable(props: KeysTableProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const { range, onScroll } = useRowsOnScreen(props, scroller);
  const rows = props.page.rows;
  const current = rows.find((row) => row.id === props.tab.selection.anchor && row.selected);
  return (
    <div
      ref={scroller}
      role="grid"
      aria-label={text.show.table}
      aria-multiselectable="true"
      aria-rowcount={rows.length + 1}
      aria-busy={props.page.busy ? true : undefined}
      tabIndex={0}
      className={styles['grid']}
      data-feature="key.select@table"
      data-key-features={tableElements}
      onScroll={onScroll}
      onKeyDown={(event) => {
        if (((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') && current !== undefined) {
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          props.openRowMenu(current, box.left + rowHeight, box.top + rowHeight * 2);
          return;
        }
        onTableKey(props, event, current);
      }}
    >
      <KeysHeader tabId={props.tabId} tab={props.tab} page={props.page} />
      <div role="rowgroup" className={styles['body']} style={{ height: rows.length * rowHeight }}>
        {rows.slice(range.first, range.first + range.count).map((row, offset) => (
          <Row key={row.id} table={props} row={row} index={range.first + offset} />
        ))}
      </div>
    </div>
  );
}
