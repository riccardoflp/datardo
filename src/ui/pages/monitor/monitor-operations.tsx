/**
 * `monitor.operations`: the Operations section of a Monitor page tab, drawn from its View: the toolbar (the filter,
 * **Running ≥**, **Idle connections**, **System operations** and the count), the error line, and the table, whose rows
 * open their menu with **Kill…** (`@row-menu`). **Idle connections** reads again; the rest only changes what is shown.
 */
import { useState } from 'react';
import { view } from '../../../features/monitor/operations';
import { text } from '../../../features/monitor/text';
import { ServerGrid } from '../server/server-grid';
import { ErrorLine, Field } from '../server/server-parts';
import { changeChoices, changeReadChoices, select } from './monitor-changes';
import { cellTone, RowMenu, type OpenMenu } from './monitor-parts';
import { operationsState, type PageConnection } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

function Toggle(props: { readonly label: string; readonly on: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <label className={styles['field']}>
      <input
        type="checkbox"
        checked={props.on}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      <span>{props.label}</span>
    </label>
  );
}

function Toolbar(props: { readonly tabId: string; readonly shown: ReturnType<typeof view> }) {
  const { tabId } = props;
  const toolbar = props.shown.toolbar;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.sectionToolbar(text.sections.operations)}>
      <Field
        label={toolbar.filter.placeholder}
        placeholder={toolbar.filter.placeholder}
        value={toolbar.filter.value}
        onChange={(operationsFilter) => {
          changeChoices(tabId, (choices) => ({ ...choices, operationsFilter }));
        }}
      />
      <label className={styles['field']}>
        <span>{toolbar.runningAtLeast.label}</span>
        <input
          className={`${styles['input'] ?? ''} ${styles['number'] ?? ''}`}
          type="number"
          min={0}
          step={toolbar.runningAtLeast.step}
          value={toolbar.runningAtLeast.value}
          onChange={(event) => {
            const seconds = Number(event.target.value);
            const runningAtLeast = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
            changeChoices(tabId, (choices) => ({ ...choices, runningAtLeast }));
          }}
        />
      </label>
      <Toggle
        label={toolbar.idle.label}
        on={toolbar.idle.on}
        onChange={(idle) => {
          changeReadChoices(tabId, 'operations', (choices) => ({ ...choices, idle }));
        }}
      />
      <Toggle
        label={toolbar.system.label}
        on={toolbar.system.on}
        onChange={(system) => {
          changeChoices(tabId, (choices) => ({ ...choices, system }));
        }}
      />
      {toolbar.count === undefined ? null : <span className={styles['count']}>{toolbar.count}</span>}
    </div>
  );
}

/** The Operations section. */
export function OperationsSection(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
}): React.JSX.Element {
  const { tabId, tab, connection } = props;
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const shown = view(operationsState(tab, connection));
  const rowMenu = shown.rows.some((row) => row.kill !== undefined) ? text.window.rowMenu : undefined;
  return (
    <section className={`${styles['section'] ?? ''} ${styles['filled'] ?? ''}`}>
      <Toolbar tabId={tabId} shown={shown} />
      <ErrorLine text={shown.error ?? tab.operationErrors.operations} />
      {shown.empty === undefined ? null : <p className={styles['notice']}>{shown.empty}</p>}
      <ServerGrid
        label={text.window.operationsTable}
        columns={shown.columns.map((label) => ({ label }))}
        template="6em 7em minmax(8em, 1fr) 6em minmax(8em, 1fr) 8em minmax(12em, 2fr)"
        fill
        rows={shown.rows.map((row) => ({
          id: row.opid,
          selected: row.opid !== '' && row.opid === String(tab.selected.operation),
          cells: [
            { text: row.opid },
            { text: row.type, ...(row.lock === undefined ? {} : { title: row.lock, marks: [text.window.lockMark] }) },
            { text: row.namespace },
            { text: row.running.text, tone: cellTone(row.running.tone) },
            { text: row.client.text, title: row.client.tooltip },
            { text: row.plan.text, ...(row.plan.highlighted ? { tone: 'warning' as const } : {}) },
            { text: row.command },
          ],
        }))}
        onSelect={(id) => {
          const operation = tab.operations?.kind === 'read' ? tab.operations.value : [];
          const opid = operation.find((each) => each.opid !== undefined && String(each.opid) === id)?.opid;
          select(tabId, ({ operation: _dropped, ...others }) =>
            opid === undefined ? others : { ...others, operation: opid },
          );
        }}
        {...(rowMenu === undefined
          ? {}
          : {
              menuButton: rowMenu,
              onMenu: (id: string, x: number, y: number) => {
                const kill = shown.rows.find((row) => row.opid === id)?.kill;
                setMenu(kill === undefined ? undefined : { label: rowMenu, x, y, controls: [kill] });
              },
            })}
      />
      <RowMenu
        tab={tabId}
        menu={menu}
        onClose={() => {
          setMenu(undefined);
        }}
      />
    </section>
  );
}
