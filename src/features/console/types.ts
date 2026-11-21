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
import type { CommandArguments, ConsoleState } from '../../shared/state/consoles';
import type { TypedReply } from '../../shared/typed-reply';

export type {
  CommandArguments,
  ConsoleSession,
  ConsoleState,
  ConsolesState,
  OutputEntry,
  Protocol,
  Transaction,
} from '../../shared/state/consoles';

/** A reply of the server with every RESP type kept apart (`console.reply`). */
export type Reply = TypedReply;

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

/** The console of a connection in the app's state, when one is open (the part of the state named `consoles`). */
export function consoleOf(state: AppState, connection: ConnectionId): ConsoleState | undefined {
  return state.consoles[connection];
}

/** What the id of the console's client adds to the id of its connection. */
const consoleSuffix = '#console';

/**
 * The client of the console's own connection, as the engines know it: one apart from the ordinary client of the
 * connection, so that `SELECT`, `MULTI` and a command that waits change nothing for the other pages.
 */
export function consoleClient(connection: ConnectionId): ConnectionId {
  return connectionId(`${connection}${consoleSuffix}`);
}

/** The connection whose console a client of the engines is, or none when it is an ordinary client. */
export function consoleOwner(client: ConnectionId): ConnectionId | undefined {
  return client.endsWith(consoleSuffix) ? connectionId(client.slice(0, -consoleSuffix.length)) : undefined;
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
