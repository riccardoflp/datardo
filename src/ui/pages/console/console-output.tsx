/**
 * `console.output`: the commands run in the console and their replies, the oldest at the top, as a list a screen
 * reader reads item by item, each with its context menu (`@item-menu`). The output follows the newest reply unless
 * the user scrolled up; then **Newest** goes back down. A click on a string of a reply selects it for the inspector
 * island; `Esc` clears the selection; `Ctrl+C` on an item with no text selected copies its reply.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  copyValueEntry,
  elementsShown,
  view as outputView,
  type MenuEntry,
  type OutputItem,
} from '../../../features/console/output';
import type { ConsoleState } from '../../../features/console/types';
import type { Json } from '../../../shared/engine-request';
import { startFeature } from '../../shell/intent';
import { consoleTarget, runLine } from './console-actions';
import { changeTab, type ConsoleTab } from './console-store';
import styles from './console-page.module.css';

/** Where a context menu of the output is open, with which entries. */
interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
}

function choose(console: ConsoleState, entry: MenuEntry): void {
  if (entry.feature === 'console.run') {
    runLine(console.connection, String(entry.args['line'] ?? ''), 'item-menu');
    return;
  }
  startFeature(entry.feature, {
    place: 'item-menu',
    target: consoleTarget(console.connection),
    args: entry.args as Json,
  });
}

function OutputMenu(props: {
  readonly menu: OpenMenu | undefined;
  readonly console: ConsoleState;
  readonly onClose: () => void;
}): React.JSX.Element | null {
  const { menu } = props;
  if (menu === undefined) {
    return null;
  }
  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span aria-hidden="true" style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles['menu']}
          aria-label="Output"
          align="start"
          data-feature="console.output@item-menu"
        >
          {menu.entries.map((entry) => (
            <DropdownMenu.Item
              key={entry.label}
              className={styles['menu-item']}
              data-feature={entry.element}
              onSelect={() => {
                choose(props.console, entry);
              }}
            >
              {entry.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The string of a line a click or a menu takes: the value of a map's line, the one string of the others. */
function stringOf(line: OutputItem['lines'][number]): number | undefined {
  return line.strings.length === 0 ? undefined : line.strings.length - 1;
}

/** What follows the lines of a reply: **Show 1,000 more**, **Show all**, the refusal, the failure and the notes. */
function ItemEnd(props: {
  readonly item: OutputItem;
  readonly tabId: string;
  readonly console: ConsoleState;
}): React.JSX.Element {
  const { item, tabId, console } = props;
  return (
    <>
      {item.more === undefined ? null : (
        <div className={styles['more']}>
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              changeTab(tabId, (state) => ({
                ...state,
                shown: { ...state.shown, [item.id]: (state.shown[item.id] ?? elementsShown) + elementsShown },
              }));
            }}
          >
            {item.more.label}
          </button>
          <span>{item.more.shownOf}</span>
        </div>
      )}
      {item.showAll === undefined ? null : (
        <div className={styles['more']}>
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              changeTab(tabId, (state) => ({ ...state, whole: [...state.whole, item.id] }));
            }}
          >
            {item.showAll.label}
          </button>
          <span>{item.showAll.size}</span>
        </div>
      )}
      {item.refusal === undefined ? null : (
        <div className={styles['error']}>
          {item.refusal.message}
          {item.refusal.openPubSub === undefined ? null : (
            <>
              {' '}
              <button
                type="button"
                className={styles['button']}
                onClick={() => {
                  startFeature(item.refusal?.openPubSub?.feature ?? '', {
                    place: 'list',
                    target: consoleTarget(console.connection),
                  });
                }}
              >
                {item.refusal.openPubSub.label}
              </button>
            </>
          )}
        </div>
      )}
      {item.failure === undefined ? null : <div className={styles['error']}>{item.failure}</div>}
      {item.notes.map((note) => (
        <div key={note} className={styles['note']}>
          {note}
        </div>
      ))}
    </>
  );
}

function Item(props: {
  readonly item: OutputItem;
  readonly tabId: string;
  readonly tab: ConsoleTab;
  readonly console: ConsoleState;
  readonly openMenu: (menu: OpenMenu) => void;
}): React.JSX.Element {
  const { item, tabId, tab, console } = props;
  const selected = tab.selected?.entry === item.id ? tab.selected : undefined;
  return (
    <li
      className={styles['item']}
      tabIndex={0}
      onContextMenu={(event) => {
        if (item.menu.length === 0) {
          return;
        }
        event.preventDefault();
        const line = (event.target as HTMLElement).closest('[data-line]')?.getAttribute('data-line');
        const at = line === null || line === undefined ? undefined : Number(line);
        const string =
          at === undefined ? undefined : stringOf(item.lines[at] ?? { text: '', kind: 'value', strings: [] });
        const value = at === undefined || string === undefined ? [] : [copyValueEntry(item.id, at, string)];
        props.openMenu({
          x: event.clientX,
          y: event.clientY,
          entries: [...item.menu.slice(0, 1), ...value, ...item.menu.slice(1)],
        });
      }}
      onKeyDown={(event) => {
        const nothingSelected = (window.getSelection()?.toString() ?? '') === '';
        if (event.key === 'c' && (event.ctrlKey || event.metaKey) && nothingSelected && item.menu.length > 0) {
          event.preventDefault();
          startFeature('console.copy-reply', {
            place: 'item-menu',
            target: consoleTarget(console.connection),
            args: { variant: 'reply', entry: item.id },
          });
        }
      }}
    >
      {item.line === '' ? null : (
        <div className={styles['command']}>
          <span className={styles['prompt']}>{item.prompt}</span> <span className={styles['line']}>{item.line}</span>
          <span className={styles['time']}>
            {item.took === undefined ? item.sentAt : `${item.sentAt} · ${item.took}`}
          </span>
        </div>
      )}
      {item.lines.map((line, index) => {
        const string = stringOf(line);
        return (
          <div
            key={index}
            data-line={index}
            data-kind={line.kind}
            className={styles['reply-line']}
            // The string the inspector island shows: `aria-current`, since a line of the output is no option.
            aria-current={selected?.line === index ? true : undefined}
            onClick={() => {
              if (string !== undefined) {
                changeTab(tabId, (state) => ({ ...state, selected: { entry: item.id, line: index, string } }));
              }
            }}
          >
            {line.text}
          </div>
        );
      })}
      <ItemEnd item={item} tabId={tabId} console={console} />
    </li>
  );
}

/** The output of a console tab. */
export function ConsoleOutput(props: {
  readonly tabId: string;
  readonly tab: ConsoleTab;
  readonly console: ConsoleState;
}): React.JSX.Element {
  const { tabId, tab, console } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const listRef = useRef<HTMLOListElement>(null);
  const shown = outputView({
    console,
    offsetMinutes: -new Date().getTimezoneOffset(),
    shown: tab.shown,
    whole: tab.whole,
    scrolledUp: tab.scrolledUp,
  });
  const last = console.entries[console.entries.length - 1];
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list !== null && !tab.scrolledUp) {
      list.scrollTop = list.scrollHeight;
    }
  }, [last, tab.scrolledUp]);
  return (
    <div className={styles['output']}>
      {shown.empty === undefined ? null : <p className={styles['empty']}>{shown.empty}</p>}
      <ol
        ref={listRef}
        className={styles['list']}
        aria-label={shown.label}
        data-feature="console.output@list"
        onScroll={(event) => {
          const list = event.currentTarget;
          const up = list.scrollTop + list.clientHeight < list.scrollHeight - 8;
          if (up !== tab.scrolledUp) {
            changeTab(tabId, (state) => ({ ...state, scrolledUp: up }));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && tab.selected !== undefined) {
            changeTab(tabId, (state) => {
              const { selected: _cleared, ...rest } = state;
              return rest;
            });
          }
        }}
      >
        {shown.items.map((item) => (
          <Item key={item.id} item={item} tabId={tabId} tab={tab} console={console} openMenu={setMenu} />
        ))}
      </ol>
      {shown.newest === undefined ? null : (
        <button
          type="button"
          className={`${styles['button'] ?? ''} ${styles['newest'] ?? ''}`}
          onClick={() => {
            changeTab(tabId, (state) => ({ ...state, scrolledUp: false }));
          }}
        >
          {shown.newest}
        </button>
      )}
      <OutputMenu
        menu={menu}
        console={console}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}
