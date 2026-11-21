/**
 * `server.clients`: the toolbar (the filter, **Idle ≤** and the count), the table of the clients, drawn a screen at a
 * time and sorted by a click on a header, and the menu of each row with **Disconnect…** (`server.kill-client`).
 */
import { useState } from 'react';
import { sortedBy, view, type ClientRow, type ClientsView } from '../../../features/server/clients';
import { text } from '../../../features/server/text';
import type { ConnectionView } from '../../../shared/connection';
import { changeChoices, select } from './server-changes';
import { ServerGrid, type GridCell } from './server-grid';
import { ErrorLine, Field, ServerMenu, type OpenMenu } from './server-parts';
import { clientsState } from './server-state';
import type { ServerTab } from './server-store';
import styles from './server-page.module.css';

/** The widths of the columns, from **ID** to **Memory**, then the `…` button. */
const template =
  'minmax(60px, 0.6fr) minmax(140px, 1.4fr) minmax(130px, 1.4fr) minmax(70px, 0.8fr) 48px minmax(70px, 0.8fr) ' +
  'minmax(70px, 0.8fr) minmax(90px, 1fr) minmax(110px, 1.2fr) minmax(70px, 0.8fr) minmax(80px, 0.8fr) 36px';

function cellsOf(row: ClientRow): readonly GridCell[] {
  return [
    { text: row.id },
    { text: row.address },
    { text: row.name, marks: row.marks },
    { text: row.user },
    { text: row.db },
    { text: row.age },
    { text: row.idle },
    { text: row.command },
    { text: row.state },
    { text: row.subscriptions, title: row.subscriptionsTooltip },
    { text: row.memory, title: row.memoryTooltip },
  ];
}

function Toolbar(props: { readonly tabId: string; readonly toolbar: ClientsView['toolbar'] }): React.JSX.Element {
  const { tabId, toolbar } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.sections.clients}>
      <Field
        label={toolbar.filter.placeholder}
        placeholder={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(value) => {
          changeChoices(tabId, (choices) => ({ ...choices, clientsFilter: value }));
        }}
      />
      <Field
        label={toolbar.idle.label}
        numeric
        value={toolbar.idle.value}
        onChange={(value) => {
          changeChoices(tabId, (choices) => ({ ...choices, clientsIdle: value }));
        }}
      />
      {toolbar.count === undefined ? null : (
        <span className={styles['count']} role="status">
          {toolbar.count}
        </span>
      )}
    </div>
  );
}

/** The Clients section. */
export function ClientsSection(props: {
  readonly tabId: string;
  readonly tab: ServerTab;
  readonly connection: ConnectionView;
}): React.JSX.Element {
  const { tabId, tab } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const shown = view(clientsState(tab, props.connection));
  const table = shown.table;
  return (
    <div className={`${styles['section']} ${styles['filled']}`}>
      <Toolbar tabId={tabId} toolbar={shown.toolbar} />
      <ErrorLine text={shown.error ?? tab.operationErrors.clients} />
      {table === undefined ? null : (
        <ServerGrid
          label={text.window.tables.clients}
          fill
          columns={table.columns.map((column) => ({
            label: column.label,
            sorted: column.sorted,
            onSort: () => {
              changeChoices(tabId, (choices) => ({
                ...choices,
                clientsSort: sortedBy(choices.clientsSort, column.column),
              }));
            },
          }))}
          template={template}
          rows={table.rows.map((row) => ({ id: row.id, selected: row.selected, cells: cellsOf(row) }))}
          menuButton={text.window.rowMenu}
          onSelect={(id) => {
            select(tabId, ({ clients: _client, ...rest }) => (id === undefined ? rest : { ...rest, clients: id }));
          }}
          onMenu={(id, x, y) => {
            const row = table.rows.find((each) => each.id === id);
            if (row !== undefined) {
              setMenu({ label: row.id, x, y, controls: row.menu });
            }
          }}
        />
      )}
      {shown.noMatch === undefined ? null : <p className={styles['notice']}>{shown.noMatch}</p>}
      <ServerMenu
        tab={tabId}
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </div>
  );
}
