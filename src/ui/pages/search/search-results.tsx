/**
 * The documents found (`@list`), one group per collection, as `search.show` gives them: the head of a group folds it,
 * **Open in collection** opens its documents in their collection tab (`search.open-in-collection`), **Copy _id**
 * copies the `_id` of an item (`search.copy-id`). Selecting an item (a click, the arrow keys) shows its document in the
 * inspector island; a double click or `Enter` opens it in a document tab; its context menu (`@item-menu`) has **Open
 * document**, **Open in collection** and **Copy _id**.
 */
import { useState } from 'react';
import type { CopyControl, GroupView, ItemView, OpenControl } from '../../../features/search/model/groups';
import { text } from '../../../features/search/text';
import type { MenuEntry } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { MenuList } from '../../table/menu-list';
import { clearSelection, openItem, selectItem, toggleGroup } from './search-changes';
import { searchTabOf, type SearchSelection } from './search-store';
import styles from './search-page.module.css';

function fields(args: Json): Readonly<Record<string, Json>> {
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, Json>>)
    : {};
}

/** The selection an item makes. */
function selectionOf(group: GroupView, item: ItemView): SearchSelection {
  const args = fields(item.inspect.args);
  return {
    key: group.key,
    idText: item.idText,
    database: typeof args['database'] === 'string' ? args['database'] : '',
    collection: typeof args['collection'] === 'string' ? args['collection'] : '',
    view: args['view'] === true,
    id: args['id'],
  };
}

/** Starts the feature of a control of the list, on the tab's connection. */
function act(tabId: string, control: OpenControl | CopyControl): void {
  const state = searchTabOf(tabId);
  if (state === undefined) {
    return;
  }
  const place = control.element.slice(control.element.indexOf('@') + 1) as Place;
  startFeature(control.feature, {
    place,
    target: { kind: 'connection', connection: state.connection },
    args: control.args,
  });
}

interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly group: GroupView;
  readonly item: ItemView;
  readonly from: HTMLElement;
}

function menuEntries(item: ItemView): readonly MenuEntry[] {
  return [
    { kind: 'entry', label: item.open.label, element: 'document.open@item-menu' },
    { kind: 'entry', label: item.menu.open.label, element: item.menu.open.element },
    { kind: 'entry', label: item.menu.copy.label, element: item.menu.copy.element },
  ];
}

function Item(props: {
  readonly tabId: string;
  readonly group: GroupView;
  readonly item: ItemView;
  readonly onMenu: (menu: OpenMenu) => void;
}) {
  const { tabId, group, item } = props;
  const selection = selectionOf(group, item);
  return (
    <li
      aria-current={item.selected ? true : undefined}
      tabIndex={item.selected ? 0 : -1}
      className={styles['item']}
      data-item={`${group.key} ${item.idText}`}
      onClick={() => {
        selectItem(tabId, selection);
      }}
      onDoubleClick={() => {
        openItem(tabId, selection);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        selectItem(tabId, selection);
        props.onMenu({ x: event.clientX, y: event.clientY, group, item, from: event.currentTarget });
      }}
    >
      <div className={styles['item-head']}>
        <code className={styles['id']}>{item.idText}</code>
        <button
          type="button"
          className={styles['link']}
          data-feature={item.copy.element}
          onClick={(event) => {
            event.stopPropagation();
            act(tabId, item.copy);
          }}
        >
          {item.copy.label}
        </button>
      </div>
      {item.lines.map((line, index) => (
        <div key={`${line.path} ${String(index)}`} className={styles['line']}>
          <span className={styles['path']}>{line.path}</span>
          {line.kind === undefined ? null : <span className={styles['badge']}>{line.kind}</span>}
          <span className={styles['context']}>
            {line.before}
            <mark className={styles['match']}>{line.match}</mark>
            {line.after}
          </span>
        </div>
      ))}
      {item.moreMatches === undefined ? null : <div className={styles['more']}>{item.moreMatches}</div>}
    </li>
  );
}

function Group(props: {
  readonly tabId: string;
  readonly group: GroupView;
  readonly onMenu: (menu: OpenMenu) => void;
}) {
  const { tabId, group } = props;
  return (
    <section className={styles['group']} aria-label={group.name}>
      <div className={styles['group-head']}>
        <button
          type="button"
          className={styles['fold']}
          aria-expanded={!group.folded}
          onClick={() => {
            toggleGroup(tabId, group.key);
          }}
        >
          <span className={`codicon codicon-chevron-${group.folded ? 'right' : 'down'}`} aria-hidden="true" />
          <span className={styles['name']}>{group.name}</span>
          {group.view ? <span className={styles['badge']}>{text.scope.view}</span> : null}
          {group.head.map((part) => (
            <span key={part} className={styles['head-part']}>
              {part}
            </span>
          ))}
        </button>
        {group.open === undefined ? null : (
          <button
            type="button"
            className={styles['button']}
            title={group.open.tooltip}
            data-feature={group.open.element}
            onClick={() => {
              if (group.open !== undefined) {
                act(tabId, group.open);
              }
            }}
          >
            {group.open.label}
          </button>
        )}
      </div>
      {group.folded ? null : (
        <ul className={styles['items']}>
          {group.items.map((item) => (
            <Item key={item.idText} tabId={tabId} group={group} item={item} onMenu={props.onMenu} />
          ))}
          {group.more === undefined ? null : (
            <li className={styles['more']}>
              {group.more.text}
              <button
                type="button"
                className={styles['link']}
                data-feature={group.more.open.element}
                onClick={() => {
                  if (group.more !== undefined) {
                    act(tabId, group.more.open);
                  }
                }}
              >
                {group.more.open.label}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/** The items shown, in the order of the page: those of unfolded groups. */
function shownItems(groups: readonly GroupView[]): readonly { group: GroupView; item: ItemView }[] {
  return groups.flatMap((group) => (group.folded ? [] : group.items.map((item) => ({ group, item }))));
}

/** The arrows move the selection through the items shown; `Enter` opens the one selected. */
function onListKey(tabId: string, groups: readonly GroupView[], event: React.KeyboardEvent<HTMLElement>): void {
  const items = shownItems(groups);
  const at = items.findIndex((each) => each.item.selected);
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  const current = items[at];
  if (event.key === 'Enter' && current !== undefined && (event.target as HTMLElement).dataset['item'] !== undefined) {
    event.preventDefault();
    openItem(tabId, selectionOf(current.group, current.item));
    return;
  }
  const next = step === 0 ? undefined : items[Math.min(items.length - 1, Math.max(0, at < 0 ? 0 : at + step))];
  if (next !== undefined) {
    event.preventDefault();
    selectItem(tabId, selectionOf(next.group, next.item));
    const list = event.currentTarget;
    requestAnimationFrame(() => {
      list.querySelector<HTMLElement>(`[data-item="${CSS.escape(`${next.group.key} ${next.item.idText}`)}"]`)?.focus();
    });
  }
}

/** The groups of the search, as a list whose items can be selected. */
export function SearchResults(props: { readonly tabId: string; readonly groups: readonly GroupView[] }) {
  const { tabId, groups } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  if (groups.length === 0) {
    return null;
  }
  const first = shownItems(groups)[0];
  return (
    <section
      className={styles['results']}
      aria-label={text.window.results}
      tabIndex={shownItems(groups).some((each) => each.item.selected) || first === undefined ? -1 : 0}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && searchTabOf(tabId)?.selected !== undefined && !event.defaultPrevented) {
          clearSelection(tabId);
          return;
        }
        onListKey(tabId, groups, event);
      }}
    >
      {groups.map((group) => (
        <Group key={group.key} tabId={tabId} group={group} onMenu={setMenu} />
      ))}
      {menu === undefined ? null : (
        <MenuList
          label={text.window.itemMenu}
          element="search.open-in-collection@item-menu"
          x={menu.x}
          y={menu.y}
          entries={menuEntries(menu.item)}
          returnFocus={menu.from}
          onClose={() => {
            setMenu(undefined);
          }}
          onChoose={(entry) => {
            setMenu(undefined);
            if (entry.element === 'document.open@item-menu') {
              openItem(tabId, selectionOf(menu.group, menu.item));
            } else if (entry.element === menu.item.menu.open.element) {
              act(tabId, menu.item.menu.open);
            } else {
              act(tabId, menu.item.menu.copy);
            }
          }}
        />
      )}
    </section>
  );
}
