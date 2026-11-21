/**
 * `nav.inspector` on the Stats, Replication and Sharding sections of the Monitor page: the database or collection
 * chosen with its statistics; a member with its entries of `replSetGetStatus` and `replSetGetConfig`; an oplog entry
 * whole; a shard with its `listShards` entry; an event whole; and a sharded collection with **Disable balancing…** or
 * **Enable balancing…** (`monitor.set-collection-balancing@inspector`), **Copy shard key**, the balancer's verdict,
 * its shards, its zones and its document of `config.collections`.
 */
import { valueOfPart } from '../../../features/monitor/parts/failure';
import { view as shardingView, type ShardingInspector } from '../../../features/monitor/sharding';
import { text } from '../../../features/monitor/text';
import type { MonitorSection } from '../../../features/monitor/types';
import type { Json } from '../../../shared/engine-request';
import { ControlButton, CopyButton } from './monitor-parts';
import { InspectedRecord } from './monitor-record';
import { shardingState, type PageConnection } from './monitor-state';
import type { MonitorTab } from './monitor-store';
import styles from '../server/server-page.module.css';

const words = text.sharding.inspector;

/** A statistics record as Extended JSON, its numbers as they are. */
function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function statsRecord(tab: MonitorTab): { readonly title: string; readonly value: Json } | undefined {
  const chosen = tab.selected.statsCollection;
  if (chosen !== undefined) {
    const found = valueOfPart(tab.stats.collections)?.find((each) => each.name === chosen);
    return found === undefined ? undefined : { title: chosen, value: asJson(found) };
  }
  const database = tab.choices.statsDatabase;
  const found = valueOfPart(tab.stats.databases)?.find((each) => each.name === database);
  return found === undefined || database === undefined ? undefined : { title: database, value: asJson(found) };
}

function replicationRecord(tab: MonitorTab): { readonly title: string; readonly value: Json } | undefined {
  const chosen = tab.selected.replication;
  if (chosen === undefined) {
    return undefined;
  }
  if (chosen.kind === 'member') {
    const member = tab.replication.replicaSet?.members.find((each) => each.name === chosen.key);
    return member === undefined
      ? undefined
      : {
          title: member.name,
          value: { replSetGetStatus: member.status ?? null, replSetGetConfig: member.config ?? null },
        };
  }
  const entry = valueOfPart(tab.replication.oplog)?.rows.find((row) => row.key === chosen.key);
  return entry === undefined ? undefined : { title: entry.key, value: entry.entry };
}

function ShardedCollection(props: {
  readonly tabId: string;
  readonly shown: Extract<ShardingInspector, { readonly kind: 'collection' }>;
}): React.JSX.Element {
  const { tabId, shown } = props;
  const columns = words.columns;
  return (
    <div className={styles['inspected']}>
      <div className={styles['buttons']}>
        <ControlButton tab={tabId} control={shown.balancing} place="inspector" />
        <CopyButton label={words.copyKey} text={shown.key} />
      </div>
      {shown.balance.word === '' ? null : (
        <p className={styles['note']} data-tone={shown.balance.warning ? 'warning' : undefined}>
          {shown.balance.word}: {shown.balance.tooltip}
        </p>
      )}
      <table className={styles['plain']}>
        <thead>
          <tr>
            {[columns.shard, columns.chunks, columns.data, columns.documents, columns.share].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.shards.map((row) => (
            <tr key={row.shard}>
              <td>{row.shard}</td>
              <td>{row.chunks}</td>
              <td>{row.data}</td>
              <td>{row.documents}</td>
              <td>{row.share}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className={styles['title']}>{words.zones}</h3>
      {shown.noZones === undefined ? null : <p className={styles['note']}>{shown.noZones}</p>}
      {shown.zones.map((zone) => (
        <p key={zone.range} className={styles['note']}>
          {zone.range} · {zone.shards}
        </p>
      ))}
      <InspectedRecord value={shown.record} />
    </div>
  );
}

function ShardingInspected(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
}): React.JSX.Element | null {
  const shown = shardingView(shardingState(props.tab, props.connection));
  const inspector = shown.kind === 'cluster' ? shown.inspector : undefined;
  switch (inspector?.kind) {
    case undefined:
      return null;
    case 'collection':
      return <ShardedCollection tabId={props.tabId} shown={inspector} />;
    case 'shard':
      return (
        <div className={styles['inspected']}>
          <InspectedRecord value={inspector.record} />
        </div>
      );
    case 'event':
      return (
        <div className={styles['inspected']}>
          <InspectedRecord value={inspector.entry} />
        </div>
      );
  }
}

/** The inspector island of the Stats, Replication or Sharding section, with something selected. */
export function SectionInspector(props: {
  readonly tabId: string;
  readonly tab: MonitorTab;
  readonly connection: PageConnection;
  readonly section: MonitorSection;
}): React.JSX.Element | null {
  const { tabId, tab, connection, section } = props;
  if (section === 'sharding') {
    return <ShardingInspected tabId={tabId} tab={tab} connection={connection} />;
  }
  const record =
    section === 'stats' ? statsRecord(tab) : section === 'replication' ? replicationRecord(tab) : undefined;
  return record === undefined ? null : (
    <div className={styles['inspected']}>
      <InspectedRecord title={record.title} value={record.value} />
    </div>
  );
}
