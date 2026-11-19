/**
 * Feature: server.largest-keys
 *
 * Examines the keys of one database, a bounded number at a time, and lists the ones that take the most memory: `SCAN
 * <cursor> COUNT 500` until the cursor is 0, after each reply `MEMORY USAGE <key> SAMPLES 5` for each key it returned,
 * and at the end `TYPE <key>` for each key of the result. `KEYS` is never sent. A run stops at the first of: every key
 * examined, 100,000 keys examined, 30 seconds (checked after each reply of `SCAN`); **Examine 100,000 more** goes on
 * from the cursor with the ranking so far. Each call is one read; {@link nextCall} says which follows. It changes
 * nothing, so it is allowed on a read-only connection.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import type { ConnectionView } from '../../shared/connection';
import { groupThousands } from '../../shared/text-units';
import { emptyRanking, largestKeys, type MeasuredKey, type Ranking, type RankedKey } from './rank-keys';
import type { KeyspaceDatabase } from './read-info';
import { commandLine } from './read-slow-log';
import { text } from './text';
import { partOf, unavailableSentence } from './unavailable';
import {
  argsOf,
  bytesOfHex,
  bytesTooltip,
  connectionTarget,
  failureOf,
  hexOf,
  readPart,
  serverCommand,
  sizeText,
  startControl,
  textArg,
  textOf,
  wholeArg,
  type PartRead,
  type ServerControl,
  type Unavailable,
} from './types';

/** What each `SCAN` asks the server to look at (Datardo's choice). */
export const scanCount = 500;

/** The elements `MEMORY USAGE` measures of a value that has many (Datardo's choice; the server's own default). */
export const memorySamples = 5;

/** How many keys a run examines before it stops, until **Examine 100,000 more** (Datardo's choice). */
export const keysPerRun = 100_000;

/** How long a run goes on, in ms, checked after each reply of `SCAN` (Datardo's choice). */
export const runTimeLimitMs = 30_000;

/** One call of a search: a `SCAN`, the `MEMORY USAGE` of the keys it returned, or the `TYPE` of the keys found. */
export type LargestKeysCall =
  | { readonly step: 'scan'; readonly cursor: string }
  | { readonly step: 'measure'; readonly keys: readonly string[] }
  | { readonly step: 'type'; readonly keys: readonly string[] };

function keysArg(args: Json): readonly Uint8Array[] {
  const keys = argsOf(args)['keys'];
  return Array.isArray(keys) ? keys.flatMap((each) => (typeof each === 'string' ? [bytesOfHex(each)] : [])) : [];
}

/**
 * Feature: server.largest-keys — one call, `{ connection, database, step, cursor }` for a `SCAN`, or `{ connection,
 * database, step, keys }` with the names in hexadecimal for `MEMORY USAGE` and `TYPE`, all in one round trip.
 */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection'));
  const database = wholeArg(args, 'database');
  const step = textArg(args, 'step');
  const keys = keysArg(args);
  const commands =
    step === 'measure'
      ? keys.map((key) => serverCommand('MEMORY', 'USAGE', key, 'SAMPLES', String(memorySamples)))
      : step === 'type'
        ? keys.map((key) => serverCommand('TYPE', key))
        : [serverCommand('SCAN', textArg(args, 'cursor', '0'), 'COUNT', String(scanCount))];
  return { kind: 'engine', requests: commands.map((command) => ({ connection, request: { ...command, database } })) };
}

/** What one `SCAN` gave: the next cursor, and the names returned, as bytes. */
export interface ScanPage {
  readonly cursor: string;
  readonly keys: readonly Uint8Array[];
}

/** What one call gave, by its step. */
export type LargestKeysReply =
  | { readonly step: 'scan'; readonly page: PartRead<ScanPage> }
  | { readonly step: 'measure'; readonly measured: PartRead<readonly MeasuredKey[]> }
  | { readonly step: 'type'; readonly types: readonly (readonly [string, string])[] };

function scanPage(reply: unknown): ScanPage {
  const [cursor, keys] = Array.isArray(reply) ? (reply as readonly unknown[]) : [];
  const names = Array.isArray(keys) ? keys.filter((each): each is Uint8Array => each instanceof Uint8Array) : [];
  return { cursor: textOf(cursor) || '0', keys: names };
}

/** Whether an error of `MEMORY USAGE` is of the command, not of one key: the search stops there. */
function isCommandRefused(error: string): boolean {
  const kind = unavailableSentence('MEMORY USAGE', error).kind;
  return kind === 'not-there' || (kind === 'not-allowed' && /command/iu.test(error));
}

function measuredOf(replies: readonly unknown[], keys: readonly Uint8Array[]): PartRead<readonly MeasuredKey[]> {
  const refused = replies.map(failureOf).find((error) => error !== undefined && isCommandRefused(error));
  if (refused !== undefined) {
    return { kind: 'unavailable', unavailable: unavailableSentence('MEMORY USAGE', refused) };
  }
  return readPart(
    keys.map((name, index): MeasuredKey => {
      const reply = replies[index];
      const error = failureOf(reply);
      return { name, size: error !== undefined ? { error } : typeof reply === 'number' ? reply : null };
    }),
  );
}

/** Feature: server.largest-keys — what one call gave. */
export function parse(replies: readonly unknown[], args: Json = null): LargestKeysReply {
  const step = textArg(args, 'step');
  const keys = keysArg(args);
  if (step === 'measure') {
    return { step, measured: measuredOf(replies, keys) };
  }
  if (step === 'type') {
    const types = keys.flatMap((key, index) => {
      const reply = replies[index];
      return failureOf(reply) === undefined && reply !== undefined ? [[hexOf(key), textOf(reply)] as const] : [];
    });
    return { step, types };
  }
  return { step: 'scan', page: partOf('SCAN', replies[0], scanPage) };
}

/** How a run ended: every key examined, a bound reached, cancelled, or a command the server refused. */
export type SearchEnd = 'all' | 'bound' | 'cancelled' | 'unavailable';

/** A search of one database. Never kept with the tab. */
export interface LargestKeysSearch {
  readonly database: number;
  /** The `keys` of the database in `INFO` when the search started: the number after *about*. */
  readonly aboutKeys?: number;
  readonly cursor: string;
  readonly ranking: Ranking;
  /** The keys `SCAN` returned, in every run, and in this run. */
  readonly returned: number;
  readonly returnedThisRun: number;
  readonly runStartedAt: number;
  /** How long this run has gone on, in ms, at its last reply. */
  readonly runMs: number;
  /** The keys of the last `SCAN`, still to be measured. */
  readonly pending: readonly Uint8Array[];
  /** How the run ends once `pending` is measured; set by the reply of `SCAN` that reached it. */
  readonly ending?: 'all' | 'bound';
  readonly ended?: SearchEnd;
  readonly unavailable?: Unavailable;
  /** The type of each key found, by the hexadecimal of its name; absent until `TYPE` answered. */
  readonly types?: Readonly<Record<string, string>>;
}

/** A search that starts on a database, with the number of its keys `INFO` gave. */
export function startSearch(database: number, aboutKeys: number | undefined, now: number): LargestKeysSearch {
  return {
    database,
    ...(aboutKeys === undefined ? {} : { aboutKeys }),
    cursor: '0',
    ranking: emptyRanking,
    returned: 0,
    returnedThisRun: 0,
    runStartedAt: now,
    runMs: 0,
    pending: [],
  };
}

/** The search after a reply of `SCAN`: the keys to measure, and whether the run ends once they are. */
export function afterScan(search: LargestKeysSearch, page: PartRead<ScanPage>, now: number): LargestKeysSearch {
  const runMs = now - search.runStartedAt;
  if (page.kind === 'unavailable') {
    return { ...search, runMs, ended: 'unavailable', unavailable: page.unavailable };
  }
  const returnedThisRun = search.returnedThisRun + page.value.keys.length;
  const ending: LargestKeysSearch['ending'] =
    page.value.cursor === '0' ? 'all' : returnedThisRun >= keysPerRun || runMs >= runTimeLimitMs ? 'bound' : undefined;
  const next: LargestKeysSearch = {
    ...search,
    cursor: page.value.cursor,
    returned: search.returned + page.value.keys.length,
    returnedThisRun,
    runMs,
    pending: page.value.keys,
    ...(ending === undefined ? {} : { ending }),
  };
  return page.value.keys.length === 0 && ending !== undefined ? { ...next, ended: ending } : next;
}

/** The search after the `MEMORY USAGE` of the keys of the last `SCAN`: the ranking grows. */
export function afterMeasure(
  search: LargestKeysSearch,
  measured: PartRead<readonly MeasuredKey[]>,
  now: number,
): LargestKeysSearch {
  const runMs = now - search.runStartedAt;
  if (measured.kind === 'unavailable') {
    return { ...search, runMs, pending: [], ended: 'unavailable', unavailable: measured.unavailable };
  }
  const ranking = largestKeys(search.ranking, measured.value);
  const base = { ...search, ranking, runMs, pending: [] };
  return search.ending === undefined ? base : { ...base, ended: search.ending };
}

/** The search once `TYPE` answered for the keys found. */
export function afterTypes(
  search: LargestKeysSearch,
  types: readonly (readonly [string, string])[],
): LargestKeysSearch {
  return { ...search, types: Object.fromEntries(types) };
}

/** The search once **Cancel** was pressed: it stops after the reply in progress, with the ranking so far. */
export function cancelSearch(search: LargestKeysSearch): LargestKeysSearch {
  return search.ended === undefined ? { ...search, ended: 'cancelled', pending: [] } : search;
}

/** **Examine 100,000 more**: a new run from the cursor, with the same bounds and the ranking so far. */
export function examineMore(search: LargestKeysSearch, now: number): LargestKeysSearch {
  if (search.ended !== 'bound' && search.ended !== 'cancelled') {
    return search;
  }
  const { ended: _ended, ending: _ending, types: _types, ...rest } = search;
  return { ...rest, returnedThisRun: 0, runStartedAt: now, runMs: 0 };
}

/** The next call of a search, or `undefined` when it has nothing more to send. */
export function nextCall(search: LargestKeysSearch): LargestKeysCall | undefined {
  if (search.pending.length > 0 && search.ended === undefined) {
    return { step: 'measure', keys: search.pending.map(hexOf) };
  }
  if (search.ended === undefined) {
    return { step: 'scan', cursor: search.cursor };
  }
  const typed = search.ended === 'all' || search.ended === 'bound';
  return typed && search.types === undefined && search.ranking.keys.length > 0
    ? { step: 'type', keys: search.ranking.keys.map((key) => hexOf(key.name)) }
    : undefined;
}

/** The arguments of a call, for `request`. */
export function callArgs(call: LargestKeysCall, connection: string, database: number): Json {
  return { connection, database, ...call };
}

/** The line over the table: work in progress, how far the search went, or the sentence of a refused command. */
export function searchLine(search: LargestKeysSearch): string {
  const database = `db${String(search.database)}`;
  const about = search.aboutKeys === undefined ? text.missing : groupThousands(search.aboutKeys);
  const seconds = (search.runMs / 1000).toFixed(1);
  const failed = search.ranking.failed > 0 ? ` ${text.largestKeys.failed(search.ranking.failed)}` : '';
  if (search.ended === undefined) {
    return text.largestKeys.progress(database, search.returned, about);
  }
  switch (search.ended) {
    case 'all':
      return search.returned === 0
        ? text.largestKeys.noKeys(database)
        : `${text.largestKeys.all(search.returned, database, seconds)}${failed}`;
    case 'bound':
      return `${text.largestKeys.bound(search.returned, about, database, seconds)}${failed}`;
    case 'cancelled':
      return `${text.largestKeys.stopped(search.returned, about, database)}${failed}`;
    case 'unavailable':
      return search.unavailable?.sentence ?? '';
  }
}

/** A key's name as the table writes it: as text when it is UTF-8, as the console writes a string otherwise. */
export function keyName(name: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(name);
  } catch {
    // A name that is not valid UTF-8 is not an error: it is written with its bytes escaped.
    return commandLine([name]);
  }
}

/** The database the **Database** menu starts on: the one with the most keys. */
export function databaseWithMostKeys(databases: readonly KeyspaceDatabase[]): number | undefined {
  return databases.reduce<KeyspaceDatabase | undefined>(
    (most, each) => (most === undefined || (each.keys ?? 0) > (most.keys ?? 0) ? each : most),
    undefined,
  )?.database;
}

/** What the part of the largest keys is drawn from. */
export interface LargestKeysState {
  readonly connection: ConnectionView;
  /** The databases of `# Keyspace` of `INFO`, for the **Database** menu. */
  readonly databases: readonly KeyspaceDatabase[];
  /** The database chosen in the menu; the one with the most keys to start with. */
  readonly chosen?: number;
  readonly search?: LargestKeysSearch;
  /** The key selected, by the hexadecimal of its name. */
  readonly selected?: string;
}

/** A row of the table of the largest keys. */
export interface LargestKeyRow {
  readonly rank: number;
  readonly key: string;
  readonly type: string;
  readonly memory: string;
  readonly memoryTooltip: string;
  readonly selected: boolean;
  /** A click shows the key in the inspector island (`key.inspect`); a double click opens its key tab (`key.open`). */
  readonly click: ServerControl;
  readonly open: ServerControl;
  /** **Open key**, **Copy name**, **Delete key…**. */
  readonly menu: readonly ServerControl[];
}

/** What the part of the largest keys shows. */
export interface LargestKeysView {
  readonly title: string;
  readonly database: {
    readonly label: string;
    readonly value?: number;
    readonly choices: readonly { readonly database: number; readonly label: string }[];
  };
  readonly find: ServerControl;
  /** What the part shows until **Find largest keys** is pressed. */
  readonly before?: string;
  readonly line?: string;
  readonly more?: ServerControl;
  readonly table?: {
    readonly element: 'server.largest-keys@table';
    readonly menuElement: 'server.largest-keys@row-menu';
    readonly columns: typeof text.largestKeys.columns;
    readonly rows: readonly LargestKeyRow[];
    readonly note: string;
  };
}

function keyRow(state: LargestKeysState, search: LargestKeysSearch, key: RankedKey, index: number): LargestKeyRow {
  const hex = hexOf(key.name);
  const name = keyName(key.name);
  const target = { kind: 'key', connection: state.connection.id, database: search.database, key: key.name } as const;
  return {
    rank: index + 1,
    key: name,
    type: search.types?.[hex] ?? text.missing,
    memory: sizeText(key.bytes),
    memoryTooltip: bytesTooltip(key.bytes) ?? '',
    selected: hex === state.selected,
    click: startControl(name, 'key.inspect@table', 'key.inspect', { target }),
    open: startControl(text.largestKeys.openKey, 'key.open@table', 'key.open', { target }),
    menu: [
      startControl(text.largestKeys.openKey, 'key.open@row-menu', 'key.open', { target }),
      { kind: 'copy', label: text.largestKeys.copyName, text: name },
      startControl(text.largestKeys.deleteKey, 'key.delete@row-menu', 'key.delete', { target }),
    ],
  };
}

/** What the part of the largest keys shows, in the Memory section. */
export function largestKeysView(state: LargestKeysState): LargestKeysView {
  const chosen = state.chosen ?? databaseWithMostKeys(state.databases);
  const search = state.search;
  const args = { connection: state.connection.id, database: chosen ?? 0 };
  const target = connectionTarget(state.connection.id);
  const resumable = search?.ended === 'bound' || search?.ended === 'cancelled';
  return {
    title: text.memory.largestKeys,
    database: {
      label: text.largestKeys.database,
      ...(chosen === undefined ? {} : { value: chosen }),
      choices: state.databases.map((each) => ({
        database: each.database,
        label: text.largestKeys.databaseChoice(each.name, each.keys ?? 0),
      })),
    },
    find: startControl(text.largestKeys.find, 'server.largest-keys@toolbar', 'server.largest-keys', {
      target,
      args,
      busy: search !== undefined && search.ended === undefined,
    }),
    ...(search === undefined ? { before: text.largestKeys.before } : { line: searchLine(search) }),
    ...(resumable
      ? {
          more: startControl(text.largestKeys.more, 'server.largest-keys@toolbar', 'server.largest-keys', {
            target,
            args: { ...args, database: search.database, more: true },
          }),
        }
      : {}),
    ...(search === undefined || search.ranking.keys.length === 0
      ? {}
      : {
          table: {
            element: 'server.largest-keys@table',
            menuElement: 'server.largest-keys@row-menu',
            columns: text.largestKeys.columns,
            rows: search.ranking.keys.map((key, index) => keyRow(state, search, key, index)),
            note: text.largestKeys.estimate,
          },
        }),
  };
}
