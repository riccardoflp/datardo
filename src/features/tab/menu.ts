/** The last part, for a playground tab: **Save as…** (`playground.save`). */
function playgroundEntries(state: AppState, tab: TabId): readonly MenuEntry[] {
  if (findTab(state.tabs, tab)?.shows.kind !== 'playground') {
    return [];
  }
  const ids = { element: 'playground.save@tab-menu', feature: 'playground.save' };
  return [separator, item(text.menu.saveAs, ids, { tab, as: true }, { key: 'Ctrl+Shift+S' })];
}

/**
 * Feature: tab.menu
 *
 * What can be done to a tab from the strip: its context menu, opened by a right click, `Shift+F10` or the menu key.
 * The entries act on the tab the menu was opened on, which opening the menu does not make active. The context menu of
 * a group's label is here too.
 */
import type { Json } from '../../shared/engine-request';
import type { ConnectionId, TabId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { tabConnectionOf } from '../../shared/state/tabs';
import { isOffered as isCopyOffered } from '../nav/copy-path';
import { isShownOn } from '../nav/open-on-another-connection';
import { isSamePin, pinOfTab } from '../nav/pin';
import { isCollapsed } from './collapse-group';
import { isOffered as isReopenOffered } from './reopen';
import { text } from './text';
import { connectionName, findTab } from './types';

/** An entry of a menu, and the feature it starts. */
export type MenuEntry =
  | {
      readonly kind: 'item';
      readonly label: string;
      readonly key?: string;
      /** The element of the entry, written whole, as `data-feature` carries it. */
      readonly element: string;
      readonly feature: string;
      readonly args: Json;
      readonly disabled: boolean;
    }
  | { readonly kind: 'separator' };

const separator: MenuEntry = { kind: 'separator' };

function item(
  label: string,
  ids: { readonly element: string; readonly feature: string },
  args: Json,
  more: { readonly key?: string; readonly disabled?: boolean } = {},
): MenuEntry {
  return {
    kind: 'item',
    label,
    ...(more.key === undefined ? {} : { key: more.key }),
    element: ids.element,
    feature: ids.feature,
    args,
    disabled: more.disabled === true,
  };
}

const closeMany = { element: 'tab.close-many@tab-menu', feature: 'tab.close-many' };

/** The fourth part: **Pin** or **Unpin**, **Copy path**, **Open on another connection…**, where their cards offer them. */
function navEntries(state: AppState, tab: TabId): readonly MenuEntry[] {
  const shows = findTab(state.tabs, tab)?.shows;
  if (shows === undefined || shows.kind === 'app') {
    return [];
  }
  const pin = pinOfTab(shows);
  const entries: MenuEntry[] = [];
  if (pin !== undefined) {
    const pinned = (state.nav.pins[shows.connection] ?? []).some((each) => isSamePin(each, pin));
    const args = { action: pinned ? 'unpin' : 'pin', connection: shows.connection, pin: pin as unknown as Json };
    entries.push(
      item(pinned ? text.menu.unpin : text.menu.pin, { element: 'nav.pin@tab-menu', feature: 'nav.pin' }, args),
    );
  }
  if (isCopyOffered(shows)) {
    entries.push(item(text.menu.copyPath, { element: 'nav.copy-path@tab-menu', feature: 'nav.copy-path' }, { tab }));
  }
  if (isShownOn(shows)) {
    const ids = { element: 'nav.open-on-another-connection@tab-menu', feature: 'nav.open-on-another-connection' };
    entries.push(item(text.menu.openOnAnother, ids, { tab }));
  }
  return entries.length === 0 ? [] : [separator, ...entries];
}

/**
 * Feature: tab.menu
 *
 * The entries of the context menu of a tab, in this order: **Close**; **Close others**, **Close tabs of
 * \<connection\>**, **Close all**; **Reopen closed tab**; **Pin**, **Copy path**, **Open on another connection…**; and
 * for a playground tab **Save as…**.
 */
export function view(state: AppState, tab: TabId): readonly MenuEntry[] {
  const own = findTab(state.tabs, tab);
  const connection = own === undefined ? undefined : tabConnectionOf(own);
  const ofConnection =
    connection === undefined
      ? []
      : [
          item(text.menu.closeTabsOf(connectionName(state, connection)), closeMany, {
            which: 'connection',
            connection,
          }),
        ];
  return [
    item(text.menu.close, { element: 'tab.close@tab-menu', feature: 'tab.close' }, { tab }, { key: 'Ctrl+W' }),
    item(text.menu.closeOthers, closeMany, { which: 'others', tab }, { disabled: state.tabs.tabs.length <= 1 }),
    ...ofConnection,
    item(text.menu.closeAll, closeMany, { which: 'all' }),
    separator,
    item(text.menu.reopen, { element: 'tab.reopen@tab-menu', feature: 'tab.reopen' }, null, {
      key: 'Ctrl+Shift+T',
      disabled: !isReopenOffered(state),
    }),
    ...navEntries(state, tab),
    ...playgroundEntries(state, tab),
  ];
}

/** The entries of the context menu of a group's label: **Collapse group** or **Expand group**, **Close tabs of …**. */
export function labelMenu(state: AppState, connection: ConnectionId): readonly MenuEntry[] {
  const collapsed = isCollapsed(state, connection);
  const ids = { element: 'tab.collapse-group@tab-menu', feature: 'tab.collapse-group' };
  return [
    item(collapsed ? text.menu.expandGroup : text.menu.collapseGroup, ids, { connection, collapsed: !collapsed }),
    item(text.menu.closeTabsOf(connectionName(state, connection)), closeMany, { which: 'connection', connection }),
  ];
}
