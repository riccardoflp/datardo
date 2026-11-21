/**
 * `monitor.slow-queries`: the Slow queries section of a Monitor page tab, drawn from its View: the two rows of its
 * toolbar, the note, the error line, and the table, one row per query shape (**By query**, sorted by a click on a
 * header) or one per operation (**All**). Selecting a row shows it in the inspector island.
 */
import { nextGroupSort, type GroupColumn } from '../../../features/monitor/parts/slow-query-rows';
import { view, type SlowQueriesView } from '../../../features/monitor/slow-queries';
import { text } from '../../../features/monitor/text';
import { ServerGrid, type GridColumn, type GridRow } from '../server/server-grid';
import { ErrorLine } from '../server/server-parts';
import { changeChoices, select } from './monitor-changes';
import { cellTone } from './monitor-parts';
import { RecordingRow, SlowToolbar } from './monitor-slow-toolbar';
import { slowState, type PageConnection } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

/** The columns of **By query** a click sorts by, in the order of the table. */
const sortable: readonly (GroupColumn | undefined)[] = [
  'count',
  'total',
  'average',
  'max',
  'examined',
  undefined,
  undefined,
  undefined,
  undefined,
  'last',
];

function groupColumns(tabId: string, tab: MonitorTab, shown: SlowQueriesView): readonly GridColumn[] {
  const sort = tab.choices.sort ?? { column: 'total', descending: true };
  return shown.columns.map((label, index) => {
    const column = sortable[index];
    if (column === undefined) {
      return { label };
    }
    return {
      label,
      sorted: sort.column === column ? (sort.descending ? 'descending' : 'ascending') : undefined,
      onSort: () => {
        changeChoices(tabId, (choices) => ({ ...choices, sort: nextGroupSort(choices.sort, column) }));
      },
    };
  });
}

function groupRows(tab: MonitorTab, shown: SlowQueriesView): readonly GridRow[] {
  const chosen = tab.selected.slow;
  return (shown.groups ?? []).map((row) => ({
    id: row.key,
    selected: chosen !== undefined && 'group' in chosen && chosen.group === row.key,
    cells: [
      { text: row.count.text, title: row.count.tooltip },
      { text: row.total.text, tone: cellTone(row.total.tone) },
      { text: row.average.text, tone: cellTone(row.average.tone) },
      { text: row.max.text, tone: cellTone(row.max.tone) },
      { text: row.examined.text, tone: cellTone(row.examined.tone), title: row.examined.tooltip },
      { text: row.op.text, ...(row.op.flag === undefined ? {} : { marks: [row.op.flag] }) },
      { text: row.namespace },
      { text: row.query },
      { text: row.plan.text, ...(row.plan.highlighted ? { tone: 'warning' as const } : {}) },
      { text: row.last },
    ],
  }));
}

function operationRows(tab: MonitorTab, shown: SlowQueriesView): readonly GridRow[] {
  const chosen = tab.selected.slow;
  return (shown.operations ?? []).map((row) => ({
    id: String(row.index),
    selected: chosen !== undefined && 'operation' in chosen && chosen.operation === row.index,
    cells: [
      { text: row.time },
      { text: row.op },
      { text: row.namespace },
      { text: row.ms.text, tone: cellTone(row.ms.tone) },
      { text: row.docsExamined },
      { text: row.keysExamined },
      { text: row.returned },
      { text: row.plan.text, ...(row.plan.highlighted ? { tone: 'warning' as const } : {}) },
      { text: row.command },
    ],
  }));
}

/** The Slow queries section. */
export function SlowSection(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
}): React.JSX.Element {
  const { tabId, tab, connection } = props;
  const shown = view(slowState(tab, connection));
  const byQuery = shown.groups !== undefined;
  return (
    <section className={`${styles['section'] ?? ''} ${styles['filled'] ?? ''}`}>
      <SlowToolbar tabId={tabId} toolbar={shown.toolbar} />
      <RecordingRow tabId={tabId} tab={tab} shown={shown} />
      {shown.note === undefined ? null : <p className={styles['note']}>{shown.note}</p>}
      <ErrorLine text={shown.error ?? tab.operationErrors['slow-queries']} />
      {shown.empty === undefined ? null : <p className={styles['notice']}>{shown.empty}</p>}
      <ServerGrid
        label={text.window.slowTable}
        columns={byQuery ? groupColumns(tabId, tab, shown) : shown.columns.map((label) => ({ label }))}
        template={
          byQuery
            ? '5em 6em 6em 6em 9em 7em minmax(8em, 1fr) minmax(10em, 2fr) 8em 11em'
            : '11em 7em minmax(8em, 1fr) 5em 7em 7em 6em 8em minmax(10em, 2fr)'
        }
        fill
        rows={byQuery ? groupRows(tab, shown) : operationRows(tab, shown)}
        onSelect={(id) => {
          select(tabId, ({ slow: _dropped, ...others }) => {
            if (id === undefined) {
              return others;
            }
            return { ...others, slow: byQuery ? { group: id } : { operation: Number(id) } };
          });
        }}
      />
    </section>
  );
}
