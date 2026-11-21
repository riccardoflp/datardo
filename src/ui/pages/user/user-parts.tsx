/**
 * The pieces the Users and roles page and its inspector are drawn with: a button for a control of a View, and the
 * menu of a row (`@row-menu`), whose entries a View gives.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { UserControl } from '../../../features/user/types';
import type { Place } from '../../../shared/ids';
import { act } from './user-actions';
import styles from '../server/server-page.module.css';

/** The place of a control: the one of its element written whole (`user.delete@inspector`), or `fallback`. */
export function placeOf(control: UserControl, fallback: Place): Place {
  const place = control.kind === 'start' ? control.element.split('@')[1] : undefined;
  return (place ?? fallback) as Place;
}

/** A button for a control of a View. */
export function ControlButton(props: {
  readonly control: UserControl;
  readonly place: Place;
  readonly className?: string | undefined;
  /** The name of a button whose text says too little (`✕`). */
  readonly label?: string | undefined;
}): React.JSX.Element {
  const { control } = props;
  return (
    <button
      type="button"
      className={props.className ?? styles['button']}
      {...(props.label === undefined ? {} : { 'aria-label': props.label })}
      {...(control.kind === 'start' ? { 'data-feature': control.element, title: control.tooltip } : {})}
      onClick={() => {
        act(control, placeOf(control, props.place));
      }}
    >
      {control.label}
    </button>
  );
}

/** A menu open at a point of the window, with the entries a View gave. */
export interface OpenMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly controls: readonly UserControl[];
}

/** The menu of a row, open while `menu` says so; `Escape` closes it and gives the focus back. */
export function RowMenu(props: { readonly menu: OpenMenu | undefined; readonly onClose: () => void }) {
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
        <DropdownMenu.Content className={styles['menu']} aria-label={menu.label} align="start">
          {menu.controls.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['item']}
              {...(control.kind === 'start' ? { 'data-feature': control.element, title: control.tooltip } : {})}
              onSelect={() => {
                act(control, 'row-menu');
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
