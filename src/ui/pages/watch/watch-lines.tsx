/**
 * The list of a Watch changes page (`watch.show`), newest first: a line for each change event shown
 * (`watch.event-summary`), those that have just arrived highlighted for a moment. Selecting a line, with a click or
 * the arrow keys, shows its change event in the inspector island (`watch.event-detail`); `Enter` moves the focus
 * there; the context menu of a line, or `Shift+F10`, copies it or those shown (`watch.copy-events`).
 */
import { useEffect, useRef, useState } from 'react';
import type { EventRow, WatchPageView } from '../../../features/watch/show';
import { showText } from '../../../features/watch/text';
import type { WatchPage } from '../../../shared/state/watch';
import { focusIsland } from '../../shell/focus';
import { changeWatchTab, startOnPage } from './watch-store';
import styles from './watch-page.module.css';

function rowId(tab: string, number: number): string {
  return `watch-${tab}-${String(number)}`;
}

/** The lines that have just arrived are highlighted for a moment: those newer than the newest seen a moment ago. */
function useFreshAbove(page: WatchPage): number {
  const newest = page.events.at(-1)?.number ?? 0;
  const [seen, setSeen] = useState(newest);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSeen(newest);
    }, 1200);
    return () => {
      clearTimeout(timer);
    };
  }, [newest]);
  return seen;
}

function LineMenu(props: {
  readonly tab: string;
  readonly shown: WatchPageView;
  readonly number: number;
  readonly at: { readonly x: number; readonly y: number };
  readonly close: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const entries = props.shown.lineMenu.filter((entry) => entry.element.endsWith('@item-menu'));
  return (
    <div
      className={styles['menu']}
      role="menu"
      aria-label={showText.lineMenu}
      style={{ left: props.at.x, top: props.at.y }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          props.close();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          props.close();
        }
      }}
    >
      {entries.map((entry, index) => (
        <button
          key={`${entry.element} ${entry.label}`}
          ref={index === 0 ? first : undefined}
          type="button"
          role="menuitem"
          className={styles['menuItem']}
          data-feature={entry.element}
          onClick={() => {
            void startOnPage(props.tab, entry.feature, 'item-menu', entry.args ?? { number: props.number });
            props.close();
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** The list of the change events shown. */
export function Lines(props: {
  readonly tab: string;
  readonly page: WatchPage;
  readonly shown: WatchPageView;
  readonly body: Extract<WatchPageView['body'], { kind: 'list' }>;
}) {
  const { tab, shown, body } = props;
  const fresh = useFreshAbove(props.page);
  const [menu, setMenu] = useState<{ number: number; x: number; y: number } | undefined>(undefined);
  const select = (row: EventRow | undefined): void => {
    if (row !== undefined) {
      changeWatchTab(tab, (local) => ({ ...local, selected: row.number }));
      document.getElementById(rowId(tab, row.number))?.scrollIntoView({ block: 'nearest' });
    }
  };
  const index = body.rows.findIndex((row) => row.number === shown.selected);
  return (
    <>
      <table
        className={styles['table']}
        role="grid"
        aria-label={showText.command}
        tabIndex={0}
        aria-activedescendant={shown.selected === undefined ? undefined : rowId(tab, shown.selected)}
        data-feature="watch.event-detail@list"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            select(
              body.rows[Math.min(body.rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))],
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            focusIsland('inspector');
          } else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
            event.preventDefault();
            const box = event.currentTarget.getBoundingClientRect();
            if (shown.selected !== undefined) {
              setMenu({ number: shown.selected, x: box.left + 24, y: box.top + 48 });
            }
          }
        }}
      >
        <thead>
          <tr>
            {body.columns.map((column) => (
              <th key={column} scope="col" className={styles['heading']}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.rows.map((row) => (
            <tr
              key={row.number}
              id={rowId(tab, row.number)}
              className={styles['row']}
              aria-selected={row.selected}
              data-fresh={row.number > fresh ? 'true' : undefined}
              data-feature="watch.event-detail@list"
              onClick={() => {
                select(row);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                select(row);
                setMenu({ number: row.number, x: event.clientX, y: event.clientY });
              }}
            >
              <td title={row.timeTip}>{row.time}</td>
              <td>{row.type}</td>
              {row.collection === undefined ? null : <td>{row.collection}</td>}
              <td className={styles['code']}>{row.id}</td>
              <td className={styles['changes']}>{row.changes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {menu === undefined ? null : (
        <LineMenu
          tab={tab}
          shown={shown}
          number={menu.number}
          at={menu}
          close={() => {
            setMenu(undefined);
          }}
        />
      )}
    </>
  );
}
