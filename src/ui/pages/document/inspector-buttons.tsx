/**
 * The buttons of the inspector (`document.inspect`): **Previous document** and **Next document**, **Expand all** and
 * **Collapse all**, the switch **Tree** / **Text**, **Copy as** (`table.copy-as`), **Open in a tab** (`document.open`)
 * and the `…` menu with **Duplicate…** (`document.duplicate`) and **Delete document** (`document.delete`). A control
 * whose feature is not built is not drawn.
 */
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { InspectControl } from '../../../features/document/inspect';
import { text } from '../../../features/document/text';
import { formatsFor } from '../../../features/table/copy-as';
import type { Document } from '../../../features/table/types';
import { isBuilt } from '../../query/built';
import type { CollectionRef } from '../../query/collection-reads';
import { changeSelection, selectCell } from '../../table/table-actions';
import { openDocumentTab, startOnDocuments } from './document-actions';
import { changeInspect, type InspectMemory } from './inspect-store';
import styles from './document.module.css';

/** What the buttons act on. */
export interface ButtonsProps {
  readonly collectionRef: CollectionRef;
  readonly document: Document;
  readonly row: number;
  readonly memory: InspectMemory;
  readonly buttons: readonly InspectControl[];
  readonly menu: readonly InspectControl[];
}

const icons: Readonly<Record<string, string>> = {
  [text.inspect.previous]: 'chevron-left',
  [text.inspect.next]: 'chevron-right',
  [text.inspect.expandAll]: 'expand-all',
  [text.inspect.collapseAll]: 'collapse-all',
};

function moveTo(ref: CollectionRef, row: number): void {
  changeSelection(ref, { kind: 'only', index: row });
  selectCell(ref, { at: 'cell', row, subRow: 0, column: 1 });
}

function pressed(props: ButtonsProps, control: InspectControl): void {
  const { collectionRef: ref } = props;
  switch (control.label) {
    case text.inspect.previous:
      moveTo(ref, props.row - 1);
      return;
    case text.inspect.next:
      moveTo(ref, props.row + 1);
      return;
    case text.inspect.expandAll:
      changeInspect(ref.tab, (before) => ({ ...before, folding: 'all-open', toggled: [] }));
      return;
    case text.inspect.collapseAll:
      changeInspect(ref.tab, (before) => ({ ...before, folding: 'all-folded', toggled: [] }));
      return;
    default:
      if (control.element === 'document.open@inspector') {
        openDocumentTab(ref, props.document, control.element);
      } else if (control.element !== undefined) {
        void startOnDocuments(ref, control.element, { id: props.document['_id'] ?? null });
      }
  }
}

function CopyAs({ props, control }: { readonly props: ButtonsProps; readonly control: InspectControl }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['button']} data-feature={control.element}>
          {control.label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={control.label} align="start">
          {formatsFor(1).map((each) => (
            <DropdownMenu.Item
              key={each.format}
              className={styles['item']}
              title={each.description}
              data-feature={control.element}
              onSelect={() => {
                void startOnDocuments(props.collectionRef, control.element ?? 'table.copy-as@inspector', {
                  documents: [props.document],
                  format: each.format,
                });
              }}
            >
              {each.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Button({ props, control }: { readonly props: ButtonsProps; readonly control: InspectControl }) {
  const icon = icons[control.label];
  return (
    <button
      type="button"
      className={styles['button']}
      data-feature={control.element}
      disabled={!control.enabled}
      title={control.tooltip ?? (icon === undefined ? undefined : control.label)}
      aria-label={icon === undefined ? undefined : control.label}
      onClick={() => {
        pressed(props, control);
      }}
    >
      {icon === undefined ? control.label : <span className={`codicon codicon-${icon}`} aria-hidden="true" />}
    </button>
  );
}

function MoreMenu({ props }: { readonly props: ButtonsProps }): React.JSX.Element | null {
  const entries = props.menu.filter((control) => isBuilt(control.element ?? ''));
  if (entries.length === 0) {
    return null;
  }
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles['button']} aria-label={text.inspect.more} title={text.inspect.more}>
          <span className="codicon codicon-ellipsis" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles['menu']} aria-label={text.inspect.more} align="end">
          {entries.map((control) => (
            <DropdownMenu.Item
              key={control.label}
              className={styles['item']}
              data-feature={control.element}
              title={control.tooltip}
              disabled={!control.enabled}
              onSelect={() => {
                pressed(props, control);
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

function ModeSwitch({ props }: { readonly props: ButtonsProps }): React.JSX.Element {
  const modes = [
    ['tree', text.inspect.tree],
    ['text', text.inspect.text],
  ] as const;
  return (
    <span className={styles['switch']} role="group" aria-label={`${text.inspect.tree} / ${text.inspect.text}`}>
      {modes.map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          className={styles['button']}
          aria-pressed={props.memory.mode === mode}
          onClick={() => {
            changeInspect(props.collectionRef.tab, (before) => ({ ...before, mode }));
          }}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/** The row of buttons. */
export function InspectorButtons(props: ButtonsProps): React.JSX.Element {
  const shown = props.buttons.filter((control) => control.element === undefined || isBuilt(control.element));
  return (
    <div className={styles['buttons']} role="toolbar" aria-label={text.inspect.toolbar}>
      {shown.map((control) =>
        control.feature === 'table.copy-as' ? (
          <span key={control.label} className={styles['group']}>
            {props.buttons.length > 1 ? <ModeSwitch props={props} /> : null}
            <CopyAs props={props} control={control} />
          </span>
        ) : (
          <Button key={control.label} props={props} control={control} />
        ),
      )}
      <MoreMenu props={props} />
    </div>
  );
}
