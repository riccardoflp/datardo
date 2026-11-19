/**
 * Feature: server.read-slow-log
 *
 * The commands the server logged as slow (`SLOWLOG GET 1000`, the newest 1,000 entries, and `SLOWLOG LEN`), and the
 * threshold above which it logs (`CONFIG GET slowlog-log-slower-than`). The arguments that hold a password are
 * written `***` here, in the main process, before an entry goes anywhere: a server before 7.0 logs `CONFIG SET
 * requirepass` and `MIGRATE … AUTH` with their password.
 */
import type { Json, RedisRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Context, ReadRequest } from '../../shared/feature';
import { connectionId } from '../../shared/ids';
import { stepText } from '../runner/step-text';
import { isSecretParameter } from './read-config';
import { partOf } from './unavailable';
import { numberOfReply, pairsOf, serverCommand, textArg, textOf, type PartRead } from './types';

/** How many entries are read, the newest first (Datardo's choice). */
export const slowLogEntriesRead = 1000;

/** What is read: the entries and their count; also the threshold; or the count alone (`server.slow-log-reset`). */
export type SlowLogPart = 'entries' | 'entries-and-threshold' | 'length';

/** One command the server logged as slow. */
export interface SlowLogEntry {
  /** A number that grows and is not used again until the server restarts. */
  readonly id: number;
  /** When the command ran, a Unix time in seconds. */
  readonly time: number;
  /** How long it took, in microseconds. */
  readonly microseconds: number;
  /** Its arguments, each secret written `***`; an argument the server cut keeps its `... (2048 more bytes)`. */
  readonly arguments: readonly Uint8Array[];
  /** Its arguments on one line, as the runner writes a Redis step. */
  readonly command: string;
  /** The address of its client, and its name (since Redis 4.0). */
  readonly client?: string;
  readonly clientName?: string;
}

/** The entries read, and how many the server has. */
export interface SlowLogEntries {
  readonly entries: readonly SlowLogEntry[];
  /** `SLOWLOG LEN`; `undefined` when it could not be read. */
  readonly length?: number;
}

/** `slowlog-log-slower-than`, in microseconds: a positive limit, 0 for every command, a negative number for off. */
export interface SlowLogThreshold {
  readonly microseconds: number;
}

/** What a read of the slow log gives, by the part asked for. */
export interface SlowLogRead {
  readonly entries?: PartRead<SlowLogEntries>;
  readonly threshold?: PartRead<SlowLogThreshold | undefined>;
  readonly length?: PartRead<number>;
}

function partOfArgs(args: Json): SlowLogPart {
  const part = textArg(args, 'part');
  return part === 'length' || part === 'entries-and-threshold' ? part : 'entries';
}

/** The commands of a part, in the order {@link parse} reads their replies. */
export function slowLogRequests(part: SlowLogPart): readonly RedisRequest[] {
  const length = serverCommand('SLOWLOG', 'LEN');
  if (part === 'length') {
    return [length];
  }
  const entries = [serverCommand('SLOWLOG', 'GET', String(slowLogEntriesRead)), length];
  return part === 'entries' ? entries : [...entries, serverCommand('CONFIG', 'GET', 'slowlog-log-slower-than')];
}

/** Feature: server.read-slow-log — `{ connection, part }`; the threshold only when the section is chosen and with **Refresh**. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(textArg(args, 'connection'));
  return { kind: 'engine', requests: slowLogRequests(partOfArgs(args)).map((each) => ({ connection, request: each })) };
}

function upper(words: readonly Uint8Array[]): readonly string[] {
  return words.map((word) => textOf(word).toUpperCase());
}

function afterWord(words: readonly string[], from: number, rule: (word: string, index: number) => number[]): number[] {
  return words.flatMap((word, index) => (index >= from ? rule(word, index) : []));
}

/**
 * The positions of the arguments that hold a password, by the rules of `console.secret-arguments`: `AUTH`, `HELLO …
 * AUTH`, `MIGRATE … AUTH` and `AUTH2`, `CONFIG SET` of a secret parameter, `ACL SETUSER` rules of a password.
 */
export function secretPositions(command: readonly Uint8Array[]): ReadonlySet<number> {
  const words = upper(command);
  const [name = '', second = ''] = words;
  const keys = name === 'MIGRATE' && words.includes('KEYS') ? words.indexOf('KEYS') : words.length;
  const positions: number[] =
    name === 'AUTH'
      ? [words.length > 2 ? 2 : 1]
      : name === 'HELLO'
        ? afterWord(words, 2, (word, index) => (word === 'AUTH' ? [index + 2] : []))
        : name === 'MIGRATE'
          ? afterWord(words.slice(0, keys), 6, (word, index) =>
              word === 'AUTH' ? [index + 1] : word === 'AUTH2' ? [index + 2] : [],
            )
          : name === 'CONFIG' && second === 'SET'
            ? afterWord(words, 2, (word, index) => (index % 2 === 0 && isSecretParameter(word) ? [index + 1] : []))
            : name === 'ACL' && second === 'SETUSER'
              ? afterWord(words, 3, (word, index) => (/^[><#!]/u.test(word) ? [index] : []))
              : [];
  return new Set(positions.filter((position) => position > 0 && position < words.length));
}

const maskedBytes = new TextEncoder().encode('***');

/** The arguments with each secret written `***`. */
export function maskedArguments(command: readonly Uint8Array[]): readonly Uint8Array[] {
  const secrets = secretPositions(command);
  return command.map((argument, index) => (secrets.has(index) ? maskedBytes : argument));
}

/** Arguments on one line, as the runner writes a Redis step: `LRANGE queue 0 -1`, `SET "a b" "\x00"`. */
export function commandLine(command: readonly Uint8Array[]): string {
  return stepText({
    kind: 'engine',
    connection: connectionId(''),
    request: redisCommand(0, ...command),
    writes: false,
  });
}

/** One entry of `SLOWLOG GET`, its secrets masked; `undefined` for a reply that is not an entry. */
export function entryOf(reply: unknown): SlowLogEntry | undefined {
  if (!Array.isArray(reply)) {
    return undefined;
  }
  const [id, time, microseconds, words, client, clientName] = reply as readonly unknown[];
  const argumentsOfEntry = maskedArguments(
    Array.isArray(words) ? words.filter((word): word is Uint8Array => word instanceof Uint8Array) : [],
  );
  return {
    id: numberOfReply(id) ?? 0,
    time: numberOfReply(time) ?? 0,
    microseconds: numberOfReply(microseconds) ?? 0,
    arguments: argumentsOfEntry,
    command: commandLine(argumentsOfEntry),
    ...(client === undefined ? {} : { client: textOf(client) }),
    ...(clientName === undefined ? {} : { clientName: textOf(clientName) }),
  };
}

function entriesOf(reply: unknown, length: unknown): SlowLogEntries {
  const entries = Array.isArray(reply) ? reply.flatMap((each: unknown) => entryOf(each) ?? []) : [];
  const count = numberOfReply(length);
  return { entries, ...(count === undefined ? {} : { length: count }) };
}

function thresholdOf(reply: unknown): SlowLogThreshold | undefined {
  const value = pairsOf(reply).find(([name]) => name === 'slowlog-log-slower-than')?.[1];
  const microseconds = numberOfReply(value);
  return microseconds === undefined ? undefined : { microseconds };
}

/** Feature: server.read-slow-log — the entries, the threshold or the count, each with its own sentence when refused. */
export function parse(replies: readonly unknown[], args: Json = null): SlowLogRead {
  const part = partOfArgs(args);
  if (part === 'length') {
    return { length: partOf('SLOWLOG LEN', replies[0], (reply) => numberOfReply(reply) ?? 0) };
  }
  const [entries, length, threshold] = replies;
  return {
    entries: partOf('SLOWLOG GET', entries, (reply) => entriesOf(reply, length)),
    ...(part === 'entries-and-threshold' ? { threshold: partOf('CONFIG GET', threshold, thresholdOf) } : {}),
  };
}
