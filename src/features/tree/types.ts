/**
 * What the features of the tree area share: what their reads give, what the window keeps of the tree island of each
 * connection, the nodes and lines the views return with the controls they carry, and the identifiers of the nodes.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import type { Pin } from '../../shared/state/nav';
import { connectionOfShows, type TabShows } from '../../shared/state/tabs';
import type { Target } from '../../shared/target';
import { text } from './text';

/** Something the tree reads: not read yet, being read (since when), read, or failed with the server's message. */
export type Loadable<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly since: number; readonly previous?: T }
  | { readonly kind: 'loaded'; readonly value: T }
  | { readonly kind: 'failed'; readonly message: string };

/** Nothing read yet. */
export const idle = { kind: 'idle' } as const;

/**
 * A request of a read that failed, given to `parse` in place of its reply: the error of the server, without secrets.
 * The tree's reads say what such a reply means (`tree.list-databases`, `tree.count`, `tree.redis-databases`).
 */
export interface FailedReply {
  readonly kind: 'error';
  readonly message: string;
}

/** The kinds of the entries of a MongoDB database, from the `type` of `listCollections`. */
export type CollectionKind = 'collection' | 'view' | 'timeseries';

/** A MongoDB database, with its size on disk when the server said it (`tree.list-databases`). */
export interface MongoDatabase {
  readonly name: string;
  readonly sizeOnDisk?: number;
}

/** A collection, a view or a time series collection of a database (`tree.list-collections`). */
export interface CollectionEntry {
  readonly name: string;
  readonly kind: CollectionKind;
  /** Whether its name starts with `system.`: listed last, dimmed. */
  readonly system: boolean;
}

/** What a database holds, in the order of the tree: its buckets by name, then its entries (`tree.list-collections`). */
export interface DatabaseContents {
  readonly buckets: readonly string[];
  readonly entries: readonly CollectionEntry[];
}

/** A Redis database and what `INFO keyspace` says of it (`tree.redis-databases`). */
export interface RedisDatabase {
  readonly number: number;
  readonly keys: number;
  readonly expires: number;
  /** The average time to live of the keys with an expiry, in milliseconds. */
  readonly averageTtlMs: number;
}

/** The databases of a Redis server: how many it has, and each from 0 to that number less one. */
export interface RedisDatabases {
  readonly count: number;
  readonly databases: readonly RedisDatabase[];
}

/** The keys a scan of one database has seen so far (`tree.scan-namespaces`). Never written to disk. */
export interface KeyScan {
  /** The names seen, as bytes, each once, in the order they came. */
  readonly keys: readonly Uint8Array[];
  /** The names seen, as the hexadecimal of their bytes: a name returned twice is counted once. */
  readonly seen: ReadonlySet<string>;
  /** Where the next call starts; `0` once the scan reached the end. */
  readonly cursor: string;
  /** How many keys the calls of this run returned: a run stops once 10,000 were. */
  readonly returned: number;
  /** `whole`: the cursor came back `0`; `paused`: the run ended, or was cancelled, and **Load more** goes on. */
  readonly ended?: 'whole' | 'paused';
}

/** A scan of a database and what it is doing now. */
export interface ScanState {
  readonly scan: KeyScan;
  /** While calls are being made: since when, for **Loading…** after 200 ms. */
  readonly scanning?: { readonly since: number };
  /** The server's message when a call failed. */
  readonly failed?: string;
}

/** What the tree of a MongoDB connection has read. */
export interface MongoTreeData {
  readonly databases: Loadable<readonly MongoDatabase[]>;
  /** By database name. */
  readonly contents: Readonly<Record<string, Loadable<DatabaseContents>>>;
  /** The counts that arrived, by `<database>.<collection>`. */
  readonly counts: Readonly<Record<string, number>>;
}

/** What the tree of a Redis connection has read. */
export interface RedisTreeData {
  readonly databases: Loadable<RedisDatabases>;
  /** By database number. */
  readonly scans: Readonly<Record<string, ScanState>>;
}

/** The three parts of the tree island. */
export type PartName = 'pinned' | 'databases' | 'pages';

/**
 * The tree island of one connection as the window keeps it until Datardo quits: which nodes are expanded, the
 * selection, the parts collapsed, the filter, and what was read. None of it is saved.
 */
export interface TreeIsland {
  readonly expanded: readonly string[];
  readonly selected?: string;
  readonly collapsedParts: readonly PartName[];
  /** The filter: whether its field is open, and the text that applies (300 ms after the last key). */
  readonly filter: { readonly open: boolean; readonly text: string };
  readonly mongodb: MongoTreeData;
  readonly redis: RedisTreeData;
}

/** The tree island of a connection never shown. */
export const freshIsland: TreeIsland = {
  expanded: [],
  collapsedParts: [],
  filter: { open: false, text: '' },
  mongodb: { databases: idle, contents: {}, counts: {} },
  redis: { databases: idle, scans: {} },
};

/** What the views of the tree are computed from. */
export interface TreeInput {
  readonly state: AppState;
  /** The tree island of the current connection. */
  readonly island: TreeIsland;
  /** The time, in milliseconds since 1970, for **Loading…** after 200 ms. */
  readonly now: number;
  /** Whether a feature is built: an entry of a menu is shown only when the feature it starts is (roadmap, M8). */
  readonly isAvailable: (feature: string) => boolean;
}

/** What a node of the tree stands for. */
export type NodeRef =
  | { readonly kind: 'database'; readonly database: string }
  | {
      readonly kind: 'collection';
      readonly database: string;
      readonly name: string;
      readonly collectionKind: CollectionKind;
      readonly system: boolean;
    }
  | { readonly kind: 'bucket'; readonly database: string; readonly name: string }
  | { readonly kind: 'redis-database'; readonly database: number }
  | {
      readonly kind: 'namespace';
      readonly database: number;
      /** The prefix as text (`value.format` writes bytes that are not text), and its pattern. */
      readonly prefix: string;
      readonly prefixHex: string;
      readonly pattern: string;
    }
  | { readonly kind: 'empty-databases'; readonly count: number }
  | { readonly kind: 'pin'; readonly pin: Pin }
  | { readonly kind: 'page'; readonly page: string }
  | { readonly kind: 'heading'; readonly part: PartName };

/** The identifier of a node, unique in the tree island of a connection. */
export function nodeId(ref: NodeRef): string {
  switch (ref.kind) {
    case 'database':
      return `database:${ref.database}`;
    case 'collection':
      return `collection:${ref.database}.${ref.name}`;
    case 'bucket':
      return `bucket:${ref.database}.${ref.name}`;
    case 'redis-database':
      return `redis-database:${String(ref.database)}`;
    case 'namespace':
      return `namespace:${String(ref.database)}:${ref.prefixHex}`;
    case 'empty-databases':
      return 'empty-databases';
    case 'pin':
      return `pin:${JSON.stringify(ref.pin)}`;
    case 'page':
      return `page:${ref.page}`;
    case 'heading':
      return `heading:${ref.part}`;
  }
}

/** A control of the tree: a feature it starts with an intent, or something the window does itself. */
export type Control =
  | {
      readonly kind: 'start';
      readonly label: string;
      /** The control's identifier, written whole, as `data-feature` carries it. */
      readonly element: string;
      readonly feature: string;
      readonly target: Target;
      readonly args?: Json;
    }
  | {
      readonly kind: 'window';
      readonly label: string;
      readonly element?: string;
      readonly action: 'collapse-all' | 'open-filter' | 'clear-filter';
    };

/** A node of the tree: something of the connection, a pinned item, a page. */
export interface TreeNode {
  readonly kind: 'node';
  readonly id: string;
  /** The node it is under, absent at the top of a part. */
  readonly parent?: string;
  /** From 1, as `aria-level` says it. */
  readonly level: number;
  readonly ref: NodeRef;
  readonly name: string;
  /** The Codicon drawn for it. */
  readonly icon: string;
  /** What comes after the name: a count, a size, **GridFS**, where a pinned item is. */
  readonly after?: string;
  readonly hover?: string;
  readonly dimmed: boolean;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly selected: boolean;
  /** What a screen reader says: its name, its kind, its count, whether it is expanded. */
  readonly label: string;
  /** What a click on the name, and `Enter`, does; absent when it expands or collapses the node. */
  readonly click?: Control;
  /** The buttons shown on hover or focus. */
  readonly buttons: readonly Control[];
  readonly hasMenu: boolean;
}

/** The heading of a part of the tree island. */
export interface TreeHeading {
  readonly kind: 'heading';
  readonly id: string;
  readonly part: PartName;
  readonly text: string;
  readonly expanded: boolean;
  readonly buttons: readonly Control[];
  readonly hasMenu: boolean;
}

/** A line that only says something (**Loading…**, **No keys**, an error): not a node, no context menu. */
export interface TreeLine {
  readonly kind: 'line';
  readonly id: string;
  readonly parent?: string;
  readonly level: number;
  readonly tone: 'quiet' | 'error';
  readonly text: string;
  /** **Retry**, **Load more**, **Connect**: what `Enter` on the line does. */
  readonly button?: Control;
}

/** What the tree island shows, line by line. */
export type TreeItem = TreeNode | TreeHeading | TreeLine;

/** An entry of the context menu of a node, or a line between two groups of entries. */
export type MenuEntry = { readonly kind: 'item'; readonly control: Control } | { readonly kind: 'separator' };

/** The entries of a menu from its groups: a line between two groups, none around an empty one. */
export function menuOf(groups: readonly (readonly Control[])[]): readonly MenuEntry[] {
  return groups
    .filter((group) => group.length > 0)
    .flatMap((group, index): MenuEntry[] => [
      ...(index === 0 ? [] : [{ kind: 'separator' } as const]),
      ...group.map((control) => ({ kind: 'item', control }) as const),
    ]);
}

/** Whether a value is an object of JSON (not an array, not bytes). */
export function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Uint8Array);
}

const numberWrappers = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'];

/** A number of canonical Extended JSON (`{ "$numberLong": "8192" }`) or of plain JSON; `undefined` otherwise. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isObject(value)) {
    return undefined;
  }
  const wrapper = numberWrappers.find((name) => typeof value[name] === 'string');
  const number = wrapper === undefined ? Number.NaN : Number(value[wrapper]);
  return Number.isNaN(number) ? undefined : number;
}

/**
 * The message of a request that failed: a {@link FailedReply}, an `Error`, or a MongoDB reply with `ok: 0`;
 * `undefined` for a reply.
 */
export function failureOf(reply: unknown): string | undefined {
  if (reply instanceof Error) {
    return reply.message;
  }
  if (!isObject(reply)) {
    return undefined;
  }
  if (reply['kind'] === 'error' && typeof reply['message'] === 'string') {
    return reply['message'];
  }
  const message = reply['errmsg'];
  if (numberOf(reply['ok']) !== 0) {
    return undefined;
  }
  return typeof message === 'string' ? message : 'The server refused the command.';
}

/** Names in the order of the tree: by name as English sorts them, then by their code units. */
export function compareNames(one: string, other: string): number {
  return one.localeCompare(other, 'en') || (one < other ? -1 : one > other ? 1 : 0);
}

/** The fields of the arguments of a read. */
export function argsOf(args: Json): Readonly<Record<string, Json>> {
  return isObject(args) ? args : {};
}

/** A text field of the arguments, or the default. */
export function textArg(args: Json, name: string, otherwise = ''): string {
  const value = argsOf(args)[name];
  return typeof value === 'string' ? value : otherwise;
}

/** A whole number field of the arguments, or the default. */
export function wholeArg(args: Json, name: string, otherwise = 0): number {
  const value = argsOf(args)[name];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : otherwise;
}

/** The text fields of a list in the arguments. */
export function textsArg(args: Json, name: string): readonly string[] {
  const value = argsOf(args)[name];
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

/** The hexadecimal of bytes. */
export function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The current connection, when one is current and saved. */
export function currentConnection(state: AppState): ConnectionView | undefined {
  const current = state.nav.current;
  return current === undefined ? undefined : savedConnection(state.connections, current);
}

/** A control that starts a feature on a connection. `element` is written whole by the caller. */
export function startControl(
  label: string,
  element: string,
  feature: string,
  on: { readonly connection: ConnectionId; readonly args?: Json },
): Control {
  const target: Target = { kind: 'connection', connection: on.connection };
  return { kind: 'start', label, element, feature, target, ...(on.args === undefined ? {} : { args: on.args }) };
}

/** A control that opens what a tab shows, or makes its tab active (`tab.open`). */
export function openControl(label: string, element: string, shows: TabShows): Control {
  const connection = connectionOfShows(shows);
  const target: Target = connection === undefined ? { kind: 'app' } : { kind: 'connection', connection };
  return { kind: 'start', label, element, feature: 'tab.open', target, args: { shows: shows as unknown as Json } };
}

/**
 * The accessible name of a node: its name, its count when it has one, its kind, and whether it is expanded. The count
 * comes right after the name, as the line shows it, so that the words seen are the first words of the name heard.
 */
export function nodeLabel(parts: {
  readonly name: string;
  readonly kind: string;
  readonly count?: string;
  readonly expanded?: boolean;
}): string {
  const state = parts.expanded === undefined ? [] : [parts.expanded ? text.label.expanded : text.label.collapsed];
  return [parts.name, ...(parts.count === undefined ? [] : [parts.count]), parts.kind, ...state].join(', ');
}
