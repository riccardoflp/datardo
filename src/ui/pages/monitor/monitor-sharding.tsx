/**
 * `monitor.sharding`: the Sharding section of a Monitor page tab, drawn from its View. Through a mongos: the tiles,
 * what could not be read, **Shards** with **Stop balancer…** or **Start balancer…** (`monitor.set-balancer@toolbar`),
 * **Sharded collections** with its filter and sorts, and **Recent events** with its filter (read 300 ms after the
 * last key) and **Show**. On another server, the sentence of its case. Selecting a row shows it in the inspector
 * island, where a sharded collection has its balancing control.
 */
import { nextSort } from '../../../features/monitor/parts/tiles';
import { isWordColumn, unsortedColumns, type CollectionColumn } from '../../../features/monitor/parts/sharding-tables';
import { view, type ClusterView } from '../../../features/monitor/sharding';
import { text } from '../../../features/monitor/text';
import { ServerGrid, type GridColumn } from '../server/server-grid';
import { ErrorLine, Field } from '../server/server-parts';
import { changeChoices, select } from './monitor-changes';
import { cellTone, ControlButton } from './monitor-parts';
import { readPartOf } from './monitor-reads';
import { shardingState, type PageConnection } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import { NoticeLine, SectionTiles, shardColor } from './monitor-tiles';
import styles from '../server/server-page.module.css';
import own from './monitor-page.module.css';

const words = text.sharding;

/** How long after the last key the events are read again, in ms (`monitor.sharding`). */
const typingMs = 300;

const typing = new Map<string, ReturnType<typeof setTimeout>>();

function readEventsSoon(tab: string): void {
  const timer = typing.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  typing.set(
    tab,
    setTimeout(() => {
      typing.delete(tab);
      void readPartOf(tab, 'sharding', 'sharding-events');
    }, typingMs),
  );
}

type Chosen = NonNullable<MonitorTab['selected']['sharding']>;

function choose(tabId: string, kind: Chosen['kind'], id: string | undefined): void {
  select(tabId, ({ sharding: _dropped, ...others }) =>
    id === undefined ? others : { ...others, sharding: { kind, key: id } },
  );
}

function isChosen(tab: MonitorTab, kind: Chosen['kind'], key: string): boolean {
  const chosen = tab.selected.sharding;
  return chosen?.kind === kind && chosen.key === key;
}

function Swatch(props: { readonly color: number | undefined }): React.JSX.Element {
  return (
    <span
      className={own['swatch']}
      aria-hidden="true"
      {...(props.color === undefined ? {} : { 'data-color': shardColor(props.color) })}
    />
  );
}

function Shards(props: { readonly tabId: string; readonly tab: MonitorTab; readonly shards: ClusterView['shards'] }) {
  const { tabId, tab, shards } = props;
  return (
    <section className={styles['part']} aria-label={words.shards.title}>
      <div className={own['heading']}>
        <h3 className={styles['title']}>{words.shards.title}</h3>
        <span className={styles['count']}>{shards.asOf}</span>
        {shards.balancer === undefined ? null : <ControlButton tab={tabId} control={shards.balancer} place="toolbar" />}
      </div>
      {shards.empty === undefined ? null : <p className={styles['notice']}>{shards.empty}</p>}
      <ServerGrid
        label={words.shards.title}
        columns={Object.values(words.shards.columns).map((label) => ({ label }))}
        template="minmax(8em, 1fr) 8em minmax(12em, 2fr) 6em 6em 8em 6em 7em 8em minmax(8em, 1fr)"
        rows={shards.rows.map((row) => ({
          id: row.shard,
          selected: isChosen(tab, 'shard', row.shard),
          cells: [
            { text: row.shard, lead: <Swatch color={row.color} /> },
            { text: row.replicaSet },
            { text: row.members },
            { text: row.state },
            { text: row.draining, ...(row.draining === '' ? {} : { tone: 'warning' as const }) },
            { text: row.zones },
            { text: row.chunks },
            { text: row.data, title: row.dataTooltip },
            { text: row.documents },
            { text: row.primaryOf },
          ],
        }))}
        onSelect={(id) => {
          choose(tabId, 'shard', id);
        }}
      />
    </section>
  );
}

function collectionColumns(tabId: string, tab: MonitorTab): readonly GridColumn[] {
  const sort = tab.choices.shardedSort ?? { column: 'namespace', descending: false };
  return (Object.entries(words.collections.columns) as [CollectionColumn, string][]).map(([column, label]) =>
    unsortedColumns.includes(column)
      ? { label }
      : {
          label,
          sorted: sort.column === column ? (sort.descending ? 'descending' : 'ascending') : undefined,
          onSort: () => {
            changeChoices(tabId, (choices) => ({
              ...choices,
              shardedSort: nextSort(choices.shardedSort ?? sort, column, isWordColumn),
            }));
          },
        },
  );
}

function Distribution(props: { readonly segments: ClusterView['collections']['rows'][number]['distribution'] }) {
  return (
    <span className={own['distribution']} aria-hidden="true">
      {props.segments.segments.map((segment) => (
        <span
          key={segment.shard}
          style={{ width: `${String(segment.share * 100)}%` }}
          {...(segment.color === undefined ? {} : { 'data-color': shardColor(segment.color) })}
        />
      ))}
    </span>
  );
}

function Collections(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly collections: ClusterView['collections'];
}) {
  const { tabId, tab, collections } = props;
  return (
    <section className={styles['part']} aria-label={words.collections.title}>
      <h3 className={styles['title']}>{words.collections.title}</h3>
      <div
        className={styles['toolbar']}
        role="toolbar"
        aria-label={text.window.sectionToolbar(words.collections.title)}
      >
        <Field
          label={words.collections.filter}
          placeholder={words.collections.filter}
          value={tab.choices.shardedFilter}
          onChange={(shardedFilter) => {
            changeChoices(tabId, (choices) => ({ ...choices, shardedFilter }));
          }}
        />
        <span className={styles['count']}>{collections.count}</span>
      </div>
      {collections.empty === undefined ? null : <p className={styles['notice']}>{collections.empty}</p>}
      <ServerGrid
        label={words.collections.title}
        columns={collectionColumns(tabId, tab)}
        template="minmax(12em, 2fr) minmax(10em, 2fr) 5em 6em 6em minmax(10em, 2fr) 7em 8em 8em 8em 5em"
        rows={collections.rows.map((row) => ({
          id: row.namespace,
          selected: isChosen(tab, 'collection', row.namespace),
          cells: [
            { text: row.namespace },
            { text: row.key },
            { text: row.unique },
            { text: row.balancing, tone: cellTone(row.balancingTone) },
            { text: row.chunks },
            { text: row.chunksPerShard },
            { text: row.data },
            { text: row.documents },
            { text: '', title: row.distribution.tooltip, lead: <Distribution segments={row.distribution} /> },
            {
              text: row.balance.word,
              title: row.balance.tooltip,
              ...(row.balance.warning ? { tone: 'warning' as const } : {}),
            },
            { text: row.jumbo, tone: cellTone(row.jumboTone) },
          ],
        }))}
        onSelect={(id) => {
          choose(tabId, 'collection', id);
        }}
      />
    </section>
  );
}

function EventsToolbar(props: { readonly tabId: string; readonly tab: MonitorTab; readonly count?: string }) {
  const { tabId, tab } = props;
  return (
    <div className={styles['toolbar']} role="toolbar" aria-label={text.window.sectionToolbar(words.events.title)}>
      <Field
        label={words.events.filter}
        placeholder={words.events.filter}
        value={tab.choices.eventsText}
        onChange={(eventsText) => {
          changeChoices(tabId, (choices) => ({ ...choices, eventsText }));
          readEventsSoon(tabId);
        }}
      />
      <label className={styles['field']}>
        <span>{words.events.show}</span>
        <select
          className={styles['input']}
          value={tab.choices.eventsScope}
          onChange={(event) => {
            const eventsScope = event.target.value === 'every' ? 'every' : 'balancer';
            changeChoices(tabId, (choices) => ({ ...choices, eventsScope }));
            void readPartOf(tabId, 'sharding', 'sharding-events');
          }}
        >
          <option value="balancer">{words.events.scopes.balancer}</option>
          <option value="every">{words.events.scopes.every}</option>
        </select>
      </label>
      {props.count === undefined ? null : <span className={styles['count']}>{props.count}</span>}
    </div>
  );
}

function Events(props: { readonly tabId: string; readonly tab: MonitorTab; readonly events: ClusterView['events'] }) {
  const { tabId, tab, events } = props;
  return (
    <section className={styles['part']} aria-label={words.events.title}>
      <h3 className={styles['title']}>{words.events.title}</h3>
      <EventsToolbar tabId={tabId} tab={tab} {...(events.count === undefined ? {} : { count: events.count })} />
      <ErrorLine text={events.error} />
      {events.empty === undefined ? null : <p className={styles['notice']}>{events.empty}</p>}
      <ServerGrid
        label={words.events.title}
        columns={Object.values(words.events.columns).map((label) => ({ label }))}
        template="13em minmax(10em, 1fr) minmax(10em, 1fr) 8em minmax(16em, 3fr)"
        rows={events.rows.map((row) => ({
          id: row.key,
          selected: isChosen(tab, 'event', row.key),
          cells: [
            { text: row.time },
            { text: row.event, ...(row.failure ? { tone: 'warning' as const, marks: ['⚠'] } : {}) },
            { text: row.namespace },
            { text: row.shard },
            { text: row.details },
          ],
        }))}
        onSelect={(id) => {
          choose(tabId, 'event', id);
        }}
      />
    </section>
  );
}

/** The Sharding section. */
export function ShardingSection(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
}): React.JSX.Element {
  const { tabId, tab, connection } = props;
  const shown = view(shardingState(tab, connection));
  return (
    <section className={`${styles['section'] ?? ''} ${own['parts'] ?? ''}`}>
      <NoticeLine text={tab.notices.sharding} />
      <ErrorLine text={tab.operationErrors.sharding} />
      {shown.kind === 'error' ? <ErrorLine text={shown.error} /> : null}
      {shown.kind === 'sentence' ? <p className={styles['notice']}>{shown.sentence}</p> : null}
      {shown.kind === 'cluster' ? (
        <>
          <SectionTiles label={text.sections.sharding} tiles={shown.tiles} />
          {shown.errors.length === 0 ? null : (
            <div className={styles['error']} role="alert">
              {shown.errors.map((line) => (
                <p key={line} className={styles['note']}>
                  {line}
                </p>
              ))}
            </div>
          )}
          <Shards tabId={tabId} tab={tab} shards={shown.shards} />
          <Collections tabId={tabId} tab={tab} collections={shown.collections} />
          <Events tabId={tabId} tab={tab} events={shown.events} />
        </>
      ) : null}
    </section>
  );
}
