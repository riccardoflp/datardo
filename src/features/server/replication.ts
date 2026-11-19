/**
 * Feature: server.replication
 *
 * The Replication section of the Server page: whether the server is a master or a replica, who replicates from it or
 * whom it follows, and how far behind. It only reads: replication is changed with `REPLICAOF` in the console. The
 * colors of the lag are Mongoster's: yellow from 10 seconds, red from 60.
 */
import { infoField, infoNumber, type InfoReport, type ReplicaLine } from './read-info';
import { text } from './text';
import {
  countText,
  sentenceOf,
  sizeOrMissing,
  sizeText,
  timeOrMissing,
  valueOf,
  type Inspection,
  type PartRead,
  type Tone,
} from './types';

/** The color of a number of seconds behind: yellow from 10, red from 60. */
export function lagTone(seconds: number | undefined): Tone {
  if (seconds === undefined) {
    return 'ordinary';
  }
  return seconds >= 60 ? 'error' : seconds >= 10 ? 'warning' : 'ordinary';
}

/** A tile of the section. */
export interface ReplicationTile {
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
  readonly tooltip?: string;
}

/** A row of the table of the replicas. */
export interface ReplicaRow {
  readonly name: string;
  readonly address: string;
  readonly state: string;
  readonly offset: string;
  readonly behind: string;
  readonly lag: string;
  readonly lagTone: Tone;
  readonly selected: boolean;
}

/** What the Replication section is drawn from. */
export interface ReplicationState {
  readonly info?: PartRead<InfoReport>;
  /** The replica selected, by its name in `INFO` (`slave0`). */
  readonly selected?: string;
}

/** What the Replication section shows. */
export interface ReplicationView {
  readonly error?: string;
  readonly tiles: readonly ReplicationTile[];
  /** *This server is a replica: it refuses writes.* */
  readonly line?: string;
  readonly replicas?: { readonly columns: typeof text.replication.columns; readonly rows: readonly ReplicaRow[] };
  /** *No replica is connected to this server.* */
  readonly noReplica?: string;
  readonly inspector?: Inspection;
}

const tiles = text.replication.tiles;

function tile(label: string, value: string, tone: Tone = 'ordinary'): ReplicationTile {
  return { label, value, tone };
}

function masterTiles(report: InfoReport): readonly ReplicationTile[] {
  const replid = infoField(report, 'master_replid');
  const backlogOn = infoField(report, 'repl_backlog_active') === '1';
  const failover = infoField(report, 'master_failover_state');
  return [
    tile(tiles.role, text.overview.master),
    tile(tiles.replicas, countText(infoNumber(report, 'connected_slaves'))),
    {
      ...tile(tiles.offset, countText(infoNumber(report, 'master_repl_offset'))),
      ...(replid === undefined ? {} : { tooltip: replid }),
    },
    tile(
      tiles.backlog,
      backlogOn ? text.replication.on(sizeOrMissing(infoNumber(report, 'repl_backlog_size'))) : text.replication.off,
    ),
    ...(failover === undefined || failover === 'no-failover' ? [] : [tile(tiles.failover, failover)]),
  ];
}

function linkTile(report: InfoReport): ReplicationTile {
  if (infoField(report, 'master_link_status') === 'up') {
    return tile(tiles.link, text.replication.up);
  }
  const since = infoNumber(report, 'master_link_down_since_seconds');
  return tile(
    tiles.link,
    since === undefined ? text.replication.down : text.replication.downFor(timeOrMissing(since)),
    'error',
  );
}

function replicaTiles(report: InfoReport): readonly ReplicationTile[] {
  const address = `${infoField(report, 'master_host') ?? text.missing}:${infoField(report, 'master_port') ?? text.missing}`;
  const contact = infoNumber(report, 'master_last_io_seconds_ago');
  const syncing = infoField(report, 'master_sync_in_progress') === '1';
  return [
    tile(tiles.role, text.overview.replicaOf(address)),
    linkTile(report),
    tile(
      tiles.lastContact,
      contact === undefined ? text.missing : text.replication.ago(timeOrMissing(contact)),
      lagTone(contact),
    ),
    tile(tiles.offset, countText(infoNumber(report, 'slave_repl_offset'))),
    ...(syncing
      ? [tile(tiles.sync, text.replication.syncing(sizeOrMissing(infoNumber(report, 'master_sync_left_bytes'))))]
      : []),
    tile(tiles.priority, infoField(report, 'slave_priority') ?? infoField(report, 'replica_priority') ?? text.missing),
  ];
}

function replicaRow(replica: ReplicaLine, masterOffset: number | undefined, selected?: string): ReplicaRow {
  const behind =
    masterOffset === undefined || replica.offset === undefined
      ? text.missing
      : sizeText(Math.max(0, masterOffset - replica.offset));
  return {
    name: replica.name,
    address: `${replica.ip ?? text.missing}:${replica.port ?? text.missing}`,
    state: replica.state ?? text.missing,
    offset: countText(replica.offset),
    behind,
    lag: timeOrMissing(replica.lag),
    lagTone: lagTone(replica.lag),
    selected: replica.name === selected,
  };
}

function replicasPart(report: InfoReport, selected: string | undefined): Partial<ReplicationView> {
  const masterOffset = infoNumber(report, 'master_repl_offset');
  return report.replicas.length === 0
    ? {}
    : {
        replicas: {
          columns: text.replication.columns,
          rows: report.replicas.map((replica) => replicaRow(replica, masterOffset, selected)),
        },
      };
}

function inspection(report: InfoReport, selected: string | undefined): Inspection | undefined {
  const replica = report.replicas.find((each) => each.name === selected);
  return replica === undefined ? undefined : { title: replica.name, fields: replica.pairs };
}

/** Feature: server.replication — what the Replication section shows. */
export function view(state: ReplicationState): ReplicationView {
  const error = sentenceOf(state.info);
  const report = valueOf(state.info);
  const errorPart = error === undefined ? {} : { error };
  if (report === undefined) {
    return { ...errorPart, tiles: [] };
  }
  const found = inspection(report, state.selected);
  const inspector = found === undefined ? {} : { inspector: found };
  if (infoField(report, 'role') === 'slave') {
    const readOnly = infoField(report, 'slave_read_only') ?? infoField(report, 'replica_read_only');
    return {
      ...errorPart,
      tiles: replicaTiles(report),
      ...(readOnly === '1' ? { line: text.replication.refusesWrites } : {}),
      ...((infoNumber(report, 'connected_slaves') ?? 0) > 0 ? replicasPart(report, state.selected) : {}),
      ...inspector,
    };
  }
  const part = replicasPart(report, state.selected);
  return {
    ...errorPart,
    tiles: masterTiles(report),
    ...(part.replicas === undefined ? { noReplica: text.replication.noReplica } : part),
    ...inspector,
  };
}
