/**
 * Feature: key.details
 *
 * Reads the expiry and the size of the keys the table shows, and of no other, so that a table of a hundred thousand
 * keys costs the server only what the user looks at: one pipeline of `PTTL <key>` and `MEMORY USAGE <key>` for each.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { sizeText } from '../connection/overview';
import { scanCall } from './scan';
import { text } from './text';
import type { KeyName } from './types';
import { fieldsOf, hexOf, isErrorReply, namesOfHex, numberOf } from './types';

/** How long after the table stops scrolling the rows on screen are read, in ms (Datardo's choice). */
export const settleMs = 150;

/** Whether `MEMORY USAGE` is sent: not again in a tab whose server refused it. */
export type SizesAsked = 'read' | 'skip';

/** What the table reads: the names on screen not read yet. */
export function detailsArgs(
  connection: string,
  database: number,
  keys: readonly KeyName[],
  sizes: SizesAsked = 'read',
): Json {
  return { connection, database, keys: keys.map(hexOf), sizes };
}

function askedOf(args: Json): { connection: string; database: number; keys: readonly KeyName[]; sizes: SizesAsked } {
  const fields = fieldsOf(args);
  return {
    connection: typeof fields['connection'] === 'string' ? fields['connection'] : '',
    database: typeof fields['database'] === 'number' ? fields['database'] : 0,
    keys: namesOfHex(fields['keys']),
    sizes: fields['sizes'] === 'skip' ? 'skip' : 'read',
  };
}

/** Feature: key.details — one pipeline: `PTTL <key>` and `MEMORY USAGE <key>` (without `SAMPLES`) for each key. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = askedOf(args);
  const connection = connectionId(asked.connection);
  return {
    kind: 'engine',
    requests: asked.keys.flatMap((name) => [
      scanCall(connection, asked.database, ['PTTL', name]),
      ...(asked.sizes === 'read' ? [scanCall(connection, asked.database, ['MEMORY', 'USAGE', name])] : []),
    ]),
  };
}

/** What was read of one key. */
export interface KeyDetails {
  readonly name: KeyName;
  /** `PTTL` answered `-2`, or the size was nil: the row is marked **gone**. */
  readonly gone: boolean;
  /** The time left in ms; `null` for a persistent key (`PTTL` `-1`). */
  readonly timeLeft?: number | null;
  /** The bytes `MEMORY USAGE` answered. */
  readonly size?: number;
}

/** What one read gave: each key's details, and whether the server reports sizes. */
export interface DetailsRead {
  readonly keys: readonly KeyDetails[];
  /** `refused`: the server refused `MEMORY USAGE`, which is not sent again in this tab. */
  readonly sizes: 'read' | 'refused' | 'skipped';
}

function keyDetails(
  name: KeyName,
  pttl: RedisReply | undefined,
  size: RedisReply | undefined,
  sizes: SizesAsked,
): KeyDetails {
  const left = numberOf(pttl);
  const bytes = numberOf(size);
  const gone = left === -2 || (sizes === 'read' && size === null);
  return {
    name,
    gone,
    ...(gone || left === undefined ? {} : { timeLeft: left === -1 ? null : left }),
    ...(gone || bytes === undefined ? {} : { size: bytes }),
  };
}

/** Feature: key.details — the expiry and the size of each key, in the order asked. */
export function parse(replies: readonly unknown[], args: Json = null): DetailsRead {
  const asked = askedOf(args);
  const each = asked.sizes === 'read' ? 2 : 1;
  const all = replies as readonly RedisReply[];
  const keys = asked.keys.map((name, index) =>
    keyDetails(name, all[index * each], asked.sizes === 'read' ? all[index * each + 1] : undefined, asked.sizes),
  );
  const refused = asked.sizes === 'read' && asked.keys.some((_, index) => isErrorReply(all[index * each + 1]));
  return { keys, sizes: asked.sizes === 'skip' ? 'skipped' : refused ? 'refused' : 'read' };
}

/** The date of expiry: the time of the read plus the time left; `undefined` for a persistent key. */
export function expiresAtOf(timeLeft: number | null, readAt: number): number | undefined {
  return timeLeft === null ? undefined : readAt + timeLeft;
}

/** The size as the table writes it: `512 B`, `1.2 KB`, `3.4 MB`, or `—` where the server does not report it. */
export function sizeCellText(size: number | undefined): string {
  return size === undefined ? text.inspect.refused : sizeText(size);
}

/** The tooltip of the **Size** column on a server that does not report sizes. */
export const noSizeTooltip = text.details.noSize;

/** The names of the rows on screen that have not been read: what the table reads once it settles. */
export function unreadOnScreen(onScreen: readonly KeyName[], read: ReadonlySet<string>): readonly KeyName[] {
  return onScreen.filter((name) => !read.has(hexOf(name)));
}
