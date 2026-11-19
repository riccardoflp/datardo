/**
 * A context menu of the table drawn at a point of the window: its entries, their submenus (`→` opens one), the arrows
 * move through them, `Enter` chooses, `Esc` closes and gives the focus back to what had it. An entry shown but not
 * offered is disabled, with its tooltip saying why.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { MenuEntry } from '../../features/table/types';
import type { ChosenEntry } from './menu-entries';
import styles from './table-panels.module.css';

function Entries({
  entries,
  onChoose,
}: {
  readonly entries: readonly MenuEntry[];
  readonly onChoose: (entry: ChosenEntry) => void;
}): React.JSX.Element {
  return (
    <>
      {entries.map((entry, index) => {
        if (entry.kind === 'separator') {
          return <DropdownMenu.Separator key={`separator ${String(index)}`} className={styles['separator']} />;
        }
        const key = `${entry.label} ${String(index)}`;
        if (entry.submenu !== undefined) {
          return (
            <DropdownMenu.Sub key={key}>
              <DropdownMenu.SubTrigger className={styles['item']} data-feature={entry.element} title={entry.tip}>
                <span>{entry.label}</span>
                <span className="codicon codicon-chevron-right" aria-hidden="true" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent className={styles['menu']} aria-label={entry.label}>
                  <Entries entries={entry.submenu} onChoose={onChoose} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          );
        }
        return (
          <DropdownMenu.Item
            key={key}
            className={styles['item']}
            data-feature={entry.element}
            title={entry.tip}
            disabled={entry.disabled === true}
            onSelect={() => {
              onChoose(entry);
            }}
          >
            {entry.label}
          </DropdownMenu.Item>
        );
      })}
    </>
  );
}

/** Where and what the menu is. */
export interface MenuListProps {
  readonly label: string;
  /** The element of the menu, by its card: `table.row-menu@row-menu`. */
  readonly element: string;
  readonly x: number;
  readonly y: number;
  readonly entries: readonly MenuEntry[];
  readonly onChoose: (entry: ChosenEntry) => void;
  /** Closes it; the focus goes back to `returnFocus` unless an entry took it elsewhere. */
  readonly onClose: () => void;
  readonly returnFocus?: HTMLElement | null;
}

/** A context menu, open while it is drawn. */
export function MenuList(props: MenuListProps): React.JSX.Element {
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
        <span aria-hidden="true" style={{ position: 'fixed', left: props.x, top: props.y, width: 0, height: 0 }} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles['menu']}
          aria-label={props.label}
          data-feature={props.element}
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const back = props.returnFocus;
            if (back?.isConnected === true && !isFocusElsewhere()) {
              back.focus();
            }
          }}
        >
          <Entries entries={props.entries} onChoose={props.onChoose} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Whether something other than the page took the focus (a dialog opened by the entry). */
function isFocusElsewhere(): boolean {
  const active = document.activeElement;
  return active !== null && active !== document.body && active.closest('[role="dialog"]') !== null;
}
