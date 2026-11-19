/**
 * `key.show`: the page of a keys tab, drawn from its View: the toolbar, the selection bar while more than one key is
 * selected (`key.select`), and the table or what the page shows in its place (loading, an empty database, nothing
 * found, an error, a connection not connected). The scan starts when the tab is first shown, and again after every
 * refresh of its connection (`key.refresh`, and the writes of Datardo to its keys).
 */
import { useEffect, useState } from 'react';
import type { SelectView } from '../../../features/key/select';
import { view, type KeyRow, type PageControl, type TableState } from '../../../features/key/show';
import type { AppState } from '../../../shared/state';
import { activeTabOf, type TabShows } from '../../../shared/state/tabs';
import { startFeature } from '../../shell/intent';
import { useAppState } from '../../state/store';
import { databaseTarget, onSelection, rowMenuItems, tabArgs } from './keys-actions';
import { useClock } from './key-inspector';
import { KeysMenu, type OpenKeysMenu } from './keys-menu';
import { scanAgain, scanMore } from './keys-reads';
import { factsOf, pageStateOf, selectionOf } from './keys-state';
import { changeTab, forgetClosed, freshTab, keepTab, keysTabOf, useKeysTab, type KeysTab } from './keys-store';
import { KeysTable } from './keys-table';
import { KeysToolbar } from './keys-toolbar';
import styles from './keys-page.module.css';

type KeysShows = Extract<TabShows, { kind: 'keys' }>;

/** Keeps the tab's state, scans when it is first shown connected, and scans again after a refresh of its connection. */
function useScans(tabId: string, shows: KeysShows, app: AppState): void {
  const connected = factsOf(app, shows.connection).connected;
  const refreshed = app.runner.refreshed;
  useEffect(() => {
    if (keysTabOf(tabId) === undefined) {
      const where = {
        connection: shows.connection,
        database: shows.database,
        ...(shows.namespace === undefined ? {} : { namespace: shows.namespace }),
      };
      keepTab(tabId, freshTab(where, refreshed.times));
    }
    const tab = keysTabOf(tabId);
    if (tab === undefined || !connected) {
      return;
    }
    const asked =
      refreshed.times !== tab.refreshes &&
      (refreshed.connection === undefined || refreshed.connection === shows.connection);
    if (asked || (tab.scan === undefined && !tab.scanning && tab.error === undefined)) {
      scanAgain(tabId, (state) => ({ ...state, refreshes: refreshed.times }));
    }
  }, [tabId, shows, connected, refreshed]);
}

function EmptyAction(props: { readonly control: PageControl; readonly onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className={styles['button']}
      {...(props.control.element === undefined ? {} : { 'data-feature': props.control.element })}
      disabled={props.control.enabled === false}
      title={props.control.tooltip}
      onClick={props.onClick}
    >
      {props.control.label}
    </button>
  );
}

function InPlaceOfRows(props: { readonly tabId: string; readonly tab: KeysTab; readonly table: TableState }) {
  const { tabId, tab, table } = props;
  const start =
    (control: PageControl): (() => void) =>
    () => {
      startFeature(control.feature, { place: 'empty-state', target: databaseTarget(tab), args: tabArgs(tab) });
    };
  switch (table.kind) {
    case 'rows':
      return null;
    case 'loading':
      return <p className={styles['empty']} role="status" aria-busy="true" />;
    case 'not-connected':
      return (
        <div className={styles['empty']}>
          <EmptyAction
            control={table.connect}
            onClick={() => {
              startFeature('connection.connect', { target: { kind: 'connection', connection: tab.where.connection } });
            }}
          />
        </div>
      );
    case 'empty-database':
      return (
        <div className={styles['empty']}>
          <p>{table.text}</p>
          {table.actions.map((control) => (
            <EmptyAction key={control.label} control={control} onClick={start(control)} />
          ))}
        </div>
      );
    case 'no-match':
      return <p className={styles['empty']}>{table.text}</p>;
    case 'none-yet':
      return (
        <div className={styles['empty']}>
          <p>{table.text}</p>
          <EmptyAction
            control={table.scanMore}
            onClick={() => {
              scanMore(tabId);
            }}
          />
        </div>
      );
    case 'error':
      return (
        <div className={styles['empty']} role="alert">
          <p>{table.text}</p>
          <EmptyAction
            control={table.retry}
            onClick={() => {
              scanAgain(tabId);
            }}
          />
        </div>
      );
  }
}

function SelectionBar(props: { readonly tab: KeysTab; readonly tabId: string; readonly selection: SelectView }) {
  const bar = props.selection.bar;
  if (bar === undefined) {
    return null;
  }
  return (
    <div className={styles['selection-bar']} role="toolbar" aria-label={bar.label}>
      <span role="status">{bar.label}</span>
      {bar.entries.map((entry) => (
        <button
          key={entry.label}
          type="button"
          className={styles['button']}
          {...(entry.element === undefined ? {} : { 'data-feature': entry.element })}
          onClick={() => {
            if (entry.feature === 'clear') {
              changeTab(props.tabId, (state) => ({ ...state, selection: { keys: new Set() } }));
            } else {
              onSelection(props.tab, props.selection.keys, entry.feature, 'selection-bar');
            }
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function KeysTabPage(props: { readonly tabId: string; readonly shows: KeysShows; readonly app: AppState }) {
  const { tabId, shows, app } = props;
  useScans(tabId, shows, app);
  const now = useClock();
  const tab = useKeysTab(tabId);
  const [menu, setMenu] = useState<OpenKeysMenu | undefined>(undefined);
  if (tab === undefined) {
    return null;
  }
  const facts = factsOf(app, shows.connection);
  const page = view(pageStateOf(tab, facts, now));
  const selection = selectionOf(app, tab);
  const openRowMenu = (row: KeyRow, x: number, y: number): void => {
    setMenu({ label: row.key, x, y, items: rowMenuItems({ tab, row, readOnly: facts.readOnly, selection }) });
  };
  return (
    <div className={styles['page']}>
      <KeysToolbar tabId={tabId} tab={tab} toolbar={page.toolbar} keys={selection.keys} />
      <SelectionBar tab={tab} tabId={tabId} selection={selection} />
      {page.table.kind === 'rows' ? (
        <KeysTable
          tabId={tabId}
          tab={tab}
          page={page}
          selection={selection}
          readOnly={facts.readOnly}
          openRowMenu={openRowMenu}
        />
      ) : (
        <InPlaceOfRows tabId={tabId} tab={tab} table={page.table} />
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

/** The page of the active keys tab. */
export function KeysPage(): React.JSX.Element | null {
  const app = useAppState();
  const active = activeTabOf(app.tabs);
  useEffect(() => {
    forgetClosed(new Set(app.tabs.tabs.map((tab) => tab.id)));
  }, [app.tabs.tabs]);
  if (active?.shows.kind !== 'keys') {
    return null;
  }
  return <KeysTabPage key={active.id} tabId={active.id} shows={active.shows} app={app} />;
}
