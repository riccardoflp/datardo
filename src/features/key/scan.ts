/**
 * Feature: key.scan
 *
 * Lists the keys of a database that match a pattern and a type, a page at a time, without ever blocking the server:
 * `SCAN <cursor> MATCH <pattern> TYPE <type> COUNT 500`, never `KEYS` (R9.3). The page calls it again with the cursor
 * each reply gives until the scan is complete or the run stops (500 keys found, or 200 calls), and **Scan more**
 * starts another run. Without a type filter, the type of each key found is read with `key.scan:types`.
 */
import type { ConnectionRequest, Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, Outcome, ReadRequest } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { everyKey } from './pattern';
import { text } from './text';
import type { KeyName, KeyType, TypeFilter } from './types';
import { fieldsOf, hexOf, isErrorReply, namesOfHex, nameOfText, numberOf, typeFilterOf, wordOf } from './types';

/** What `SCAN` asks the server to look at in one call (Datardo's choice). */
export const scanCount = 500;

/** A run stops once it has found this many keys (Datardo's choice). */
export const runFinds = 500;

/** A run stops after this many calls, about 100,000 keys scanned (Datardo's choice). */
export const runCalls = 200;

/** How long each call may take, in ms (R9.2). */
export const timeLimitMs = 10_000;

/** What one call is made with. */
export interface ScanArgs {
  readonly connection: ConnectionId;
  readonly database: number;
  /** The pattern as `key.pattern` gave it. */
  readonly pattern: string;
  readonly type: TypeFilter;
  /** The cursor the last reply gave; `0` starts a new scan. */
  readonly cursor: string;
  /** The text typed, when it was plain: a key of exactly that name is read with `TYPE <text>` on cursor 0. */
  readonly plain?: string;
}

/** The arguments of a call, from what the page sent. */
export function scanArgs(args: Json): ScanArgs {
  const fields = fieldsOf(args);
  const textField = (name: string, otherwise: string): string => {
    const value = fields[name];
    return typeof value === 'string' ? value : otherwise;
  };
  const database = fields['database'];
  const plain = fields['plain'];
  return {
    connection: connectionId(textField('connection', '')),
    database: typeof database === 'number' ? database : 0,
    pattern: textField('pattern', everyKey),
    type: typeFilterOf(fields['type']),
    cursor: textField('cursor', '0'),
    ...(typeof plain === 'string' ? { plain } : {}),
  };
}

/** `SCAN <cursor> [MATCH <pattern>] [TYPE <type>] COUNT 500`, as the commands of the scan write it. */
export function scanCommand(asked: Pick<ScanArgs, 'database' | 'pattern' | 'type' | 'cursor'>): readonly string[] {
  return [
    'SCAN',
    asked.cursor,
    ...(asked.pattern === everyKey ? [] : ['MATCH', asked.pattern]),
    ...(asked.type === 'all' ? [] : ['TYPE', asked.type]),
    'COUNT',
    String(scanCount),
  ];
}

/** One command of the scan, on the connection and in the database, with its time limit. */
export function scanCall(
  connection: ConnectionId,
  database: number,
  words: readonly (string | Uint8Array)[],
): ConnectionRequest {
  return { connection, request: { ...redisCommand(database, ...words), timeLimitMs } };
}

/** Whether the server accepts `TYPE` in `SCAN`: Redis 6.0 and later, which every server Datardo speaks to is. */
function filtersByType(context: Context, connection: ConnectionId): boolean {
  const server = context.state.connections.live[connection]?.server;
  if (server?.engine !== 'redis') {
    return true;
  }
  const [major = 0] = server.redisVersion.split('.').map(Number);
  return major >= 6;
}

/**
 * Feature: key.scan — one call: the `SCAN`, and on cursor 0 `DBSIZE` and, for a plain text, `TYPE <text>`. Refused
 * on a server that cannot filter by type (`/unsupported`).
 */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = scanArgs(args);
  if (asked.type !== 'all' && !filtersByType(context, asked.connection)) {
    return refuse('key.scan/unsupported', text.scan.noTypeFilter);
  }
  const first = asked.cursor === '0';
  return {
    kind: 'engine',
    requests: [
      scanCall(asked.connection, asked.database, scanCommand(asked)),
      ...(first ? [scanCall(asked.connection, asked.database, ['DBSIZE'])] : []),
      ...(first && asked.plain !== undefined
        ? [scanCall(asked.connection, asked.database, ['TYPE', nameOfText(asked.plain)])]
        : []),
    ],
  };
}

/** What one call gives: the next cursor, the names found, and on cursor 0 the total and the key named as typed. */
export interface ScanPage {
  readonly cursor: string;
  readonly keys: readonly KeyName[];
  /** What `DBSIZE` answered, on cursor 0. */
  readonly total?: number;
  /** The key with exactly the name typed, when it exists (and is of the type asked). */
  readonly exact?: { readonly name: KeyName; readonly type: KeyType };
}

function exactOf(reply: RedisReply | undefined, asked: ScanArgs): ScanPage['exact'] {
  const type = wordOf(reply);
  if (asked.plain === undefined || type === undefined || type === 'none') {
    return undefined;
  }
  return asked.type === 'all' || asked.type === type ? { name: nameOfText(asked.plain), type } : undefined;
}

/** Feature: key.scan — the cursor and the names of the `SCAN` reply, the `DBSIZE` and the key named as typed. */
export function parse(replies: readonly unknown[], args: Json = null): ScanPage {
  const asked = scanArgs(args);
  const [scan, dbsize, typed] = replies as readonly RedisReply[];
  if (!Array.isArray(scan)) {
    throw new Error(isErrorReply(scan) ? scan.message : 'SCAN did not give a cursor and a list of keys.');
  }
  const [cursor, keys] = scan as readonly RedisReply[];
  const names = Array.isArray(keys) ? keys.filter((each): each is Uint8Array => each instanceof Uint8Array) : [];
  const total = numberOf(dbsize);
  const exact = exactOf(typed, asked);
  return {
    cursor: wordOf(cursor) ?? (typeof cursor === 'number' ? String(cursor) : '0'),
    keys: names,
    ...(total === undefined ? {} : { total }),
    ...(exact === undefined ? {} : { exact }),
  };
}

/** What `key.scan:types` is started with: the names found, in hexadecimal. */
export function typesArgs(connection: ConnectionId, database: number, keys: readonly KeyName[]): Json {
  return { connection, database, keys: keys.map(hexOf) };
}

/** `key.scan:types`: one pipeline of `TYPE <key>` for each key a reply returned, when no type is asked. */
export function typesRequest(_context: Context, args: Json): ReadRequest {
  const fields = fieldsOf(args);
  const connection = connectionId(typeof fields['connection'] === 'string' ? fields['connection'] : '');
  const database = typeof fields['database'] === 'number' ? fields['database'] : 0;
  return {
    kind: 'engine',
    requests: namesOfHex(fields['keys']).map((name) => scanCall(connection, database, ['TYPE', name])),
  };
}

/** `key.scan:types`: the type of each key, in order; `none` for a key that is gone. */
export function parseTypes(replies: readonly unknown[]): readonly KeyType[] {
  return (replies as readonly RedisReply[]).map((reply) => wordOf(reply) ?? 'none');
}

/** A row of the scan: a key, its type when known, and whether it is gone. */
export interface ScanRow {
  readonly name: KeyName;
  readonly type?: KeyType;
  readonly gone?: boolean;
}

/** A scan of the keys tab: the rows found, where it is, and how it ended. */
export interface ScanState {
  readonly rows: readonly ScanRow[];
  readonly cursor: string;
  /** What `DBSIZE` answered when the scan started. */
  readonly total?: number;
  /** The calls of the whole scan, which say how much was scanned. */
  readonly calls: number;
  /** The calls and the keys found of the run in progress. */
  readonly run: { readonly calls: number; readonly found: number };
  /** `complete`: the cursor came back 0; `stopped`: the run found 500 keys or made 200 calls. */
  readonly ended?: 'complete' | 'stopped';
}

/** No call made. */
export const scanStart: ScanState = { rows: [], cursor: '0', calls: 0, run: { calls: 0, found: 0 } };

/** The table holds at most this many keys (Datardo's choice): **Scan more** is disabled there. */
export const mostKeys = 100_000;

/** The scan after one more page: names it had already are left out; the key typed comes first. */
export function afterPage(state: ScanState, page: ScanPage, types: readonly KeyType[] = []): ScanState {
  const seen = new Set(state.rows.map((row) => hexOf(row.name)));
  const fresh: ScanRow[] = [];
  const add = (row: ScanRow): void => {
    const id = hexOf(row.name);
    if (!seen.has(id)) {
      seen.add(id);
      fresh.push(row);
    }
  };
  if (page.exact !== undefined) {
    add({ name: page.exact.name, type: page.exact.type });
  }
  page.keys.forEach((name, index) => {
    const type = types[index];
    add(type === undefined ? { name } : type === 'none' ? { name, gone: true } : { name, type });
  });
  const rows = [...state.rows, ...fresh].slice(0, mostKeys);
  const run = { calls: state.run.calls + 1, found: state.run.found + fresh.length };
  const ended =
    page.cursor === '0'
      ? 'complete'
      : run.found >= runFinds || run.calls >= runCalls || rows.length >= mostKeys
        ? 'stopped'
        : undefined;
  return {
    rows,
    cursor: page.cursor,
    ...(page.total === undefined ? (state.total === undefined ? {} : { total: state.total }) : { total: page.total }),
    calls: state.calls + 1,
    run,
    ...(ended === undefined ? {} : { ended }),
  };
}

/** **Scan more**: another run from the cursor the last stopped at. */
export function scanMore(state: ScanState): ScanState {
  const { ended: _ended, ...rest } = state;
  return { ...rest, run: { calls: 0, found: 0 } };
}

/** The keys scanned, about: the calls made times 500, never more than `DBSIZE`. */
export function scannedAbout(state: ScanState): number {
  const scanned = state.calls * scanCount;
  return state.total === undefined ? scanned : Math.min(scanned, state.total);
}
