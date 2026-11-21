/**
 * The pieces the sections of the Monitor page are drawn with: what a control of a View does, its button, the menu of
 * a row (`@row-menu`) and the tone of a cell. The tables are the Server page's (`server-grid.tsx`), with its styles.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { SectionControl, Tone } from '../../../features/monitor/parts/tiles';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { killOperation, runSlowOperation } from './monitor-reads';
import { runSectionOperation } from './monitor-section-operations';
import { monitorTabOf } from './monitor-store';
import styles from '../server/server-page.module.css';

/** The place of an element written whole (`monitor.kill-operation@row-menu`), or `fallback` for a control with none. */
export function placeOf(element: string, fallback: Place): Place {
  const place = element.split('@')[1];
  return (place ?? fallback) as Place;
}

function fieldOf(value: Json | undefined, name: string): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)[name]
    : undefined;
}

function opidOf(args: Json): number | string | undefined {
  const opid = fieldOf(fieldOf(args, 'operation'), 'opid');
  return typeof opid === 'number' || typeof opid === 'string' ? opid : undefined;
}

/** Carries out a control of the page from its place; a disabled one does nothing. */
export function act(tab: string, control: SectionControl, fallback: Place): void {
  if (control.disabledBecause !== undefined) {
    return;
  }
  const place = placeOf(control.element, fallback);
  switch (control.feature) {
    case 'monitor.kill-operation': {
      const opid = opidOf(control.args);
      if (opid !== undefined) {
        void killOperation(tab, opid, control.args, place);
      }
      return;
    }
    case 'monitor.set-profiler':
    case 'monitor.clear-profiler':
    case 'monitor.set-log-threshold':
    case 'monitor.create-suggested-index':
      void runSlowOperation(tab, control.feature, control.args, place);
      return;
    case 'monitor.step-down':
    case 'monitor.set-balancer':
    case 'monitor.set-collection-balancing':
      void runSectionOperation(tab, control.feature, control.args, place);
      return;
    default: {
      const state = monitorTabOf(tab);
      if (state !== undefined) {
        startFeature(control.feature, {
          place,
          target: { kind: 'connection', connection: state.connection },
          args: control.args,
        });
      }
    }
  }
}

/** A button for a control of a View; a disabled one says why in its tooltip. */
export function ControlButton(props: {
  readonly tab: string;
  readonly control: SectionControl;
  readonly place: Place;
}): React.JSX.Element {
  const { control } = props;
  const disabled = control.disabledBecause !== undefined;
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={control.element}
      aria-disabled={disabled ? true : undefined}
      title={control.disabledBecause}
      onClick={() => {
        act(props.tab, control, props.place);
      }}
    >
      {control.label}
    </button>
  );
}

/** A button that copies a text. */
export function CopyButton(props: { readonly label: string; readonly text: string }): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      onClick={() => {
        void navigator.clipboard.writeText(props.text);
      }}
    >
      {props.label}
    </button>
  );
}

/** The tone of a cell of the Server page's tables: the danger color is its error color. */
export function cellTone(tone: Tone): 'ordinary' | 'warning' | 'error' {
  return tone === 'danger' ? 'error' : tone;
}

/** A menu open at a point of the window, with the controls of a row. */
export interface OpenMenu {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly controls: readonly SectionControl[];
}

/** The menu of a row, open while `menu` says so; `Escape` closes it and gives the focus back. */
export function RowMenu(props: {
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
        <DropdownMenu.Content className={styles['menu']} aria-label={menu.label} align="start">
          {menu.controls.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['item']}
              disabled={control.disabledBecause !== undefined}
              title={control.disabledBecause}
              data-feature={control.element}
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
