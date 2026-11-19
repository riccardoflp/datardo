/**
 * `connection.menu`: the menu of a saved connection, drawn from the entries its View gives, as a `…` button
 * (`ConnectionMenuButton`) or as the context menu of the element it wraps (`ConnectionContextMenu`): a right click,
 * `Shift+F10` or the menu key. An entry starts its feature on the connection, from the place of the menu.
 */
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRef } from 'react';
import { view, type MenuEntry, type MenuPlace } from '../../features/connection/menu';
import type { ConnectionId } from '../../shared/ids';
import { savedConnection, type ConnectionsState } from '../../shared/state/connections';
import { startFeature } from '../shell/intent';
import { useAppState } from '../state/store';
import styles from './connection-menu.module.css';

function start(entry: Extract<MenuEntry, { kind: 'item' }>, props: ConnectionMenuProps): void {
  startFeature(entry.feature, { place: props.place, target: { kind: 'connection', connection: props.connection } });
  props.onChosen?.();
}

function menuOf(
  connections: ConnectionsState,
  connection: ConnectionId,
  place: MenuPlace,
): ReturnType<typeof view> | undefined {
  const saved = savedConnection(connections, connection);
  return saved === undefined ? undefined : view({ connections, connection: saved, place });
}

/** What both menus are given: the connection, and where the menu is drawn. */
export interface ConnectionMenuProps {
  readonly connection: ConnectionId;
  readonly place: MenuPlace;
  /** Called after an entry is chosen: the connection switcher closes. */
  readonly onChosen?: () => void;
}

/** The `…` button of a connection, which opens its menu. */
export function ConnectionMenuButton(
  props: ConnectionMenuProps & { readonly className?: string | undefined },
): React.JSX.Element | null {
  const menu = menuOf(useAppState().connections, props.connection, props.place);
  // An entry chosen leaves the focus where its feature puts it (a form, a dialog), not on the trigger.
  const chosen = useRef(false);
  const keepFocus = (event: Event): void => {
    if (chosen.current) {
      event.preventDefault();
      chosen.current = false;
    }
  };
  if (menu === undefined) {
    return null;
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={props.className} data-feature={menu.element} aria-label={menu.label}>
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles['menu']}
          aria-label={menu.label}
          align="end"
          onCloseAutoFocus={keepFocus}
        >
          {menu.entries.map((entry, index) =>
            entry.kind === 'separator' ? (
              <DropdownMenu.Separator key={`separator ${String(index)}`} className={styles['separator']} />
            ) : (
              <DropdownMenu.Item
                key={entry.element}
                className={styles['item']}
                data-feature={entry.element}
                onSelect={() => {
                  chosen.current = true;
                  start(entry, props);
                }}
              >
                {entry.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Wraps the element of a connection with its context menu. */
export function ConnectionContextMenu(
  props: ConnectionMenuProps & { readonly children: React.JSX.Element },
): React.JSX.Element {
  const menu = menuOf(useAppState().connections, props.connection, props.place);
  // An entry chosen leaves the focus where its feature puts it (a form, a dialog), not on the trigger.
  const chosen = useRef(false);
  const keepFocus = (event: Event): void => {
    if (chosen.current) {
      event.preventDefault();
      chosen.current = false;
    }
  };
  if (menu === undefined) {
    return props.children;
  }
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{props.children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className={styles['menu']}
          aria-label={menu.label}
          data-feature={menu.element}
          onCloseAutoFocus={keepFocus}
        >
          {menu.entries.map((entry, index) =>
            entry.kind === 'separator' ? (
              <ContextMenu.Separator key={`separator ${String(index)}`} className={styles['separator']} />
            ) : (
              <ContextMenu.Item
                key={entry.element}
                className={styles['item']}
                data-feature={entry.element}
                onSelect={() => {
                  chosen.current = true;
                  start(entry, props);
                }}
              >
                {entry.label}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
