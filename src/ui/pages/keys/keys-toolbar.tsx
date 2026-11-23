/**
 * The toolbar of a keys tab (`key.show`): the pattern field, whose text is sent only on `Enter` and put back by `Esc`,
 * the type filter, **Scan more**, **Cancel** while a run goes on (its place kept, unseen, otherwise), **Refresh**
 * (`key.refresh`), **New key** (`key.new`) and **More** (`key.delete-by-pattern`, `key.export`, `key.import`), then
 * what a sort says of the keys loaded.
 */
import { useEffect, useRef, useState } from 'react';
import type { KeysPageView, PageControl } from '../../../features/key/show';
import { text } from '../../../features/key/text';
import type { TabId } from '../../../shared/ids';
import { startFeature } from '../../shell/intent';
import { databaseTarget, tabArgs } from './keys-actions';
import { KeysMenu, type OpenKeysMenu } from './keys-menu';
import { scanMore, scanType, scanTyped, stopScan } from './keys-reads';
import { changeTab, takesFocus, useFocusAsks, type KeysTab } from './keys-store';
import styles from './keys-page.module.css';

/** What the toolbar is drawn with. */
export interface ToolbarProps {
  readonly tabId: string;
  readonly tab: KeysTab;
  readonly toolbar: KeysPageView['toolbar'];
}

function moreMenu(props: ToolbarProps, x: number, y: number, keys: readonly string[]): OpenKeysMenu {
  return {
    label: text.show.more,
    x,
    y,
    items: props.toolbar.more.map((entry: PageControl) => ({
      label: entry.label,
      ...(entry.element === undefined ? {} : { element: entry.element }),
      choose: () => {
        startFeature(entry.feature, {
          place: 'toolbar',
          target: databaseTarget(props.tab),
          args: tabArgs(props.tab, entry.feature === 'key.export' ? keys : []),
        });
      },
    })),
  };
}

function PatternField({ tabId, tab, toolbar }: ToolbarProps): React.JSX.Element {
  const field = useRef<HTMLInputElement>(null);
  const asks = useFocusAsks();
  const where = tab.where;
  useEffect(() => {
    if (takesFocus(where)) {
      field.current?.focus();
    }
  }, [asks, where]);
  return (
    <span className={styles['pattern']}>
      <input
        ref={field}
        className={styles['input']}
        type="text"
        aria-label={text.show.pattern}
        placeholder={toolbar.field.placeholder}
        data-feature={toolbar.field.element}
        value={toolbar.field.value}
        onChange={(event) => {
          const value = event.target.value;
          changeTab(tabId, (state) => ({ ...state, field: value }));
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            scanTyped(tabId);
          } else if (event.key === 'Escape') {
            changeTab(tabId, (state) => ({ ...state, field: tab.last.typed }));
          }
        }}
      />
      {toolbar.field.sent === undefined ? null : <span className={styles['sent']}>{toolbar.field.sent}</span>}
    </span>
  );
}

function Button(props: {
  readonly control: PageControl;
  readonly onClick: () => void;
  /** Kept in its place but not seen, not reached by `Tab` and not read out: nothing beside it moves. */
  readonly hidden?: boolean;
}): React.JSX.Element {
  const { control } = props;
  return (
    <button
      type="button"
      className={styles['button']}
      {...(props.hidden === true ? { style: { visibility: 'hidden' }, tabIndex: -1, 'aria-hidden': true } : {})}
      {...(control.element === undefined ? {} : { 'data-feature': control.element })}
      disabled={control.enabled === false}
      title={control.tooltip}
      onClick={props.onClick}
    >
      {control.label}
    </button>
  );
}

/** The toolbar; `keys` are the selected keys in the order of the table, which **Export keys…** offers. */
export function KeysToolbar(props: ToolbarProps & { readonly keys: readonly string[] }): React.JSX.Element {
  const { tabId, tab, toolbar } = props;
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.show.table}>
      <PatternField tabId={tabId} tab={tab} toolbar={toolbar} />
      <select
        className={styles['input']}
        aria-label={text.show.typeFilter}
        data-feature={toolbar.type.element}
        value={toolbar.type.value}
        onChange={(event) => {
          scanType(tabId, event.target.value);
        }}
      >
        {toolbar.type.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Button
        control={toolbar.scanMore}
        onClick={() => {
          scanMore(tabId);
        }}
      />
      <Button
        control={{ label: text.show.cancel, feature: 'key.scan' }}
        hidden={!tab.scanning}
        onClick={() => {
          stopScan(tabId);
        }}
      />
      <Button
        control={toolbar.refresh}
        onClick={() => {
          startFeature('key.refresh', { place: 'toolbar', target: { kind: 'tab', tab: tabId as TabId } });
        }}
      />
      {toolbar.newKey === undefined ? null : (
        <Button
          control={toolbar.newKey}
          onClick={() => {
            startFeature('key.new', { place: 'toolbar', target: databaseTarget(tab), args: tabArgs(tab) });
          }}
        />
      )}
      <button
        type="button"
        className={styles['button']}
        aria-haspopup="menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMenu(moreMenu(props, box.left, box.bottom, props.keys));
        }}
      >
        {text.show.more}
      </button>
      {toolbar.notice === undefined ? null : (
        <span className={styles['notice']} role="status">
          {toolbar.notice}
        </span>
      )}
      <KeysMenu
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}
