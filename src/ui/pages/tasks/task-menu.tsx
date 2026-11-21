/**
 * The menu of a task (`@item-menu`): **Edit** and **Delete**, under the item's `…` button, or open at a point of the
 * window from its context menu or `Shift+F10`. `Escape` closes it.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ItemView } from '../../../features/task/show';
import { pageText } from '../../../features/task/text';
import { startFeature } from '../../shell/intent';
import styles from './tasks-page.module.css';

/** Where the menu is open from the context menu or the keyboard; none while it opens from its button or is closed. */
export interface OpenTaskMenu {
  readonly x: number;
  readonly y: number;
}

function Entries({ item }: { readonly item: ItemView }): React.JSX.Element {
  return (
    <DropdownMenu.Content className={styles['menu']} aria-label={item.name} align="end">
      {item.menu.map((entry) => (
        <DropdownMenu.Item
          key={entry.element}
          className={styles['menuItem']}
          data-feature={entry.element}
          title={entry.tooltip}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onSelect={() => {
            const feature = entry.element === 'task.edit@item-menu' ? 'task.edit' : 'task.delete';
            startFeature(feature, { place: 'item-menu', args: { task: item.id } });
          }}
        >
          {entry.label}
        </DropdownMenu.Item>
      ))}
    </DropdownMenu.Content>
  );
}

/** The `…` button and its menu, also open at the point `menu` gives. */
export function TaskMenu(props: {
  readonly item: ItemView;
  readonly menu: OpenTaskMenu | undefined;
  readonly setMenu: (menu: OpenTaskMenu | undefined) => void;
}): React.JSX.Element {
  const { item, menu, setMenu } = props;
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            className={styles['more']}
            aria-label={`${pageText.edit}, ${pageText.delete}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            …
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <Entries item={item} />
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {menu === undefined ? null : (
        <DropdownMenu.Root
          open
          modal={false}
          onOpenChange={(open) => {
            if (!open) {
              setMenu(undefined);
            }
          }}
        >
          <DropdownMenu.Trigger asChild>
            <span aria-hidden="true" style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0 }} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <Entries item={item} />
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </>
  );
}
