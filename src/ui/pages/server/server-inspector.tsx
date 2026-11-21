/**
 * `nav.inspector` on the Server page: what is selected in the section shown, whole: every field the server gave with
 * its value and **Copy**; for an entry of the slow log its command on as many lines as it has arguments with **Copy
 * command**; for a client **Disconnect…** (`@inspector`); for a key of the largest keys what `key.inspect` shows.
 */
import { useEffect } from 'react';
import { settleMs } from '../../../features/key/details';
import { view as inspectView } from '../../../features/key/inspect';
import { inspectorDisconnect } from '../../../features/server/clients';
import { view as slowLogView } from '../../../features/server/slow-log';
import { text } from '../../../features/server/text';
import { bytesOfHex, valueOf, type Inspection, type ServerControl } from '../../../features/server/types';
import type { ConnectionView } from '../../../shared/connection';
import type { AppState } from '../../../shared/state';
import { useAppState } from '../../state/store';
import { KeyDetails, useClock } from '../keys/key-inspector';
import { readLargestKey } from './server-largest';
import { ControlButton } from './server-parts';
import { clientsState, connectionOf, inspectionOf, sectionOf, slowLogState } from './server-state';
import { useServerTab, type ServerTab } from './server-store';
import styles from './server-page.module.css';

/** The buttons of what is selected: **Copy**, and those of its section. */
function buttonsOf(
  tab: ServerTab,
  connection: ConnectionView,
  section: string,
  shown: Inspection,
): readonly ServerControl[] {
  const copy: ServerControl = {
    kind: 'copy',
    label: text.window.copy,
    text: shown.fields.map(([name, value]) => `${name}: ${value}`).join('\n'),
  };
  if (section === 'clients') {
    const client = valueOf(tab.clients)?.find((each) => each.id === tab.selected.clients);
    return client === undefined ? [copy] : [copy, inspectorDisconnect(clientsState(tab, connection), client)];
  }
  return [copy];
}

function Fields(props: {
  readonly tabId: string;
  readonly app: AppState;
  readonly tab: ServerTab;
  readonly now: number;
}) {
  const { tabId, app, tab, now } = props;
  const connection = connectionOf(app, tab.connection);
  const section = sectionOf(app, tabId);
  const shown = inspectionOf(app, tab, section, now);
  if (connection === undefined || shown === undefined) {
    return null;
  }
  const entry = section === 'slow-log' ? slowLogView(slowLogState(tab, connection, now)).inspector : undefined;
  return (
    <div className={styles['inspected']}>
      <div className={styles['buttons']}>
        {buttonsOf(tab, connection, section, shown).map((control) => (
          <ControlButton key={control.label} tab={tabId} control={control} place="inspector" />
        ))}
      </div>
      <dl className={styles['lines']}>
        {shown.fields.map(([name, value], index) => (
          <div key={`${name} ${String(index)}`} style={{ display: 'contents' }}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {entry === undefined ? null : (
        <>
          <pre className={styles['advice']}>{entry.lines.join('\n')}</pre>
          <div className={styles['buttons']}>
            <ControlButton tab={tabId} control={entry.copy} place="inspector" />
          </div>
        </>
      )}
    </div>
  );
}

function LargestKey(props: {
  readonly tabId: string;
  readonly app: AppState;
  readonly tab: ServerTab;
  readonly keyHex: string;
}) {
  const { tabId, app, tab, keyHex } = props;
  const now = useClock();
  const readFor = tab.largest.inspected?.key;
  useEffect(() => {
    if (readFor === keyHex) {
      return undefined;
    }
    const timer = setTimeout(() => {
      void readLargestKey(tabId, keyHex);
    }, settleMs);
    return () => {
      clearTimeout(timer);
    };
  }, [tabId, keyHex, readFor]);
  const database = tab.largest.search?.database ?? 0;
  const name = bytesOfHex(keyHex);
  const inspected = tab.largest.inspected;
  const read = inspected?.key === keyHex ? inspected.read : { kind: 'loading' as const };
  const readOnly = connectionOf(app, tab.connection)?.readOnly ?? true;
  const shown = inspectView({ name, readOnly, read, now });
  return (
    <KeyDetails
      shown={shown}
      target={{ kind: 'key', connection: tab.connection, database, key: name }}
      place="inspector"
    />
  );
}

/** The inspector island of a Server page tab with something selected. */
export function ServerInspector({ tabId }: { readonly tabId: string }): React.JSX.Element | null {
  const app = useAppState();
  const tab = useServerTab(tabId);
  const now = useClock();
  if (tab === undefined) {
    return null;
  }
  const largest = sectionOf(app, tabId) === 'memory' ? tab.selected.largest : undefined;
  return largest === undefined ? (
    <Fields tabId={tabId} app={app} tab={tab} now={now} />
  ) : (
    <LargestKey tabId={tabId} app={app} tab={tab} keyHex={largest} />
  );
}
