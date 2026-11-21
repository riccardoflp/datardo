/**
 * The menu of a file's row (`@row-menu`), open at a point of the window from its context menu, its `…` button or
 * `Shift+F10`: **Open**, **Download…**, and on a connection that is not read-only **Rename…** and **Delete**. `Escape`
 * closes it and gives the focus back.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { GridControl } from '../../../features/gridfs/types';
import { startControl } from './gridfs-actions';
import styles from './gridfs-page.module.css';

/** Where the menu is open, with which entries. */
export interface OpenFileMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly controls: readonly GridControl[];
}

/** The menu, open while `menu` says so; `onClose` gives the focus back to what opened it. */
export function FileMenu({
  menu,
  onClose,
}: {
  readonly menu: OpenFileMenu | undefined;
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
          {menu.controls.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['item']}
              {...(control.kind === 'start' ? { 'data-feature': control.element } : {})}
              title={control.kind === 'start' ? control.tooltip : undefined}
              onSelect={() => {
                startControl(control, 'row-menu');
              }}
            >
              {control.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
