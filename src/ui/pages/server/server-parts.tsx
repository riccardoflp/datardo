/**
 * The pieces every section of the Server page is drawn with: a button for a control of a View, the error line of a
 * part, the tiles, a filter field, and the menu of a row (`@row-menu`), whose entries a View gives.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Place } from '../../../shared/ids';
import type { ServerControl, Tone, ToneLine } from '../../../features/server/types';
import { act } from './server-actions';
import styles from './server-page.module.css';

/** A button for a control of a View; a disabled one says why in its tooltip. */
export function ControlButton(props: {
  readonly tab: string;
  readonly control: ServerControl;
  readonly place: Place;
}): React.JSX.Element {
  const { control } = props;
  const element = control.kind === 'start' ? control.element : undefined;
  const disabled = control.kind === 'start' && !control.enabled;
  return (
    <button
      type="button"
      className={styles['button']}
      {...(element === undefined ? {} : { 'data-feature': element })}
      aria-disabled={disabled ? true : undefined}
      title={control.kind === 'start' ? control.disabledBecause : undefined}
      onClick={() => {
        act(props.tab, control, props.place);
      }}
    >
      {control.label}
    </button>
  );
}

/** The error line at the top of a part: the server's message, or the sentence of `server.unavailable`. */
export function ErrorLine(props: { readonly text: string | undefined }): React.JSX.Element | null {
  return props.text === undefined ? null : (
    <p className={styles['error']} role="alert">
      {props.text}
    </p>
  );
}

/** A tile as the sections give it. */
export interface TileShown {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
  readonly tooltip?: string | undefined;
  readonly lines: readonly ToneLine[];
  readonly bar?: { readonly percent: number; readonly tone: Tone } | undefined;
  readonly selected: boolean;
}

/** The tiles of a section; a tile that can be selected is a button that shows its fields in the inspector island. */
export function Tiles(props: {
  readonly label: string;
  readonly tiles: readonly TileShown[];
  readonly onSelect?: (key: string) => void;
}): React.JSX.Element {
  return (
    <ul className={styles['tiles']} aria-label={props.label}>
      {props.tiles.map((tile) => {
        const inside = (
          <>
            <span className={styles['tile-label']}>{tile.label}</span>
            <span className={styles['tile-value']} title={tile.tooltip} data-tone={tile.tone}>
              {tile.value}
            </span>
            {tile.bar === undefined ? null : (
              <span className={styles['bar']} aria-hidden="true">
                <span data-tone={tile.bar.tone} style={{ width: `${String(Math.min(100, tile.bar.percent))}%` }} />
              </span>
            )}
            {tile.lines.map((line) => (
              <span key={line.text} className={styles['tile-line']} data-tone={line.tone}>
                {line.text}
              </span>
            ))}
          </>
        );
        const select = props.onSelect;
        return (
          <li key={tile.key} className={styles['tile-item']}>
            {select === undefined ? (
              <div className={styles['tile']}>{inside}</div>
            ) : (
              <button
                type="button"
                className={styles['tile']}
                aria-pressed={tile.selected}
                onClick={() => {
                  select(tile.key);
                }}
              >
                {inside}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A filter field of a section's toolbar. */
export function Field(props: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly numeric?: boolean;
  readonly onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className={styles['field']}>
      {props.placeholder === undefined ? <span>{props.label}</span> : null}
      <input
        className={props.numeric === true ? `${styles['input']} ${styles['number']}` : styles['input']}
        type={props.numeric === true ? 'number' : 'search'}
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </label>
  );
}

/** A menu open at a point of the window, with the entries a View gave. */
export interface OpenMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly controls: readonly ServerControl[];
  /** The identifier of the menu (`server.largest-keys@row-menu`), when it has one. */
  readonly element?: string;
}

/** The menu of a row, open while `menu` says so; `Escape` closes it and gives the focus back. */
export function ServerMenu(props: {
  readonly tab: string;
  readonly menu: OpenMenu | undefined;
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
          {...(menu.element === undefined ? {} : { 'data-feature': menu.element })}
        >
          {menu.controls.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['item']}
              disabled={control.kind === 'start' && !control.enabled}
              title={control.kind === 'start' ? control.disabledBecause : undefined}
              {...(control.kind === 'start' && control.element !== undefined
                ? { 'data-feature': control.element }
                : {})}
              onSelect={() => {
                act(props.tab, control, 'row-menu');
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
