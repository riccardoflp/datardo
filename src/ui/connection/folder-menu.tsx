/**
 * `connection.folder-menu`: the menu of a folder of connections, drawn from the entries its View gives, as the `…`
 * button of the folder's heading. An entry starts its feature with the folder in its arguments.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useRef } from 'react';
import { view, type FolderMenuPlace } from '../../features/connection/folder-menu';
import { startFeature } from '../shell/intent';
import styles from './connection-menu.module.css';

/** What the menu is given: the folder, where it is drawn, and what to do once an entry is chosen. */
export interface FolderMenuProps {
  readonly folder: string;
  readonly place: FolderMenuPlace;
  readonly className?: string | undefined;
  /** Called after an entry is chosen: the connection switcher closes. */
  readonly onChosen?: () => void;
}

/** The `…` button of a folder's heading, which opens its menu. */
export function FolderMenuButton(props: FolderMenuProps): React.JSX.Element {
  const menu = view({ folder: props.folder, place: props.place });
  // An entry chosen leaves the focus where its feature puts it (a form, a dialog), not on the trigger.
  const chosen = useRef(false);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={props.className}
          data-feature={menu.element}
          aria-label={menu.label}
          title={menu.label}
        >
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles['menu']}
          aria-label={menu.label}
          align="end"
          onCloseAutoFocus={(event) => {
            if (chosen.current) {
              event.preventDefault();
              chosen.current = false;
            }
          }}
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
                  startFeature(entry.feature, { place: props.place, args: { folder: menu.folder } });
                  props.onChosen?.();
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
