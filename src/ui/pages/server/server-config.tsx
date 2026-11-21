/**
 * `server.config`: the filter and the count, the notice that the configuration is read-only in this release with
 * **Open console**, and the table of the parameters, whose menu copies a parameter or its value; nothing edits.
 */
import { useState } from 'react';
import { view } from '../../../features/server/config';
import { text } from '../../../features/server/text';
import { changeChoices, select } from './server-changes';
import { ServerGrid } from './server-grid';
import { ControlButton, ErrorLine, Field, ServerMenu, type OpenMenu } from './server-parts';
import { configState } from './server-state';
import type { ServerTab } from './server-store';
import styles from './server-page.module.css';

/** The Configuration section. */
export function ConfigSection(props: { readonly tabId: string; readonly tab: ServerTab }): React.JSX.Element {
  const { tabId } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const shown = view(configState(props.tab));
  const table = shown.table;
  return (
    <div className={`${styles['section']} ${styles['filled']}`}>
      <div className={styles['toolbar']} role="toolbar" aria-label={text.sections.configuration}>
        <Field
          label={shown.toolbar.filter.placeholder}
          placeholder={shown.toolbar.filter.placeholder}
          value={shown.toolbar.filter.value}
          onChange={(value) => {
            changeChoices(tabId, (choices) => ({ ...choices, configFilter: value }));
          }}
        />
        {shown.toolbar.count === undefined ? null : (
          <span className={styles['count']} role="status">
            {shown.toolbar.count}
          </span>
        )}
      </div>
      <p className={styles['threshold']}>
        <span>{shown.notice.text} </span>
        <ControlButton tab={tabId} control={shown.notice.openConsole} place="toolbar" />
      </p>
      <ErrorLine text={shown.error} />
      {table === undefined ? null : (
        <ServerGrid
          label={text.window.tables.config}
          fill
          columns={[{ label: table.columns.parameter }, { label: table.columns.value }]}
          template="minmax(200px, 1fr) minmax(200px, 2fr)"
          rows={table.rows.map((row) => ({
            id: row.name,
            selected: row.selected,
            cells: [
              { text: row.name },
              {
                text: row.value,
                title: row.tooltip,
                tone: row.look === 'text' || row.look === 'hidden' ? undefined : 'dim',
              },
            ],
          }))}
          onSelect={(id) => {
            select(tabId, ({ configuration: _parameter, ...rest }) =>
              id === undefined ? rest : { ...rest, configuration: id },
            );
          }}
          onMenu={(id, x, y) => {
            const row = table.rows.find((each) => each.name === id);
            if (row !== undefined) {
              setMenu({ label: row.name, x, y, controls: row.menu });
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
