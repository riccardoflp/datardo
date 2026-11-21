/**
 * The menu of a row of the Indexes section (`@row-menu`), open at a point of the window: from the context menu of the
 * row, `Shift+F10`, or its `…` button. `Escape` closes it and gives the focus back.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { RowAction } from '../../../features/index/show';
import styles from './index.module.css';

/** Where the menu is open, with which entries. */
export interface OpenRowMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly actions: readonly RowAction[];
  readonly choose: (action: RowAction) => void;
}

/** The menu, open while `menu` says so. */
export function IndexMenu({
  menu,
  onClose,
}: {
  readonly menu: OpenRowMenu | undefined;
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
          {menu.actions.map((action) => (
            <DropdownMenu.Item
              key={action.element}
              className={styles['item']}
              title={action.tooltip}
              data-feature={action.element}
              onSelect={() => {
                menu.choose(action);
              }}
            >
              {action.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
