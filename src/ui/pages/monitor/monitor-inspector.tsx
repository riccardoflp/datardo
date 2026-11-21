/**
 * `nav.inspector` on the Monitor page: what is selected in the section shown, whole, as mongosh text with **Copy**.
 * For an operation in progress, **Kill…** (`monitor.kill-operation@inspector`); for a slow query, why an index could
 * help with **Create index…** (`monitor.create-suggested-index@inspector`), **Open in collection** and **Explain**
 * (`monitor.open-slow-query@inspector`), **Copy query**, and for a group **Show operations** and its example line.
 * The Stats, Replication and Sharding sections draw theirs in `monitor-section-inspector.tsx`.
 */
import { view as operationsView } from '../../../features/monitor/operations';
import type { SlowQueryInspector } from '../../../features/monitor/parts/slow-query-inspector';
import { view as slowView } from '../../../features/monitor/slow-queries';
import { text } from '../../../features/monitor/text';
import { useAppState } from '../../state/store';
import { changeChoices, select } from './monitor-changes';
import { ControlButton, CopyButton } from './monitor-parts';
import { InspectedRecord as Record } from './monitor-record';
import { SectionInspector } from './monitor-section-inspector';
import { connectionOf, operationsState, sectionOf, slowState } from './monitor-state';
import { useMonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

function SlowQuery(props: { readonly tabId: string; readonly shown: SlowQueryInspector }): React.JSX.Element {
  const { tabId, shown } = props;
  const showOperations = shown.showOperations;
  return (
    <div className={styles['inspected']}>
      {shown.why.length === 0 ? null : (
        <section aria-label={text.window.why}>
          {shown.why.map((line) => (
            <p key={line} className={styles['notice']}>
              {line}
            </p>
          ))}
        </section>
      )}
      <div className={styles['buttons']}>
        {shown.createIndex === undefined ? null : (
          <ControlButton tab={tabId} control={shown.createIndex} place="inspector" />
        )}
        {shown.open === undefined ? null : <ControlButton tab={tabId} control={shown.open} place="inspector" />}
        {shown.explain === undefined ? null : <ControlButton tab={tabId} control={shown.explain} place="inspector" />}
        <CopyButton label={shown.copyQuery.label} text={shown.copyQuery.text} />
        {showOperations === undefined ? null : (
          <button
            type="button"
            className={styles['button']}
            onClick={() => {
              changeChoices(tabId, (choices) => ({
                ...choices,
                grouping: 'all',
                slowFilter: showOperations.filter,
              }));
              select(tabId, ({ slow: _dropped, ...others }) => others);
            }}
          >
            {showOperations.label}
          </button>
        )}
      </div>
      {shown.example === undefined ? null : <p className={styles['note']}>{shown.example}</p>}
      <h3 className={styles['title']}>{text.window.query}</h3>
      <pre className={styles['advice']}>{shown.query}</pre>
      <Record title={shown.record.title} value={shown.record.value} />
    </div>
  );
}

/** The inspector island of a Monitor page tab with something selected. */
export function MonitorInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useMonitorTab(tabId);
  const connection = tab === undefined ? undefined : connectionOf(app, tab.connection);
  if (tab === undefined || connection === undefined) {
    return null;
  }
  const section = sectionOf(app, tabId);
  if (section === 'stats' || section === 'replication' || section === 'sharding') {
    return <SectionInspector tabId={tabId} tab={tab} connection={connection} section={section} />;
  }
  if (section === 'operations') {
    const shown = operationsView(operationsState(tab, connection)).inspector;
    if (shown === undefined) {
      return null;
    }
    return (
      <div className={styles['inspected']}>
        {shown.kill === undefined ? null : (
          <div className={styles['buttons']}>
            <ControlButton tab={tabId} control={shown.kill} place="inspector" />
          </div>
        )}
        <Record value={shown.record} />
      </div>
    );
  }
  const shown = slowView(slowState(tab, connection)).inspector;
  return shown === undefined ? null : <SlowQuery tabId={tabId} shown={shown} />;
}
