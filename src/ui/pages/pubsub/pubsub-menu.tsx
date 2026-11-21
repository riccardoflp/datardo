/**
 * The context menu of an item or a row of the Pub/Sub page (`@item-menu`, `@row-menu`), open at a point of the window
 * with the entries a View gave; `Escape` closes it and gives the focus back.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { MenuEntry } from '../../../features/pubsub/subscriptions';
import type { Place } from '../../../shared/ids';
import { act } from './pubsub-actions';
import styles from './pubsub-page.module.css';

/** A menu open at a point, with its entries. */
export interface OpenMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
  /** The identifier of the menu (`pubsub.subscriptions@item-menu`). */
  readonly element: string;
  readonly place: Place;
}

/** Where a menu opens for a key: under the element that has the focus. */
export function menuPoint(element: Element): { readonly x: number; readonly y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + 16, y: box.bottom };
}

/** Whether a key opens the context menu: `Shift+F10` or the menu key. */
export function isMenuKey(event: React.KeyboardEvent): boolean {
  return (event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu';
}

/** The menu, open while `menu` says so. */
export function PubSubMenu(props: {
  readonly tab: string;
  readonly menu: OpenMenu | undefined;
  readonly selected: readonly number[];
  readonly onClose: () => void;
}): React.JSX.Element | null {
  const menu = props.menu;
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
          aria-label={menu.label}
          align="start"
          data-feature={menu.element}
        >
          {menu.entries.map((entry) => (
            <DropdownMenu.Item
              key={entry.label}
              className={styles['item']}
              disabled={entry.disabled !== undefined}
              title={entry.disabled}
              {...(entry.element === undefined ? {} : { 'data-feature': entry.element })}
              onSelect={() => {
                act(props.tab, entry, menu.place, props.selected);
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
