/**
 * The context menu of a line of the tree island (`tree.menu-mongodb`, `tree.menu-redis`, `tree.pinned`, `tree.pages`):
 * opened at the line by a right click, `Shift+F10`, the menu key or its `…` button, closed by `Escape`, which gives
 * the focus back to the line. Opening it changes neither the selection nor the active tab.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRef } from 'react';
import type { Control, MenuEntry } from '../../features/tree/types';
import styles from './tree-island.module.css';

/** Where the menu is open: on which line, at which point of the window, with which entries. */
export interface OpenMenu {
  readonly item: string;
  readonly label: string;
  /** The identifier of the menu, by the card of the line it is the menu of (`tree.mongodb@tree-menu`). */
  readonly element: string;
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
}

/** What the menu is given. */
export interface TreeMenuProps {
  readonly menu: OpenMenu | undefined;
  readonly onChoose: (control: Control) => void;
  /** Closes it; `back` puts the focus back on the line. */
  readonly onClose: (focus: 'back' | 'leave') => void;
}

/** Whether choosing a control leaves the focus to what it starts (a tab, a dialog) rather than giving it back. */
function leavesFocus(control: Control): boolean {
  return control.kind === 'start' && control.feature !== 'tree.refresh' && control.feature !== 'tree.scan-namespaces';
}

/** The context menu of the tree island, open while `menu` says so. */
export function TreeMenu({ menu, onChoose, onClose }: TreeMenuProps): React.JSX.Element | null {
  const chosen = useRef<Control | undefined>(undefined);
  if (menu === undefined) {
    return null;
  }
  return (
    <DropdownMenu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          const control = chosen.current;
          chosen.current = undefined;
          onClose(control !== undefined && leavesFocus(control) ? 'leave' : 'back');
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
          data-feature={menu.element}
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          {menu.entries.map((entry, index) =>
            entry.kind === 'separator' ? (
              <DropdownMenu.Separator key={`separator ${String(index)}`} className={styles['separator']} />
            ) : (
              <DropdownMenu.Item
                key={`${entry.control.label} ${String(index)}`}
                className={styles['item']}
                {...(entry.control.element === undefined ? {} : { 'data-feature': entry.control.element })}
                onSelect={() => {
                  chosen.current = entry.control;
                  onChoose(entry.control);
                }}
              >
                {entry.control.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
