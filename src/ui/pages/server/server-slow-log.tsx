/**
 * `server.slow-log`: the line of the threshold with **Open console**, the toolbar (the filter, **Slower than**, the
 * count and **Clear…**, `server.slow-log-reset`), the table of the entries, the newest first or the slowest first
 * after a click on **Duration**, and the note on what a duration is.
 */
import { view, type SlowLogView } from '../../../features/server/slow-log';
import { text } from '../../../features/server/text';
import type { ConnectionView } from '../../../shared/connection';
import { changeChoices, select } from './server-changes';
import { ServerGrid } from './server-grid';
import { ControlButton, ErrorLine, Field } from './server-parts';
import { slowLogState } from './server-state';
import type { ServerTab } from './server-store';
import styles from './server-page.module.css';

function Toolbar(props: { readonly tabId: string; readonly toolbar: SlowLogView['toolbar'] }): React.JSX.Element {
  const { tabId, toolbar } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.sections['slow-log']}>
      <Field
        label={toolbar.filter.placeholder}
        placeholder={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(value) => {
          changeChoices(tabId, (choices) => ({ ...choices, slowLogFilter: value }));
        }}
      />
      <Field
        label={toolbar.slowerThan.label}
        numeric
        value={toolbar.slowerThan.value}
        onChange={(value) => {
          changeChoices(tabId, (choices) => ({ ...choices, slowerThan: value }));
        }}
      />
      {toolbar.count === undefined ? null : (
        <span className={styles['count']} role="status">
          {toolbar.count}
        </span>
      )}
      <ControlButton tab={tabId} control={toolbar.clear} place="toolbar" />
    </div>
  );
}

/** The Slow log section. */
export function SlowLogSection(props: {
  readonly tabId: string;
  readonly tab: ServerTab;
  readonly connection: ConnectionView;
  readonly now: number;
}): React.JSX.Element {
  const { tabId, tab } = props;
  const shown = view(slowLogState(tab, props.connection, props.now));
  const table = shown.table;
  const columns = text.slowLog.columns;
  return (
    <div className={`${styles['section']} ${styles['filled']}`}>
      <p className={styles['threshold']}>
        {shown.threshold.line === undefined ? null : <span>{shown.threshold.line} </span>}
        <span>{shown.threshold.toChange} </span>
        <ControlButton tab={tabId} control={shown.threshold.openConsole} place="toolbar" />
      </p>
      <Toolbar tabId={tabId} toolbar={shown.toolbar} />
      <ErrorLine text={shown.error ?? tab.operationErrors['slow-log']} />
      {table === undefined ? null : (
        <ServerGrid
          label={text.window.tables.slowLog}
          fill
          columns={[
            { label: columns.time },
            {
              label: columns.duration,
              sorted: table.sortedByDuration ? 'descending' : undefined,
              onSort: () => {
                changeChoices(tabId, (choices) => ({
                  ...choices,
                  slowLogOrder: choices.slowLogOrder === 'duration' ? 'server' : 'duration',
                }));
              },
            },
            { label: columns.command },
            { label: columns.client },
            { label: columns.name },
          ]}
          template="minmax(110px, 0.8fr) minmax(90px, 0.7fr) minmax(240px, 4fr) minmax(140px, 1.2fr) minmax(100px, 1fr)"
          rows={table.rows.map((row) => ({
            id: String(row.id),
            selected: row.selected,
            cells: [
              { text: row.time },
              { text: row.duration },
              { text: row.command },
              { text: row.client },
              { text: row.name },
            ],
          }))}
          onSelect={(id) => {
            select(tabId, ({ 'slow-log': _entry, ...rest }) =>
              id === undefined ? rest : { ...rest, 'slow-log': Number(id) },
            );
          }}
        />
      )}
      {shown.empty === undefined ? null : <p className={styles['notice']}>{shown.empty}</p>}
      <p className={styles['note']}>{shown.note}</p>
    </div>
  );
}
