/**
 * `monitor.replication`: the Replication section of a Monitor page tab, drawn from its View. On a replica set: the
 * tiles, the lines of what could not be read, **Members** with **Step down…** (`monitor.step-down@toolbar`), and
 * **Oplog** with its filter (read 300 ms after the last key), **Operation** and **Last**. On a standalone server and
 * on a mongos, the sentence of its case. Selecting a member or an entry shows it in the inspector island.
 */
import type { OplogPart } from '../../../features/monitor/replication';
import { view, type ReplicationView } from '../../../features/monitor/replication';
import { oplogLastChoices, oplogOperationChoices, type OplogLast } from '../../../features/monitor/parts/choices';
import { countText } from '../../../features/monitor/parts/units';
import { text } from '../../../features/monitor/text';
import { ServerGrid } from '../server/server-grid';
import { ErrorLine, Field } from '../server/server-parts';
import { changeChoices, select } from './monitor-changes';
import { cellTone, ControlButton } from './monitor-parts';
import { readPartOf } from './monitor-reads';
import { replicationState, type PageConnection } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import { NoticeLine, SectionTiles } from './monitor-tiles';
import styles from '../server/server-page.module.css';
import own from './monitor-page.module.css';

const words = text.replication;

/** How long after the last key the oplog is read again, in ms (`monitor.replication`). */
const typingMs = 300;

const typing = new Map<string, ReturnType<typeof setTimeout>>();

/** Reads the oplog again 300 ms after the last change of its filter. */
function readOplogSoon(tab: string): void {
  const timer = typing.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  typing.set(
    tab,
    setTimeout(() => {
      typing.delete(tab);
      void readPartOf(tab, 'replication', 'oplog');
    }, typingMs),
  );
}

type SetView = Extract<ReplicationView, { readonly kind: 'replica-set' }>;

function Members(props: { readonly tabId: string; readonly tab: MonitorTab; readonly members: SetView['members'] }) {
  const { tabId, tab, members } = props;
  const chosen = tab.selected.replication;
  return (
    <section className={styles['part']} aria-label={words.members.title}>
      <div className={own['heading']}>
        <h3 className={styles['title']}>{words.members.title}</h3>
        <span className={styles['count']}>{members.asOf}</span>
        <ControlButton tab={tabId} control={members.stepDown} place="toolbar" />
      </div>
      <ServerGrid
        label={words.members.title}
        columns={Object.values(words.members.columns).map((label) => ({ label }))}
        template="minmax(12em, 2fr) 9em 6em 7em 7em 5em minmax(10em, 1fr) 5em 4em minmax(10em, 2fr) 6em"
        rows={members.rows.map((row) => ({
          id: row.member,
          selected: chosen?.kind === 'member' && chosen.key === row.member,
          cells: [
            { text: row.member, ...(row.self ? { marks: ['★'] } : {}) },
            { text: row.state, ...(row.healthy ? {} : { tone: 'error' as const }) },
            { text: row.lag, tone: cellTone(row.lagTone) },
            { text: row.lastApplied },
            { text: row.heartbeat },
            { text: row.ping },
            { text: row.syncSource },
            { text: row.priority },
            { text: row.votes },
            { text: row.notes },
            { text: row.uptime },
          ],
        }))}
        onSelect={(id) => {
          select(tabId, ({ replication: _dropped, ...others }) =>
            id === undefined ? others : { ...others, replication: { kind: 'member', key: id } },
          );
        }}
      />
    </section>
  );
}

function OplogToolbar(props: { readonly tabId: string; readonly tab: MonitorTab; readonly count?: string }) {
  const { tabId, tab } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.sectionToolbar(words.oplog.title)}>
      <Field
        label={words.oplog.filter}
        placeholder={words.oplog.filter}
        value={tab.choices.oplogText}
        onChange={(oplogText) => {
          changeChoices(tabId, (choices) => ({ ...choices, oplogText }));
          readOplogSoon(tabId);
        }}
      />
      <label className={styles['field']}>
        <span>{words.oplog.operation}</span>
        <select
          className={styles['input']}
          value={tab.choices.oplogOperation}
          onChange={(event) => {
            const oplogOperation = oplogOperationChoices.find((each) => each === event.target.value);
            if (oplogOperation !== undefined) {
              changeChoices(tabId, (choices) => ({ ...choices, oplogOperation }));
              void readPartOf(tabId, 'replication', 'oplog');
            }
          }}
        >
          {oplogOperationChoices.map((each) => (
            <option key={each} value={each}>
              {words.oplog.operations[each]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles['field']}>
        <span>{words.oplog.last}</span>
        <select
          className={styles['input']}
          value={String(tab.choices.oplogLast)}
          onChange={(event) => {
            const oplogLast = oplogLastChoices.find((each) => String(each) === event.target.value) as OplogLast;
            changeChoices(tabId, (choices) => ({ ...choices, oplogLast }));
            void readPartOf(tabId, 'replication', 'oplog');
          }}
        >
          {oplogLastChoices.map((each) => (
            <option key={each} value={String(each)}>
              {countText(each)}
            </option>
          ))}
        </select>
      </label>
      {props.count === undefined ? null : <span className={styles['count']}>{props.count}</span>}
    </div>
  );
}

function Oplog(props: { readonly tabId: string; readonly tab: MonitorTab; readonly oplog: OplogPart }) {
  const { tabId, tab, oplog } = props;
  const chosen = tab.selected.replication;
  return (
    <section className={styles['part']} aria-label={words.oplog.title}>
      <h3 className={styles['title']}>{words.oplog.title}</h3>
      <OplogToolbar tabId={tabId} tab={tab} {...(oplog.count === undefined ? {} : { count: oplog.count })} />
      <ErrorLine text={oplog.error} />
      {oplog.empty === undefined ? null : <p className={styles['notice']}>{oplog.empty}</p>}
      <ServerGrid
        label={words.oplog.title}
        columns={Object.values(words.oplog.columns).map((label) => ({ label }))}
        template="13em 7em minmax(10em, 1fr) minmax(8em, 1fr) minmax(16em, 3fr)"
        rows={oplog.rows.map((row) => ({
          id: row.key,
          selected: chosen?.kind === 'entry' && chosen.key === row.key,
          cells: [
            { text: row.time },
            { text: row.op },
            { text: row.namespace },
            { text: row.id },
            { text: row.change },
          ],
        }))}
        onSelect={(id) => {
          select(tabId, ({ replication: _dropped, ...others }) =>
            id === undefined ? others : { ...others, replication: { kind: 'entry', key: id } },
          );
        }}
      />
    </section>
  );
}

/** The Replication section. */
export function ReplicationSection(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
}): React.JSX.Element {
  const { tabId, tab, connection } = props;
  const shown = view(replicationState(tab, connection));
  return (
    <section className={`${styles['section'] ?? ''} ${own['parts'] ?? ''}`}>
      <NoticeLine text={tab.notices.replication} />
      <ErrorLine text={tab.operationErrors.replication} />
      {shown.kind === 'error' ? <ErrorLine text={shown.error} /> : null}
      {shown.kind === 'standalone' || shown.kind === 'mongos' ? (
        <p className={styles['notice']}>{shown.sentence}</p>
      ) : null}
      {shown.kind === 'replica-set' ? (
        <>
          <SectionTiles label={text.sections.replication} tiles={shown.tiles} />
          {shown.lines.map((line) => (
            <ErrorLine key={line} text={line} />
          ))}
          <Members tabId={tabId} tab={tab} members={shown.members} />
          <Oplog tabId={tabId} tab={tab} oplog={shown.oplog} />
        </>
      ) : null}
    </section>
  );
}
