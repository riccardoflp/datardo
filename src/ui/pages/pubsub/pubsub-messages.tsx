/**
 * The list of messages of the Pub/Sub page (`pubsub.messages@table`): only the rows on screen are drawn, the newest at
 * the top. With the first row on screen the table stays at the top; scrolled down it keeps its place as rows arrive
 * and shows **12 new**, which goes back to the top. A click selects a row and shows it in the inspector island, `Ctrl`
 * and `Shift` add to the selection, `Ctrl+A` selects the rows shown, `Esc` ends the selection, `Ctrl+C` copies it, and
 * the context menu, `Shift+F10` and the menu key open the row's menu (`@row-menu`). New messages are announced
 * politely, at most once every 5 seconds.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { shownMessages } from '../../../features/pubsub/filter';
import {
  announceEveryMs,
  announceText,
  newRowsText,
  view as messagesView,
  type MessageRowView,
  type MessagesView,
} from '../../../features/pubsub/messages';
import type { PubSubPage } from '../../../features/pubsub/types';
import { act, clearSelection, selectAll, selectRow } from './pubsub-actions';
import { isMenuKey, type OpenMenu } from './pubsub-menu';
import { changePubSubTab, type PubSubTab } from './pubsub-store';
import styles from './pubsub-page.module.css';

/** The height of a row, in px. */
const rowHeight = 28;

/** The numbers of the rows shown, from the top. */
export function shownNumbers(page: PubSubPage): readonly number[] {
  const rows = shownMessages(page.kept.listed, page.filter);
  const numbers: number[] = [];
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    numbers.push(rows[index]?.number ?? 0);
  }
  return numbers;
}

function newCount(numbers: readonly number[], seen: number): number {
  let count = 0;
  while (count < numbers.length && (numbers[count] ?? 0) > seen) {
    count += 1;
  }
  return count;
}

interface TableProps {
  readonly tabId: string;
  readonly tab: PubSubTab;
  readonly page: PubSubPage;
  readonly now: number;
  readonly readOnly: string | undefined;
  readonly onMenu: (menu: OpenMenu) => void;
}

function Row(props: {
  readonly table: TableProps;
  readonly row: MessageRowView;
  readonly index: number;
  readonly numbers: readonly number[];
  readonly template: string;
}): React.JSX.Element {
  const { table, row, index } = props;
  const openMenu = (x: number, y: number): void => {
    table.onMenu({
      label: row.cells[1] ?? '',
      x,
      y,
      entries: row.menu,
      element: 'pubsub.messages@row-menu',
      place: 'row-menu',
    });
  };
  return (
    <div
      role="row"
      className={styles['row']}
      aria-rowindex={index + 2}
      aria-selected={row.selected}
      data-kind={row.kind}
      style={{ top: index * rowHeight, height: rowHeight, gridTemplateColumns: props.template }}
      onClick={(event) => {
        const how = event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'only';
        selectRow(table.tabId, row.number, how, props.numbers);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!row.selected) {
          selectRow(table.tabId, row.number, 'only', props.numbers);
        }
        openMenu(event.clientX, event.clientY);
      }}
    >
      {row.cells.map((cell, column) => (
        <div
          key={column}
          role="gridcell"
          className={styles['cell']}
          title={column === 1 && row.tooltip !== undefined ? `${cell} · ${row.tooltip}` : cell}
          style={row.spans && column === 1 ? { gridColumn: '2 / -1' } : undefined}
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

function onTableKey(table: TableProps, event: React.KeyboardEvent<HTMLDivElement>, numbers: readonly number[]): void {
  const { tabId, page } = table;
  const current = numbers.indexOf(page.inspected ?? page.selected[page.selected.length - 1] ?? -1);
  const control = event.ctrlKey || event.metaKey;
  if (control && event.key.toLowerCase() === 'a') {
    selectAll(tabId, numbers);
  } else if (control && event.key.toLowerCase() === 'c') {
    act(
      tabId,
      { label: '', feature: 'pubsub.copy', element: 'pubsub.copy@selection-bar', args: { variant: 'message' } },
      'selection-bar',
      page.selected,
    );
  } else if (event.key === 'Escape' && page.selected.length > 0) {
    clearSelection(tabId);
  } else if (event.key === 'Enter' && current >= 0) {
    selectRow(tabId, numbers[current] ?? 0, 'only', numbers);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const next = numbers[Math.max(0, Math.min(numbers.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next !== undefined) {
      selectRow(tabId, next, event.shiftKey ? 'range' : 'only', numbers);
      const at = (numbers.indexOf(next) + 1) * rowHeight;
      const scroller = event.currentTarget;
      if (at < scroller.scrollTop + rowHeight || at > scroller.scrollTop + scroller.clientHeight - rowHeight) {
        scroller.scrollTop = Math.max(0, at - scroller.clientHeight / 2);
      }
    }
  } else if (isMenuKey(event)) {
    const row = messagesView({ page, now: table.now, range: { start: Math.max(0, current), count: 1 } }).rows[0];
    const box = event.currentTarget.getBoundingClientRect();
    if (row !== undefined) {
      table.onMenu({
        label: row.cells[1] ?? '',
        x: box.left + rowHeight,
        y: box.top + rowHeight * 2,
        entries: row.menu,
        element: 'pubsub.messages@row-menu',
        place: 'row-menu',
      });
    }
  } else {
    return;
  }
  event.preventDefault();
}

/** Keeps the place of a table scrolled down as rows arrive at its top, and the range of rows drawn. */
function useScrollPlace(table: TableProps, numbers: readonly number[]) {
  const scroller = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ first: 0, count: 40 });
  const newest = numbers[0] ?? 0;
  const before = useRef(newest);
  const { scrolledDown, toTop } = table.tab;
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null && scrolledDown && newest > before.current) {
      element.scrollTop += newCount(numbers, before.current) * rowHeight;
    }
    before.current = newest;
  }, [numbers, newest, scrolledDown]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element !== null) {
      element.scrollTop = 0;
    }
  }, [toTop]);
  const onScroll = (): void => {
    const element = scroller.current;
    if (element === null) {
      return;
    }
    const first = Math.max(0, Math.floor(element.scrollTop / rowHeight) - 1);
    setRange({ first, count: Math.ceil(element.clientHeight / rowHeight) + 3 });
    const down = element.scrollTop >= rowHeight / 2;
    if (down !== scrolledDown) {
      changePubSubTab(table.tabId, (state) => ({ ...state, scrolledDown: down, seenNewest: newest }));
    }
  };
  return { scroller, range, onScroll };
}

/** Says politely how many messages arrived, at most once every 5 seconds. */
function useAnnouncement(page: PubSubPage): string {
  const [said, setSaid] = useState('');
  const latest = useRef(page);
  useEffect(() => {
    latest.current = page;
  });
  const told = useRef(page.kept.next);
  useEffect(() => {
    const timer = setInterval(() => {
      const kept = latest.current.kept;
      const fresh = kept.listed.filter((row) => row.kind !== 'gap' && row.number >= told.current).length;
      told.current = kept.next;
      if (fresh > 0) {
        setSaid(announceText(fresh));
      }
    }, announceEveryMs);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return said;
}

function Header(props: { readonly columns: readonly string[]; readonly template: string }): React.JSX.Element {
  return (
    <div role="rowgroup" className={styles['head']}>
      <div role="row" aria-rowindex={1} className={styles['head-row']} style={{ gridTemplateColumns: props.template }}>
        {props.columns.map((column) => (
          <div key={column} role="columnheader" className={styles['heading']}>
            {column}
          </div>
        ))}
      </div>
    </div>
  );
}

function templateOf(shown: MessagesView): string {
  return shown.columns.length === 3
    ? '150px minmax(120px, 1fr) minmax(200px, 3fr)'
    : '150px 90px minmax(100px, 1fr) minmax(120px, 1fr) minmax(100px, 1fr)';
}

/** The table, drawing the rows that fit in the part scrolled into view. */
export function MessagesTable(props: TableProps & { readonly label: string }): React.JSX.Element {
  const numbers = shownNumbers(props.page);
  const { scroller, range, onScroll } = useScrollPlace(props, numbers);
  const said = useAnnouncement(props.page);
  const shown = messagesView({
    page: props.page,
    now: props.now,
    ...(props.readOnly === undefined ? {} : { readOnly: props.readOnly }),
    range: { start: range.first, count: range.count },
  });
  const template = templateOf(shown);
  const fresh = props.tab.scrolledDown ? newCount(numbers, props.tab.seenNewest) : 0;
  return (
    <div className={styles['messages']}>
      {fresh === 0 ? null : (
        <button
          type="button"
          className={styles['new-rows']}
          onClick={() => {
            changePubSubTab(props.tabId, (state) => ({ ...state, scrolledDown: false, toTop: state.toTop + 1 }));
          }}
        >
          {newRowsText(fresh)}
        </button>
      )}
      <div
        ref={scroller}
        role="grid"
        aria-label={props.label}
        aria-rowcount={shown.shown + 1}
        aria-multiselectable="true"
        tabIndex={0}
        className={styles['grid']}
        data-feature="pubsub.messages@table"
        onScroll={onScroll}
        onKeyDown={(event) => {
          onTableKey(props, event, numbers);
        }}
      >
        <Header columns={shown.columns} template={template} />
        <div role="rowgroup" className={styles['body']} style={{ height: shown.shown * rowHeight }}>
          {shown.rows.map((row, offset) => (
            <Row
              key={row.number}
              table={props}
              row={row}
              index={range.first + offset}
              numbers={numbers}
              template={template}
            />
          ))}
        </div>
      </div>
      {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
      {shown.dropped === undefined ? null : <p className={styles['note']}>{shown.dropped}</p>}
      <p className={styles['live']} aria-live="polite">
        {said}
      </p>
    </div>
  );
}

/** The bar of the selection: *3 selected*, **Copy**, **Export…**, **Clear selection**. */
export function SelectionBar(props: { readonly tabId: string; readonly page: PubSubPage; readonly now: number }) {
  const selection = messagesView({ page: props.page, now: props.now, range: { start: 0, count: 0 } }).selection;
  if (selection === undefined) {
    return null;
  }
  const selected = props.page.selected;
  return (
    <div
      className={styles['selection-bar']}
      role="toolbar"
      aria-label={selection.text}
      data-feature="pubsub.messages@selection-bar"
    >
      <span>{selection.text}</span>
      <button
        type="button"
        className={styles['button']}
        data-feature={selection.copy.element}
        onClick={() => {
          act(props.tabId, selection.copy, 'selection-bar', selected);
        }}
      >
        {selection.copy.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        data-feature={selection.export.element}
        onClick={() => {
          act(props.tabId, selection.export, 'selection-bar', selected);
        }}
      >
        {selection.export.label}
      </button>
      <button
        type="button"
        className={styles['button']}
        onClick={() => {
          clearSelection(props.tabId);
        }}
      >
        {selection.clear}
      </button>
    </div>
  );
}
