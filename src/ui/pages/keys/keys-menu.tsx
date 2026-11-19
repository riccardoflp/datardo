/**
 * A menu of the keys tab, open at a point of the window: the context menu of a row (`@row-menu`), the menu of a column
 * header (`@column-menu`) and **More** of the toolbar. `Escape` closes it and gives the focus back.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import styles from './keys-page.module.css';

/** An entry of a menu: its text, its identifier, and what choosing it does. */
export interface MenuItem {
  readonly label: string;
  readonly element?: string;
  readonly choose: () => void;
}

/** Where a menu is open, with which entries. */
export interface OpenKeysMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
}

/** The menu, open while `menu` says so; `onClose` gives the focus back to what opened it. */
export function KeysMenu({
  menu,
  onClose,
}: {
  readonly menu: OpenKeysMenu | undefined;
  readonly onClose: () => void;
}): React.JSX.Element | null {
  if (menu === undefined) {
    return null;
  }
  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DropdownMenu.Trigger asChild>
        <span aria-hidden="true" style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={menu.label} align="start">
          {menu.items.map((item, index) => (
            <DropdownMenu.Item
              key={`${item.label} ${String(index)}`}
              className={styles['item']}
              {...(item.element === undefined ? {} : { 'data-feature': item.element })}
              onSelect={() => {
                item.choose();
              }}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
