/**
 * Feature: palette.find-keys
 *
 * Looks for keys of the current Redis connection by a part of their name, with a scan that is stopped early so that it
 * never weighs on the server: `SCAN <cursor> MATCH *<text>* COUNT 1000`, never `KEYS`, until the cursor comes back
 * `0`, 20 keys were found or 5 calls were made. Each call is one read; the window makes the next one with the cursor
 * the last gave, and abandons the scan when the text changes.
 */
import type { Json } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { activeTabOf } from '../../shared/state/tabs';
import { readText } from './sources';

/** What each `SCAN` asks the server to look at (Datardo's choice). */
export const scanCount = 1000;

/** How many `SCAN` calls one text makes at most (Datardo's choice). */
export const mostCalls = 5;

/** How many keys are listed at most (Datardo's choice). */
export const mostKeys = 20;

/** How long after the last character typed the scan starts, in ms (Datardo's choice). */
export const scanDelayMs = 200;

/** How long each call may take, in ms (R9.2). */
export const timeLimitMs = 5000;

/** What the scan looks for: the pattern sent, and the other terms checked on the names that come back. */
export interface KeysWanted {
  readonly pattern: string;
  readonly others: readonly string[];
  /** The text looked for, as the messages quote it. */
  readonly typed: string;
}

/** A character that means something to `MATCH`, written with a `\` before it so that it means itself. */
function escaped(text: string): string {
  return text.replace(/[*?[\]\\]/gu, (character) => `\\${character}`);
}

/**
 * The pattern for the text typed, or `undefined` when no scan is made: at least 2 characters, or 1 after `:`. After
 * `:`, a text that holds `*`, `?` or `[` is the pattern as typed.
 */
export function wantedKeys(typed: string): KeysWanted | undefined {
  const { prefix, terms } = readText(typed);
  if (prefix !== undefined && prefix !== 'keys') {
    return undefined;
  }
  const looked = terms.join(' ');
  const [first, ...others] = terms;
  if (first === undefined || looked.length < (prefix === 'keys' ? 1 : 2)) {
    return undefined;
  }
  if (prefix === 'keys' && /[*?[]/u.test(looked)) {
    return { pattern: looked, others: [], typed: looked };
  }
  return { pattern: `*${escaped(first)}*`, others, typed: looked };
}

/** Where the scan runs: the current connection when it is a connected Redis connection, in the database of its tab. */
export interface KeysPlace {
  readonly connection: ConnectionId;
  readonly name: string;
  readonly database: number;
}

/**
 * The current connection when it is a connected Redis connection, and the database: the active tab's when it is a
 * keys tab or a key tab of that connection, otherwise `db0`.
 */
export function keysPlace(state: AppState): KeysPlace | undefined {
  const current = state.nav.current;
  const saved = current === undefined ? undefined : savedConnection(state.connections, current);
  if (saved?.engine !== 'redis' || connectionState(state.connections, saved.id) !== 'connected') {
    return undefined;
  }
  const active = activeTabOf(state.tabs)?.shows;
  const database =
    (active?.kind === 'keys' || active?.kind === 'key') && active.connection === saved.id ? active.database : 0;
  return { connection: saved.id, name: saved.name, database };
}

/** What one call is started with. */
export interface ScanArgs {
  readonly connection: string;
  readonly database: number;
  readonly pattern: string;
  /** The cursor the last reply gave; `0` for the first call. */
  readonly cursor: string;
}

function readArgs(args: Json): ScanArgs {
  const object = typeof args === 'object' && args !== null && !Array.isArray(args) ? args : {};
  const text = (name: string, otherwise: string): string => {
    const value = (object as Readonly<Record<string, Json>>)[name];
    return typeof value === 'string' ? value : otherwise;
  };
  const database = (object as Readonly<Record<string, Json>>)['database'];
  return {
    connection: text('connection', ''),
    database: typeof database === 'number' ? database : 0,
    pattern: text('pattern', '*'),
    cursor: text('cursor', '0'),
  };
}

/** `SCAN <cursor> MATCH <pattern> COUNT 1000`, in the database of the scan. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = readArgs(args);
  const command = redisCommand(
    asked.database,
    'SCAN',
    asked.cursor,
    'MATCH',
    asked.pattern,
    'COUNT',
    String(scanCount),
  );
  return {
    kind: 'engine',
    requests: [{ connection: connectionId(asked.connection), request: { ...command, timeLimitMs } }],
  };
}

/** What one call gives: the next cursor, and the names found, as bytes. */
export interface ScanPage {
  readonly cursor: string;
  readonly keys: readonly Uint8Array[];
}

const decoder = new TextDecoder();

/** The cursor and the names of a `SCAN` reply. */
export function parse(replies: readonly unknown[]): ScanPage {
  const [reply] = replies;
  if (!Array.isArray(reply)) {
    throw new Error('SCAN did not give a cursor and a list of keys.');
  }
  const [cursor, keys] = reply as readonly unknown[];
  const names = Array.isArray(keys) ? keys.filter((each): each is Uint8Array => each instanceof Uint8Array) : [];
  return { cursor: cursor instanceof Uint8Array ? decoder.decode(cursor) : String(cursor), keys: names };
}

/** A scan in progress for one text. */
export interface ScanProgress {
  readonly calls: number;
  readonly cursor: string;
  readonly keys: readonly Uint8Array[];
  /** `whole`: the cursor came back `0`; `stopped`: 20 keys or 5 calls; absent while the scan goes on. */
  readonly ended?: 'whole' | 'stopped';
}

/** No call made yet. */
export const scanStart: ScanProgress = { calls: 0, cursor: '0', keys: [] };

/** A name as text: UTF-8 when it is, otherwise each byte that is not printable as `\xNN`. */
export function keyText(name: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(name);
  } catch {
    // Not UTF-8: written byte by byte, as value.format writes bytes that are not text.
    return Array.from(name, (byte) =>
      byte >= 0x20 && byte < 0x7f && byte !== 0x5c
        ? String.fromCharCode(byte)
        : `\\x${byte.toString(16).padStart(2, '0')}`,
    ).join('');
  }
}

/** The scan after one more page: the names that hold every other term (with regard to case) are added. */
export function afterPage(progress: ScanProgress, page: ScanPage, wanted: KeysWanted): ScanProgress {
  const fitting = page.keys.filter((name) => wanted.others.every((term) => keyText(name).includes(term)));
  const keys = [...progress.keys, ...fitting].slice(0, mostKeys);
  const calls = progress.calls + 1;
  const base = { calls, cursor: page.cursor, keys };
  if (page.cursor === '0') {
    return { ...base, ended: 'whole' };
  }
  return keys.length >= mostKeys || calls >= mostCalls ? { ...base, ended: 'stopped' } : base;
}

/** A whole number with a comma every three digits: `5,000`. */
export function countText(count: number): string {
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** How many keys a stopped scan looked at, about: `5,000` after 5 calls. */
export function lookedAt(progress: ScanProgress): string {
  return countText(progress.calls * scanCount);
}
