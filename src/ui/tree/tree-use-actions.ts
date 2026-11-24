/**
 * The handlers of the tree island of one connection: what a click, a double click, a right click and a key on a line
 * do, what the header and the field of the filter do, and the context menu that is open.
 */
import { useState } from 'react';
import { menuOfItem, withFilterText } from '../../features/tree/show';
import { moveControl } from '../../features/tree/pinned';
import type { Control, TreeItem } from '../../features/tree/types';
import { focusIsland } from '../shell/focus';
import type { TreeHandle } from '../components/tree';
import { activate, press, pressKey, selectWith, toggle, type TreeActions } from './tree-actions';
import type { OpenMenu } from './tree-menu';
import { listForFilter } from './tree-reads';
import { menuOfCard, type IslandRow } from './tree-rows';
import { changeIsland, changeTree, treeOf } from './tree-store';
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import type { TreeInput } from '../../features/tree/types';

/** What the handlers are made from. */
export interface ActionsSource {
  readonly state: AppState;
  readonly connection: ConnectionView;
  readonly input: TreeInput;
  readonly shown: { readonly items: readonly TreeItem[] };
  readonly treeRef: React.RefObject<TreeHandle | null>;
}

/** The name of a line, which its menu is named after. */
function nameOf(item: TreeItem): string {
  return item.kind === 'node' ? item.name : item.text;
}

function useMenu(source: ActionsSource, focusItem: (item: string) => void) {
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const openMenu = (item: string, at?: { readonly x: number; readonly y: number }): void => {
    const found = source.shown.items.find((each) => each.id === item);
    const entries = found === undefined ? [] : menuOfItem(source.input, found, source.shown.items);
    if (found === undefined || entries.length === 0) {
      return;
    }
    const box = source.treeRef.current?.elementOf(item)?.getBoundingClientRect();
    const point = at ?? { x: (box?.left ?? 0) + (box?.width ?? 0) / 4, y: box?.bottom ?? 0 };
    const element = menuOfCard(found, source.connection.engine);
    setMenu({ item, label: nameOf(found), element, x: point.x, y: point.y, entries });
  };
  const closeMenu = (focus: 'back' | 'leave'): void => {
    const item = menu?.item;
    setMenu(undefined);
    if (focus === 'back' && item !== undefined) {
      focusItem(item);
    }
  };
  return { menu, openMenu, closeMenu };
}

function useFilter(source: ActionsSource, focusItem: (item: string) => void) {
  const id = source.connection.id;
  const [focusFilter, setFocusFilter] = useState(0);
  const applyFilter = (typed: string): void => {
    changeIsland(id, (island) => withFilterText({ ...source.input, island }, typed));
    if (source.connection.engine === 'mongodb' && typed.trim() !== '') {
      void listForFilter(source.state, id);
    }
  };
  const openFilter = (): void => {
    changeIsland(id, (island) => ({ ...island, filter: { ...island.filter, open: true } }));
    setFocusFilter((count) => count + 1);
  };
  const firstShown = (kind: 'node' | 'any'): string | undefined =>
    source.shown.items.find((item) => (kind === 'node' ? item.kind === 'node' : item.kind !== 'line'))?.id;
  const closeFilter = (): void => {
    applyFilter('');
    changeIsland(id, (island) => ({ ...island, filter: { open: false, text: '' } }));
    const back = treeOf(id).focus ?? firstShown('any');
    if (back !== undefined) {
      focusItem(back);
    }
  };
  const leaveFilter = (): void => {
    const first = firstShown('node') ?? firstShown('any');
    if (first !== undefined) {
      focusItem(first);
    }
  };
  return { applyFilter, openFilter, closeFilter, leaveFilter, focusFilter };
}

/** The handlers of the tree island of a connection. */
export function useTreeActions(source: ActionsSource) {
  const id = source.connection.id;
  const focusItem = (item: string): void => {
    changeTree(id, (tree) => (tree.focus === item ? tree : { ...tree, focus: item }));
    source.treeRef.current?.focusRow(item);
  };
  const { menu, openMenu, closeMenu } = useMenu(source, focusItem);
  const filter = useFilter(source, focusItem);
  const base: TreeActions = {
    state: source.state,
    connection: id,
    input: source.input,
    items: source.shown.items,
    openFilter: filter.openFilter,
    clearFilter: () => {
      filter.applyFilter('');
    },
    openMenu,
    focusItem,
  };
  const actions = {
    ...base,
    press: (control: Control) => {
      press(base, control);
    },
  };
  const rowEvents = {
    onFocusRow: (row: IslandRow) => {
      changeTree(id, (tree) => (tree.focus === row.id ? tree : { ...tree, focus: row.id }));
    },
    onKeyDown: (event: React.KeyboardEvent, row: IslandRow) => {
      pressKey(base, event, row.item);
    },
    onClick: (event: React.MouseEvent, row: IslandRow) => {
      if (event.detail > 1) {
        return;
      }
      const onTwisty = event.target instanceof Element && event.target.closest('[data-twisty]') !== null;
      if (onTwisty && row.expanded !== undefined) {
        toggle(base, row.id, row.expanded ? 'collapse' : 'expand');
      } else if (event.ctrlKey || event.metaKey || event.shiftKey) {
        selectWith(base, row.item, event.shiftKey ? 'range' : 'toggle');
      } else {
        activate(base, row.item);
      }
    },
    onDoubleClick: (_event: React.MouseEvent, row: IslandRow) => {
      const { item } = row;
      if (item.kind === 'node' && item.click !== undefined && item.expandable) {
        toggle(base, row.id, item.expanded ? 'collapse' : 'expand');
      } else if (item.kind === 'node' && item.click !== undefined && item.ref.kind === 'collection') {
        focusIsland('main');
      }
    },
    onContextMenu: (event: React.MouseEvent, row: IslandRow) => {
      event.preventDefault();
      openMenu(row.id, { x: event.clientX, y: event.clientY });
    },
    onDropRow: (dragged: IslandRow, onto: IslandRow) => {
      const control = moveControl(source.input, dragged.id, { item: onto.id });
      if (control !== undefined) {
        actions.press(control);
      }
    },
  };
  const header = { ...filter };
  return { actions, header, rowEvents, menu, closeMenu, choose: actions.press };
}
