/**
 * Feature: tree.scan-namespaces
 *
 * Reads a bounded number of key names of one database, from which the tree makes its namespaces: `SCAN <cursor> COUNT
 * 1000`, in the database of the node, from the cursor `0` or from where the last scan stopped, call after call until the
 * server returns the cursor `0` or 10,000 more keys have been returned. `KEYS` is never sent, and neither `MATCH` nor
 * `TYPE` is used. Each call is one read; {@link afterPage} says whether another follows. The names are kept as bytes,
 * in memory, for the tree only.
 */
import type { Json, RedisRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { failureOf, hexOf, textArg, wholeArg, type KeyScan } from './types';

/** What each `SCAN` asks the server to look at (Datardo's choice). */
export const scanCount = 1000;

/** How many keys a run of calls returns before it stops, until **Load more** (Datardo's choice). */
export const keysOfRun = 10_000;

/** How long each call may take, in ms (R9.2; Datardo's choice). */
export const scanTimeLimitMs = 5000;

/** `SCAN <cursor> COUNT 1000` in a database. */
export function scanRequest(database: number, cursor: string): RedisRequest {
  return { ...redisCommand(database, 'SCAN', cursor, 'COUNT', String(scanCount)), timeLimitMs: scanTimeLimitMs };
}

/** Feature: tree.scan-namespaces — one call, `{ connection, database, cursor }`, from the cursor `0` by default. */
export function request(_context: Context, args: Json): ReadRequest {
  return {
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textArg(args, 'connection')),
        request: scanRequest(wholeArg(args, 'database'), textArg(args, 'cursor', '0')),
      },
    ],
  };
}

/** What one call gives: the next cursor, and the names returned, as bytes. */
export interface ScanPage {
  readonly cursor: string;
  readonly keys: readonly Uint8Array[];
}

const decoder = new TextDecoder();

/** Feature: tree.scan-namespaces — the cursor and the names of a `SCAN` reply. */
export function parse(replies: readonly unknown[]): ScanPage {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    throw new Error(failure);
  }
  if (!Array.isArray(reply)) {
    throw new Error('SCAN did not give a cursor and a list of keys.');
  }
  const [cursor, keys] = reply as readonly unknown[];
  const names = Array.isArray(keys) ? keys.filter((each): each is Uint8Array => each instanceof Uint8Array) : [];
  return { cursor: cursor instanceof Uint8Array ? decoder.decode(cursor) : String(cursor), keys: names };
}

/** A scan with nothing seen: what expanding a database, and refreshing it, start from. */
export const freshScan: KeyScan = { keys: [], seen: new Set(), cursor: '0', returned: 0 };

/** The scan after one more call: the names not seen yet are added, and it says whether the run goes on. */
export function afterPage(scan: KeyScan, page: ScanPage): KeyScan {
  const seen = new Set(scan.seen);
  const added: Uint8Array[] = [];
  for (const key of page.keys) {
    const hex = hexOf(key);
    if (!seen.has(hex)) {
      seen.add(hex);
      added.push(key);
    }
  }
  const returned = scan.returned + page.keys.length;
  const base = { keys: [...scan.keys, ...added], seen, cursor: page.cursor, returned };
  if (page.cursor === '0') {
    return { ...base, ended: 'whole' };
  }
  return returned >= keysOfRun ? { ...base, ended: 'paused' } : base;
}

/** The scan once its run was cancelled: the names seen are kept, and **Load more** goes on from the cursor. */
export function cancelled(scan: KeyScan): KeyScan {
  return scan.ended === undefined ? { ...scan, ended: 'paused' } : scan;
}

/** The scan **Load more** continues: from the cursor kept, for 10,000 more keys, with the names already seen. */
export function loadMore(scan: KeyScan): KeyScan {
  const { ended: _ended, ...rest } = scan;
  return scan.ended === 'whole' ? scan : { ...rest, returned: 0 };
}

/** The arguments of the next call of a scan, or `undefined` when the run has ended. */
export function nextCall(scan: KeyScan, connection: string, database: number): Json | undefined {
  return scan.ended === undefined ? { connection, database, cursor: scan.cursor } : undefined;
}
