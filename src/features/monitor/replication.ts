/**
 * Feature: monitor.replication
 *
 * The Replication section: the replica set the server belongs to, its members with their state and lag, how much time
 * the oplog covers, and the last replicated operations. On a standalone server and on a mongos it says why there is
 * nothing to show. Ported from Mongoster's `src/webview/monitor.ts › renderRepl`, `renderMembers`, `renderOplog`.
 */
import { valueOfPart, type PartRead } from './parts/failure';
import { tile, type SectionControl, type Tile, type Tone } from './parts/tiles';
import { clockText, countText, isoDayTimeText, isSameDay, sizeText, spanText } from './parts/units';
import type { OplogRow } from './oplog-summary';
import type { OplogEntries, OplogOperation } from './read-oplog';
import type { ReplicaSetRead, ServerKind } from './read-replication';
import type { ReplicaMember } from './replication-lag';
import { text } from './text';
import type { MonitorConnection } from './types';

/** What the section is drawn from. */
export interface ReplicationState {
  readonly connection: MonitorConnection;
  /** What `hello` said the server is. */
  readonly server?: PartRead<ServerKind>;
  readonly replicaSet?: ReplicaSetRead;
  readonly oplog?: PartRead<OplogEntries>;
  readonly oplogText: string;
  readonly oplogOperation: OplogOperation;
  readonly oplogLast: number;
  /** When the replica set was read, in milliseconds since 1970. */
  readonly readAt: number;
}

/** A row of **Members**. */
export interface MemberRow {
  readonly member: string;
  /** Whether it is the server Datardo is connected to: the star. */
  readonly self: boolean;
  readonly state: string;
  readonly lag: string;
  readonly lagTone: Tone;
  readonly lastApplied: string;
  readonly heartbeat: string;
  readonly ping: string;
  readonly syncSource: string;
  readonly priority: string;
  readonly votes: string;
  readonly notes: string;
  readonly uptime: string;
  readonly healthy: boolean;
}

/** A row of **Oplog**. */
export interface OplogTableRow {
  readonly key: string;
  readonly time: string;
  readonly op: string;
  readonly namespace: string;
  readonly id: string;
  readonly change: string;
}

/** What the section shows. */
export type ReplicationView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'standalone'; readonly sentence: string }
  | { readonly kind: 'mongos'; readonly sentence: string }
  | {
      readonly kind: 'replica-set';
      readonly tiles: readonly Tile[];
      /** The lines under the tiles: a missing role, an oplog that cannot be read. */
      readonly lines: readonly string[];
      readonly members: {
        readonly asOf: string;
        readonly stepDown: SectionControl;
        readonly rows: readonly MemberRow[];
      };
      readonly oplog: OplogPart;
    };

/** The oplog table: its count, its rows, its error line or what it says when empty. */
export interface OplogPart {
  readonly count?: string;
  readonly rows: readonly OplogTableRow[];
  readonly error?: string;
  readonly empty?: string;
}

const words = text.replication;

/** The tone of a lag: the warning color from 10 seconds, the danger color from 60. */
export function lagTone(seconds: number): Tone {
  return seconds >= 60 ? 'danger' : seconds >= 10 ? 'warning' : 'ordinary';
}

function isDelayed(member: ReplicaMember): boolean {
  return (member.delaySeconds ?? 0) > 0;
}

function lagTile(members: readonly ReplicaMember[]): Tile {
  const counted = members.filter((member) => !isDelayed(member) && member.lagSeconds !== undefined);
  const largest = counted.reduce<ReplicaMember | undefined>(
    (kept, member) => ((member.lagSeconds ?? 0) > (kept?.lagSeconds ?? -1) ? member : kept),
    undefined,
  );
  const seconds = largest?.lagSeconds ?? 0;
  const who = seconds > 0 && largest !== undefined ? largest.name : words.tiles.upToDate;
  const line = members.some(isDelayed) ? `${who} · ${words.tiles.delayedLeftOut}` : who;
  return tile(words.tiles.lag, spanText(seconds), line, lagTone(seconds));
}

function membersTile(members: readonly ReplicaMember[]): Tile {
  const healthy = members.filter((member) => member.healthy).length;
  const states = new Map<string, number>();
  for (const member of members) {
    const state = member.state.toLowerCase();
    states.set(state, (states.get(state) ?? 0) + 1);
  }
  const line = [...states].map(([state, count]) => `${String(count)} ${state}`).join(' · ');
  const tone = healthy < members.length ? 'danger' : 'ordinary';
  return tile(words.tiles.members, words.tiles.healthy(healthy, members.length), line, tone);
}

function primaryTile(set: ReplicaSetRead): Tile {
  const self = set.members.find((member) => member.self);
  const line = self === undefined ? '' : words.tiles.connectedTo(self.name, self.state.toLowerCase());
  return set.primary === undefined
    ? tile(words.tiles.primary, words.tiles.none, line, 'danger')
    : tile(words.tiles.primary, set.primary, line);
}

function oplogTile(set: ReplicaSetRead): readonly Tile[] {
  const window = valueOfPart(set.oplog);
  if (window?.windowSeconds === undefined) {
    return [];
  }
  const line = words.tiles.oplogLine(
    sizeText(window.size ?? 0),
    sizeText(window.maxSize ?? 0),
    countText(window.count ?? 0),
    window.first === undefined ? '' : isoDayTimeText(window.first),
  );
  return [tile(words.tiles.oplogWindow, spanText(window.windowSeconds), line)];
}

function electionsTile(set: ReplicaSetRead): Tile {
  const election = set.election;
  const timeout = words.tiles.timeout(spanText((election.timeoutMillis ?? 10_000) / 1000));
  const heartbeat = words.tiles.heartbeat(spanText((election.heartbeatMillis ?? 2000) / 1000));
  const chaining = election.chainingAllowed === false ? words.tiles.chainingNotAllowed : words.tiles.chainingAllowed;
  return tile(words.tiles.elections, timeout, `${heartbeat} · ${chaining}`);
}

/** The tiles of a replica set: Replica set, Primary, Members, Replication lag, Oplog window, Elections. */
export function replicaSetTiles(set: ReplicaSetRead): readonly Tile[] {
  const term = set.term === undefined ? '' : words.tiles.termLine(String(set.term), String(set.protocolVersion ?? 1));
  return [
    tile(words.tiles.replicaSet, set.setName, term),
    primaryTile(set),
    membersTile(set.members),
    lagTile(set.members),
    ...oplogTile(set),
    electionsTile(set),
  ];
}

/** The notes of a member, joined by ` · `. */
export function memberNotes(member: ReplicaMember): string {
  return [
    member.hidden ? words.members.hidden : '',
    isDelayed(member) ? words.members.delayed(spanText(member.delaySeconds ?? 0)) : '',
    member.priority === 0 && !member.arbiter ? words.members.neverPrimary : '',
    member.buildIndexes === false ? words.members.noIndexBuilds : '',
    ...member.tags.map(([name, value]) => `${name}: ${value}`),
    member.message ?? '',
  ]
    .filter((note) => note !== '')
    .join(' · ');
}

function optionalNumber(value: number | undefined): string {
  return value === undefined ? words.members.missing : String(value);
}

/** The row of a member, its heartbeat counted from the time of the read. */
export function memberRow(member: ReplicaMember, readAt: number): MemberRow {
  const missing = words.members.missing;
  const heartbeat =
    member.self || member.lastHeartbeat === undefined
      ? missing
      : words.members.ago(spanText(Math.max(0, readAt - member.lastHeartbeat) / 1000));
  return {
    member: member.name,
    self: member.self,
    state: member.healthy ? member.state : `${member.state} ${words.members.down}`,
    lag: member.lagSeconds === undefined ? missing : spanText(member.lagSeconds),
    lagTone: lagTone(member.lagSeconds ?? 0),
    lastApplied: member.lastApplied === undefined ? missing : clockText(member.lastApplied),
    heartbeat,
    ping: member.pingMs === undefined ? missing : words.members.milliseconds(countText(member.pingMs)),
    syncSource: member.syncSource ?? missing,
    priority: optionalNumber(member.priority),
    votes: optionalNumber(member.votes),
    notes: memberNotes(member),
    uptime: member.uptime === undefined ? missing : spanText(member.uptime),
    healthy: member.healthy,
  };
}

function stepDownControl(state: ReplicationState, set: ReplicaSetRead): SectionControl {
  const connection = state.connection;
  const disabledBecause = connection.readOnly
    ? text.readOnly(connection.name)
    : set.primary === undefined
      ? words.members.noPrimary
      : undefined;
  return {
    label: words.members.stepDown,
    element: 'monitor.step-down@toolbar',
    feature: 'monitor.step-down',
    args: { connection: connection.id },
    ...(disabledBecause === undefined ? {} : { disabledBecause }),
  };
}

/** The time of an oplog entry with its milliseconds, and its date when it is not the day of the read. */
export function oplogTime(time: number, readAt: number): string {
  const milliseconds = String(Math.trunc(time) % 1000).padStart(3, '0');
  const clock = `${clockText(time)}.${milliseconds}`;
  return isSameDay(time, readAt) ? clock : `${isoDayTimeText(time).slice(0, 10)} ${clock}`;
}

function oplogRowOf(row: OplogRow, readAt: number): OplogTableRow {
  return {
    key: row.key,
    time: oplogTime(row.time, readAt),
    op: row.kind,
    namespace: row.namespace,
    id: row.id ?? '',
    change: row.summary,
  };
}

function oplogPart(state: ReplicationState): OplogPart {
  const read = state.oplog;
  if (read?.kind === 'failed') {
    return { rows: [], error: read.failure.message };
  }
  const entries = valueOfPart(read);
  if (entries === undefined) {
    return { rows: [] };
  }
  const kind = state.oplogOperation;
  const filtered = state.oplogText.trim() !== '' || (kind !== 'all-but-noops' && kind !== 'everything');
  const rows = entries.rows.map((row) => oplogRowOf(row, state.readAt));
  if (rows.length === 0) {
    return { rows, empty: filtered ? words.oplog.nothingMatches : words.oplog.empty };
  }
  const count = entries.more
    ? words.oplog.mostRecent(countText(state.oplogLast))
    : words.oplog.allMatching(countText(rows.length));
  return { rows, count };
}

function replicaSetView(state: ReplicationState, set: ReplicaSetRead): ReplicationView {
  const lines = [
    ...(set.statusFailure === undefined ? [] : [words.needsClusterMonitor(set.statusFailure.message)]),
    ...(set.oplog.kind === 'failed' ? [words.oplogFailed(set.oplog.failure.message)] : []),
  ];
  return {
    kind: 'replica-set',
    tiles: replicaSetTiles(set),
    lines,
    members: {
      asOf: words.members.asOf(clockText(state.readAt)),
      stepDown: stepDownControl(state, set),
      rows: set.members.map((member) => memberRow(member, state.readAt)),
    },
    oplog: oplogPart(state),
  };
}

/** Feature: monitor.replication — what the section shows, by the kind of server. */
export function view(state: ReplicationState): ReplicationView {
  const server = state.server;
  if (server === undefined) {
    return { kind: 'loading' };
  }
  if (server.kind === 'failed') {
    return { kind: 'error', error: server.failure.message };
  }
  switch (server.value.kind) {
    case 'mongos':
      return { kind: 'mongos', sentence: words.mongos };
    case 'standalone':
      return { kind: 'standalone', sentence: words.standalone(server.value.me ?? words.thisServer) };
    case 'replica-set':
      return state.replicaSet === undefined ? { kind: 'loading' } : replicaSetView(state, state.replicaSet);
  }
}
