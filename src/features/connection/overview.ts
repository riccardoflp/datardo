/**
 * Feature: connection.overview — the page of a connection: what it is, how it is reached, and what the server is. It
 * is a page tab of the connection, one per connection. Not connected, it shows the header and **Connection** only, and
 * opening it reads nothing and does not connect. **Databases** joins it with the reads of the tree area (M8).
 */
import type { ConnectionView, MongoServerInfo, RedisServerInfo, ServerInfo } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionState, savedConnection, type ConnectionsState } from '../../shared/state/connections';
import type { TabShows } from '../../shared/state/tabs';
import { groupThousands } from '../../shared/text-units';
import { latencyText } from '../nav/ping';
import { overviewText as text, planText, stateText } from './text';
import { appStep, nothingToDo, targetConnection } from './types';

/** The page of a connection that is its Overview. */
export const overviewPage = 'overview';

/** What the Overview tab of a connection shows (`tab.same-target`). */
export function overviewShows(connection: ConnectionId): TabShows {
  return { kind: 'page', connection, page: overviewPage, title: text.title };
}

/** What the page has of a read: nothing yet, reading, its result, or the server's error. */
export type Loaded<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly error: string }
  | { readonly kind: 'loaded'; readonly value: T };

/** What the page is drawn from. */
export interface OverviewState {
  readonly connections: ConnectionsState;
  readonly connection: ConnectionId;
  /** The latency of the last ping, when the connection is the current one (`nav.ping`). */
  readonly latencyMs?: number;
  /** What `connection.server-info` read for the page, while connected. */
  readonly server?: Loaded<ServerInfo>;
}

/** A button of the header, the feature it starts on the connection and its element. */
export interface OverviewButton {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** A line of a section: a label and its value. */
export interface OverviewRow {
  readonly label: string;
  readonly value: string;
}

/** The **Server** section: reading, the server's error with **Retry**, or its rows. */
export type ServerSection =
  | { readonly kind: 'loading'; readonly text: string }
  | { readonly kind: 'failed'; readonly error: string; readonly retry: string }
  | {
      readonly kind: 'loaded';
      readonly rows: readonly OverviewRow[];
      /** MongoDB: the hosts and their roles. */
      readonly hosts?: { readonly title: string; readonly rows: readonly (readonly [string, string])[] };
    };

/** The page. */
export interface OverviewView {
  readonly color?: string;
  readonly name: string;
  readonly engine: string;
  /** The state, and the latency of the current connection: `connected · 4 ms`. */
  readonly state: string;
  readonly readOnly?: string;
  readonly buttons: readonly OverviewButton[];
  readonly connection: {
    readonly title: string;
    readonly rows: readonly OverviewRow[];
    readonly lines: readonly string[];
  };
  readonly server?: { readonly title: string; readonly section: ServerSection };
  /** What `connection.server-info` reads, while connected: its arguments. */
  readonly read?: Json;
}

const engines = { mongodb: 'MongoDB', redis: 'Redis' } as const;

function headerButtons(connected: boolean): readonly OverviewButton[] {
  return [
    { label: text.refresh, feature: 'connection.server-info', element: 'connection.overview@toolbar' },
    { label: text.edit, feature: 'connection.edit', element: 'connection.edit@toolbar' },
    connected
      ? { label: text.disconnect, feature: 'connection.disconnect', element: 'connection.disconnect@toolbar' }
      : { label: text.connect, feature: 'connection.connect', element: 'connection.connect@toolbar' },
  ];
}

function connectionLines(connection: ConnectionView, connections: ConnectionsState): readonly string[] {
  const linked =
    connection.publishesTo === undefined ? undefined : savedConnection(connections, connection.publishesTo);
  const publishers = connections.saved.filter(
    (each) => each.engine === 'mongodb' && each.publishesTo === connection.id,
  );
  return [
    ...(connection.ssh === undefined ? [] : [text.throughSsh(`${connection.ssh.username}@${connection.ssh.host}`)]),
    ...(connection.tls !== undefined && Object.keys(connection.tls).length > 0 ? [text.tlsSet] : []),
    ...(connection.readOnly ? [text.readOnlyLine] : []),
    ...(connection.keepsUndo ? [] : [text.noUndo]),
    ...(connection.engine === 'mongodb' && linked !== undefined ? [text.publishes(linked.name)] : []),
    ...(connection.engine === 'redis' && publishers.length > 0
      ? [text.receives(publishers.map((each) => each.name).join(', '))]
      : []),
  ];
}

const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A number of bytes as the tree writes it: `512 B`, `1.5 KB`, `1.0 GB`. */
export function sizeText(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < sizeUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${String(Math.round(value))} B` : `${value.toFixed(1)} ${sizeUnits[unit] ?? ''}`;
}

/** A duration in seconds in its largest whole unit: `45 s`, `12 min`, `3 h`, `1 d`. */
export function durationText(seconds: number): string {
  const units: readonly (readonly [number, string])[] = [
    [86_400, 'd'],
    [3600, 'h'],
    [60, 'min'],
  ];
  const unit = units.find(([size]) => seconds >= size);
  return unit === undefined
    ? `${groupThousands(Math.round(seconds))} s`
    : `${groupThousands(Math.floor(seconds / unit[0]))} ${unit[1]}`;
}

function topologyText(info: MongoServerInfo): string {
  switch (info.topology.kind) {
    case 'standalone':
      return text.standalone;
    case 'replica-set':
      return text.replicaSet(info.topology.name);
    case 'sharded':
      return text.sharded;
  }
}

function mongoSection(info: MongoServerInfo): ServerSection {
  return {
    kind: 'loaded',
    rows: [
      { label: text.version, value: info.version },
      { label: text.topology, value: topologyText(info) },
    ],
    hosts: { title: text.hosts, rows: info.hosts.map((host) => [host.host, host.role] as const) },
  };
}

function counted(value: number | undefined): string {
  return value === undefined ? '' : groupThousands(value);
}

function redisRows(info: RedisServerInfo): readonly OverviewRow[] {
  const role = info.role;
  const memory = info.memory;
  const clients = info.clients;
  const limit = memory?.limit;
  return [
    { label: text.version, value: `${info.product} ${info.version}` },
    { label: text.mode, value: info.mode ?? '' },
    {
      label: text.role,
      value:
        role === undefined
          ? ''
          : role.kind === 'master'
            ? text.master
            : text.replicaOf(`${role.masterHost}:${role.masterPort}`),
    },
    { label: text.uptime, value: info.uptimeSeconds === undefined ? '' : durationText(info.uptimeSeconds) },
    {
      label: text.memory,
      value: [
        `${text.used} ${memory?.used === undefined ? '' : sizeText(memory.used)}`,
        `${text.peak} ${memory?.peak === undefined ? '' : sizeText(memory.peak)}`,
        `${text.limit} ${limit === undefined ? '' : limit === 0 ? text.noLimit : sizeText(limit)}`,
        `${text.policy} ${memory?.policy ?? ''}`,
      ].join(' · '),
    },
    {
      label: text.clients,
      value: [
        `${text.connected} ${counted(clients?.connected)}`,
        `${text.blocked} ${counted(clients?.blocked)}`,
        `${text.limit} ${counted(clients?.limit)}`,
      ].join(' · '),
    },
  ];
}

function serverSection(server: Loaded<ServerInfo> | undefined): ServerSection {
  if (server === undefined || server.kind === 'loading') {
    return { kind: 'loading', text: text.loading };
  }
  if (server.kind === 'failed') {
    return { kind: 'failed', error: server.error, retry: text.retry };
  }
  return server.value.engine === 'mongodb'
    ? mongoSection(server.value)
    : { kind: 'loaded', rows: redisRows(server.value) };
}

/** Feature: connection.overview — what the page shows, from the state of the connection and what was read. */
export function view(state: OverviewState): OverviewView | undefined {
  const connection = savedConnection(state.connections, state.connection);
  if (connection === undefined) {
    return undefined;
  }
  const live = connectionState(state.connections, connection.id);
  const connected = live === 'connected';
  const stateLine =
    connected && state.latencyMs !== undefined
      ? `${stateText[live]} · ${latencyText(state.latencyMs)}`
      : stateText[live];
  return {
    ...(connection.color === undefined ? {} : { color: connection.color }),
    name: connection.name,
    engine: engines[connection.engine],
    state: stateLine,
    ...(connection.readOnly ? { readOnly: text.readOnly } : {}),
    buttons: headerButtons(connected || live === 'connecting' || live === 'reconnecting'),
    connection: {
      title: text.connection,
      rows: [
        { label: text.address, value: connection.address ?? connection.hosts },
        { label: text.folder, value: connection.folder ?? text.noFolder },
      ],
      lines: connectionLines(connection, state.connections),
    },
    ...(connected
      ? {
          server: { title: text.server, section: serverSection(state.server) },
          read: { connection: connection.id, depth: 'overview', hosts: connection.hosts },
        }
      : {}),
  };
}

/**
 * Feature: connection.overview — **Open overview** and Go to (**Overview**): `open Overview of <name>`, the tab of the
 * page, or the open one made active. Opening it does not connect.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const connection = targetConnection(context) ?? currentConnection(context);
  if (connection === undefined) {
    return nothingToDo(text.title, planText.nothingToUndo);
  }
  return run({
    title: text.title,
    steps: [appStep('connection.overview', { connection: connection.id }, planText.openOverview(connection.name))],
    danger: noDanger,
    undo: { cannot: planText.nothingToUndo },
    publishes: false,
    after: [],
  });
}

function currentConnection(context: Context): ConnectionView | undefined {
  const current = context.state.nav.current;
  return current === undefined ? undefined : savedConnection(context.state.connections, current);
}
