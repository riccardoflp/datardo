/**
 * What the cards of the console area share: a reply with every RESP type kept apart, the session of the console's own
 * connection, the flags and the documentation of a command, and the console's state as the plans and the views read
 * it.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';

/** The arguments of a command, the name first, each as the bytes the server receives. */
export type CommandArguments = readonly Uint8Array[];

/** The protocol the console's connection reads replies in. */
export type Protocol = 2 | 3;

/**
 * A reply of the server with every RESP type kept apart (`console.reply`): a bulk string as bytes, an integer as a
 * 64-bit integer, a simple string apart from a bulk one, a set apart from an array.
 */
export type Reply =
  | { readonly kind: 'null' }
  | { readonly kind: 'integer'; readonly value: bigint }
  | { readonly kind: 'simple'; readonly text: string }
  | { readonly kind: 'bulk'; readonly bytes: Uint8Array }
  | { readonly kind: 'verbatim'; readonly format: string; readonly text: string }
  | { readonly kind: 'double'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'big-number'; readonly digits: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'array'; readonly items: readonly Reply[] }
  | { readonly kind: 'set'; readonly items: readonly Reply[] }
  | { readonly kind: 'push'; readonly items: readonly Reply[] }
  | { readonly kind: 'map'; readonly entries: readonly (readonly [Reply, Reply])[] };

/** A transaction of the console: the commands queued, and whether the server rejected one of them. */
export interface Transaction {
  readonly queued: readonly CommandArguments[];
  readonly rejected: boolean;
}

/** What the console's connection is in (glossary, "session (of the console)"). */
export interface ConsoleSession {
  readonly database: number;
  readonly transaction?: Transaction;
  readonly watching: boolean;
  readonly protocol: Protocol;
}

/** What the server says a command does (`console.command-flags`). */
export type CommandFlags =
  | { readonly kind: 'told'; readonly flags: readonly string[] }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'not-told' };

/** The types of an argument in `COMMAND DOCS`. */
export type ArgumentType =
  'string' | 'integer' | 'double' | 'key' | 'pattern' | 'unix-time' | 'pure-token' | 'oneof' | 'block';

/** One argument of a command, as `COMMAND DOCS` describes it. */
export interface ArgumentDoc {
  readonly name: string;
  readonly type: ArgumentType;
  readonly displayText?: string;
  readonly token?: string;
  /** `optional`, `multiple`, `multiple_token`. */
  readonly flags: readonly string[];
  readonly since?: string;
  /** For `oneof` and `block`. */
  readonly arguments?: readonly ArgumentDoc[];
}

/** One command, or one subcommand named `<command>|<subcommand>`, as `COMMAND DOCS` describes it. */
export interface CommandDoc {
  /** In lower case, as the server names it: `set`, `config|set`. */
  readonly name: string;
  readonly summary: string;
  readonly since: string;
  readonly group: string;
  readonly arguments: readonly ArgumentDoc[];
  readonly subcommands: readonly CommandDoc[];
  readonly deprecated?: { readonly since: string; readonly replacedBy: string };
  /** The flags of `COMMAND INFO`, in the built-in list only. */
  readonly flags?: readonly string[];
}

/** The connection a console is on, as `console.classify` reads it. */
export interface ConsoleConnection {
  readonly name: string;
  readonly readOnly: boolean;
  /** `redis_version` of the server; empty when it is not known. */
  readonly version: string;
}

/** The numbers of keys `console.run` read before a confirmation that says how many keys are touched. */
export interface KeyCounts {
  /** `DBSIZE` of the console's database. */
  readonly database?: number;
  /** The keys of every database, from `INFO keyspace`. */
  readonly server?: { readonly keys: number; readonly databases: number };
}

/** One command of the output and what came of it (`console.output`). */
export interface OutputEntry {
  readonly id: number;
  /** The prompt it was typed at: `db0>`. */
  readonly prompt: string;
  /** The line as typed, each secret argument written `***`. */
  readonly line: string;
  /** When it was sent, in milliseconds since 1970. */
  readonly sentAt: number;
  /** How long the reply took, once it arrived. */
  readonly tookMs?: number;
  readonly reply?: Reply;
  /** The protocol the reply was read in. */
  readonly protocol: Protocol;
  readonly refusal?: { readonly code: string; readonly message: string; readonly offersPubSub: boolean };
  /** The notes under the reply: a transaction that did not run, a stop, a connection opened again. */
  readonly notes: readonly string[];
}

/** The console of one connection, as the main process keeps it. */
export interface ConsoleState {
  readonly connection: ConnectionId;
  readonly status: 'connecting' | 'ready' | 'running' | 'closed';
  /** The name of the command waiting for its reply, in upper case. */
  readonly running?: string;
  readonly session: ConsoleSession;
  /** How many times the console's connection was opened: the flags read are kept for one opening. */
  readonly opened: number;
  readonly entries: readonly OutputEntry[];
  /** The history of commands of the connection, the oldest first (`console.history`). */
  readonly history: readonly string[];
  /** How long the last reply took. */
  readonly lastReplyMs?: number;
}

/** The consoles, by connection. */
export type ConsolesState = Readonly<Record<string, ConsoleState>>;

/** The console of a connection in the app's state, when one is open (the part of the state named `consoles`). */
export function consoleOf(state: AppState, connection: ConnectionId): ConsoleState | undefined {
  const consoles = (state as AppState & { readonly consoles?: ConsolesState }).consoles;
  return consoles?.[connection];
}

/**
 * The client of the console's own connection, as the engines know it: one apart from the ordinary client of the
 * connection, so that `SELECT`, `MULTI` and a command that waits change nothing for the other pages.
 */
export function consoleClient(connection: ConnectionId): ConnectionId {
  return connectionId(`${connection}#console`);
}

/** The connection a feature of the console was started on. */
export function consoleConnection(context: Context): ConnectionId | undefined {
  const target = context.target;
  return target.kind === 'app' || target.kind === 'tab' ? undefined : target.connection;
}

/** The arguments an Operation was started with (`Intent.args`), as an object; empty when there are none. */
export function startArgs(answers: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const args = answers['args'];
  return typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

/** A field of a Json object, when the value is one. */
export function jsonField(value: Json, name: string): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as { readonly [key: string]: Json })[name]
    : undefined;
}

const decoder = new TextDecoder();

/** An argument as text, for comparing names and option words; bytes that are not text become U+FFFD. */
export function argumentText(argument: Uint8Array | undefined): string {
  return argument === undefined ? '' : decoder.decode(argument);
}

/** The words of a command in upper case, for the rules that compare names and option words without case. */
export function upperWords(command: CommandArguments): readonly string[] {
  return command.map((argument) => argumentText(argument).toUpperCase());
}

/** The commands whose second word is a subcommand (the containers of Redis 7.2). */
export const containers: ReadonlySet<string> = new Set([
  'ACL',
  'CLIENT',
  'CLUSTER',
  'COMMAND',
  'CONFIG',
  'FUNCTION',
  'LATENCY',
  'MEMORY',
  'MODULE',
  'OBJECT',
  'PUBSUB',
  'SCRIPT',
  'SLOWLOG',
  'XGROUP',
  'XINFO',
]);

/** The version numbers of a version: `7.2.4` gives `[7, 2, 4]`. */
export function versionNumbers(version: string): readonly number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

/** Whether `version` is at least `least`, number by number; an unknown (empty) version is taken as the newest. */
export function isAtLeast(version: string, least: string): boolean {
  if (version === '') {
    return true;
  }
  const have = versionNumbers(version);
  const want = versionNumbers(least);
  for (let index = 0; index < want.length; index += 1) {
    const difference = (have[index] ?? 0) - (want[index] ?? 0);
    if (difference !== 0) {
      return difference > 0;
    }
  }
  return true;
}
