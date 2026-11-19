/**
 * Feature: console.classify
 *
 * Decides, for a command about to be sent from the console, whether it runs at once, is refused, or is confirmed
 * first, and with which words; and whether it writes, which the runner's read-only guard uses. The rules are applied
 * in the card's order, and the first that applies decides: what would break the console's connection, what a
 * read-only connection must not send, what would wait forever, what loses data or changes the server. Names, subcommands
 * and option words are compared without case. A script is not read, and a renamed command is classified by the name
 * typed.
 */
import { builtinFlags } from './command-docs';
import { text } from './text';
import type { CommandArguments, CommandFlags, ConsoleConnection, ConsoleSession, KeyCounts } from './types';
import { argumentText, commandLine, containers, isAtLeast, upperWords } from './types';

/** What `console.classify` decides. */
export type Classification =
  | { readonly kind: 'run'; readonly writes: boolean }
  | { readonly kind: 'refuse'; readonly code: string; readonly message: string; readonly offersPubSub: boolean }
  | ({ readonly kind: 'confirm'; readonly writes: boolean } & Confirmation);

/** A confirmation of rule 4, or of an `EXEC` whose queued commands need one (rule 5). */
export interface Confirmation {
  readonly danger: 'confirm' | 'destructive';
  /** **Run FLUSHALL on Cache local?** */
  readonly title: string;
  /** The texts of the table, one for each command confirmed. */
  readonly texts: readonly string[];
  /** How many keys are touched: *1,204 keys*. */
  readonly touches?: string;
  /** **Run FLUSHALL**. */
  readonly button: string;
  /** What the user types, for a destructive one. */
  readonly name?: string;
  /** For an `EXEC`: `MULTI`, the queued commands in order, and `EXEC`. */
  readonly steps?: readonly CommandArguments[];
}

/** The connection as `console.classify` reads it, with the numbers of keys read before (`console.run`). */
export type ClassifiedConnection = ConsoleConnection & { readonly keys?: KeyCounts };

/** `KEYS` is confirmed above this number of keys in the console's database (Datardo's choice). */
export const keysConfirmedAbove = 10_000;

/** The commands whose title names their second word: the containers, and `DEBUG`. */
function hasSubcommand(name: string): boolean {
  return containers.has(name) || name === 'DEBUG';
}

/** The name in upper case, with its subcommand: `SET`, `CONFIG SET`, `ACL LOG RESET`. */
export function titleOf(words: readonly string[]): string {
  const [name = '', second, third] = words;
  if (name === 'ACL' && second === 'LOG' && third === 'RESET') {
    return 'ACL LOG RESET';
  }
  return hasSubcommand(name) && second !== undefined ? `${name} ${second}` : name;
}

function refusal(code: string, message: string, offersPubSub = false): Classification {
  return { kind: 'refuse', code, message, offersPubSub };
}

/** Rule 1: what would break the console's connection, refused on every connection. */
function breaksConnection(words: readonly string[], session: ConsoleSession): Classification | undefined {
  const [name = '', second, third] = words;
  if (name === 'SUBSCRIBE' || name === 'PSUBSCRIBE' || name === 'SSUBSCRIBE') {
    return refusal('console.run/subscribe', text.classify.subscribe(name), true);
  }
  if (name === 'MONITOR') {
    return refusal('console.run/monitor', text.classify.monitor);
  }
  if (name === 'SYNC' || name === 'PSYNC') {
    return refusal('console.run/replication-stream', text.classify.replicationStream(name));
  }
  const version = second === undefined ? undefined : Number(second);
  const changesState =
    (name === 'HELLO' && version !== undefined && !Number.isNaN(version) && version !== session.protocol) ||
    name === 'RESET' ||
    (name === 'CLIENT' && second === 'REPLY' && (third === 'OFF' || third === 'SKIP')) ||
    (name === 'CLIENT' && second === 'TRACKING' && third === 'ON');
  return changesState
    ? refusal('console.run/connection-state', text.classify.connectionState(titleOf(words)))
    : undefined;
}

/** What a command does that a read-only connection refuses, in the words of the message. */
type Writing = 'writes' | 'may-write' | 'sends' | 'changes-server' | 'unknown' | 'reads';

const scripts: ReadonlySet<string> = new Set(['EVAL', 'EVALSHA', 'FCALL']);

const changesServer: ReadonlySet<string> = new Set([
  'SHUTDOWN',
  'CONFIG SET',
  'CONFIG REWRITE',
  'CONFIG RESETSTAT',
  'SCRIPT FLUSH',
  'SCRIPT KILL',
  'FUNCTION KILL',
  'REPLICAOF',
  'SLAVEOF',
  'FAILOVER',
  'ACL SETUSER',
  'ACL DELUSER',
  'ACL LOAD',
  'ACL SAVE',
  'ACL LOG RESET',
  'MODULE LOAD',
  'MODULE LOADEX',
  'MODULE UNLOAD',
  'CLIENT KILL',
  'CLIENT PAUSE',
  'CLIENT UNPAUSE',
  'CLIENT UNBLOCK',
  'SAVE',
  'BGSAVE',
  'BGREWRITEAOF',
  'SLOWLOG RESET',
  'LATENCY RESET',
  'MEMORY PURGE',
]);

/** Allowed on a read-only connection: none of them changes a key or a setting of the server. */
const allowedReadOnly: ReadonlySet<string> = new Set([
  'MULTI',
  'EXEC',
  'DISCARD',
  'WATCH',
  'UNWATCH',
  'SELECT',
  'AUTH',
  'SCRIPT LOAD',
]);

/** The flags to decide with: the server's, or the built-in list's when the server did not tell. */
function flagsToUse(command: CommandArguments, flags: CommandFlags): CommandFlags {
  if (flags.kind !== 'not-told') {
    return flags;
  }
  const [name = '', second] = command.map((argument) => argumentText(argument).toLowerCase());
  const builtin = builtinFlags(name, second);
  return builtin === undefined ? { kind: 'unknown' } : { kind: 'told', flags: builtin };
}

function writingOf(command: CommandArguments, flags: CommandFlags): Writing {
  const words = upperWords(command);
  const [name = ''] = words;
  const title = titleOf(words);
  if (scripts.has(name)) {
    return 'may-write';
  }
  if (name === 'PUBLISH' || name === 'SPUBLISH') {
    return 'sends';
  }
  if (changesServer.has(title) || (name === 'DEBUG' && title !== 'DEBUG HELP')) {
    return 'changes-server';
  }
  if (allowedReadOnly.has(title) || allowedReadOnly.has(name)) {
    return 'reads';
  }
  const used = flagsToUse(command, flags);
  if (used.kind !== 'told') {
    return 'unknown';
  }
  return used.flags.includes('write') ? 'writes' : 'reads';
}

/** The form of a command that only reads, and the version it needs. */
const readingForms: Readonly<Record<string, readonly [string, string]>> = {
  SORT: ['SORT_RO', '7.0.0'],
  GEORADIUS: ['GEORADIUS_RO', '0.0.0'],
  GEORADIUSBYMEMBER: ['GEORADIUSBYMEMBER_RO', '0.0.0'],
  BITFIELD: ['BITFIELD_RO', '0.0.0'],
  EVAL: ['EVAL_RO', '7.0.0'],
  EVALSHA: ['EVALSHA_RO', '7.0.0'],
  FCALL: ['FCALL_RO', '7.0.0'],
};

function doingText(writing: Writing, title: string): string {
  switch (writing) {
    case 'may-write':
      return text.classify.mayWrite(title);
    case 'sends':
      return text.classify.sendsMessage(title);
    case 'changes-server':
      return text.classify.changesServer(title);
    case 'writes':
    case 'unknown':
    case 'reads':
      return text.classify.writes(title);
  }
}

/** Rule 2: what a read-only connection refuses. */
function refusedReadOnly(
  command: CommandArguments,
  writing: Writing,
  connection: ConsoleConnection,
): Classification | undefined {
  const words = upperWords(command);
  const title = titleOf(words);
  if (writing === 'reads') {
    return undefined;
  }
  if (writing === 'unknown') {
    return refusal('console.run/unknown-command', text.classify.unknownCommand(connection.name, title));
  }
  const form = readingForms[words[0] ?? ''];
  const ending = form !== undefined && isAtLeast(connection.version, form[1]) ? text.classify.useToRead(form[0]) : '';
  return refusal('console.run/read-only', text.classify.readOnly(connection.name, doingText(writing, title)) + ending);
}

/** Where the timeout of a command that waits is, in seconds or in milliseconds. */
function timeoutPlace(words: readonly string[]): { readonly index: number; readonly unit: 's' | 'ms' } | undefined {
  const [name = ''] = words;
  const last = words.length - 1;
  if (['BLPOP', 'BRPOP', 'BZPOPMIN', 'BZPOPMAX', 'BRPOPLPUSH', 'BLMOVE'].includes(name)) {
    return { index: last, unit: 's' };
  }
  if (name === 'BLMPOP' || name === 'BZMPOP') {
    return { index: 1, unit: 's' };
  }
  if (name === 'XREAD' || name === 'XREADGROUP') {
    const block = words.indexOf('BLOCK');
    return block > 0 ? { index: block + 1, unit: 'ms' } : undefined;
  }
  return name === 'WAIT' || name === 'WAITAOF' ? { index: last, unit: 'ms' } : undefined;
}

/** Rule 3: a command that would wait forever, refused when no transaction is open. */
function blocksForever(command: CommandArguments): Classification | undefined {
  const words = upperWords(command);
  const place = timeoutPlace(words);
  const timeout = place === undefined ? undefined : argumentText(command[place.index]).trim();
  if (place === undefined || timeout === undefined || timeout === '' || Number(timeout) !== 0) {
    return undefined;
  }
  const example = command.map((argument, index) =>
    index === place.index ? new TextEncoder().encode(place.unit === 's' ? '5' : '5000') : argument,
  );
  return refusal('console.run/blocks-forever', text.classify.blocksForever(words[0] ?? '', commandLine(example)));
}

/** What rule 4 says of one command, before its title and button: its danger, its text, what it touches. */
export interface CommandDanger {
  readonly danger: 'confirm' | 'destructive';
  readonly text: string;
  readonly touches?: string;
  readonly name?: string;
}

const stopsServer: ReadonlySet<string> = new Set([
  'SEGFAULT',
  'PANIC',
  'OOM',
  'ASSERT',
  'RESTART',
  'CRASH-AND-RECOVER',
]);

const confirmTexts: Readonly<Record<string, string>> = {
  FAILOVER: text.confirm.failover,
  'CONFIG SET': text.confirm.configSet,
  'CONFIG REWRITE': text.confirm.configRewrite,
  'CONFIG RESETSTAT': text.confirm.configResetStat,
  'SCRIPT FLUSH': text.confirm.scriptFlush,
  'FUNCTION DELETE': text.confirm.functionDelete,
  'ACL SETUSER': text.confirm.acl,
  'ACL DELUSER': text.confirm.acl,
  'ACL LOAD': text.confirm.acl,
  'ACL SAVE': text.confirm.acl,
  'MODULE LOAD': text.confirm.module,
  'MODULE LOADEX': text.confirm.module,
  'MODULE UNLOAD': text.confirm.module,
  'CLIENT KILL': text.confirm.clientKill,
  'CLIENT PAUSE': text.confirm.clientPause,
  SAVE: text.confirm.save,
};

function serverTouches(keys: KeyCounts | undefined): { readonly touches?: string } {
  const server = keys?.server;
  return server === undefined ? {} : { touches: text.confirm.serverKeys(server.keys, server.databases) };
}

function databaseTouches(keys: KeyCounts | undefined): { readonly touches?: string } {
  return keys?.database === undefined ? {} : { touches: text.confirm.databaseKeys(keys.database) };
}

/** The destructive commands of rule 4. */
function destructiveDanger(
  command: CommandArguments,
  session: ConsoleSession,
  connection: ClassifiedConnection,
): CommandDanger | undefined {
  const words = upperWords(command);
  const [name = '', second, third] = words;
  const byName = { danger: 'destructive', name: connection.name } as const;
  if (name === 'FLUSHALL') {
    return { ...byName, text: text.confirm.flushAll, ...serverTouches(connection.keys) };
  }
  if (name === 'FLUSHDB') {
    const database = session.database;
    return {
      danger: 'destructive',
      text: text.confirm.flushDb(database),
      name: `db${String(database)}`,
      ...databaseTouches(connection.keys),
    };
  }
  if (name === 'SHUTDOWN' && !words.slice(1).includes('ABORT')) {
    const noSave = words.slice(1).includes('NOSAVE') ? ` ${text.confirm.noSave}` : '';
    return { ...byName, text: text.confirm.shutdown + noSave };
  }
  if ((name === 'REPLICAOF' || name === 'SLAVEOF') && !(second === 'NO' && third === 'ONE') && words.length >= 3) {
    const address = `${argumentText(command[1])}:${argumentText(command[2])}`;
    return { ...byName, text: text.confirm.replicaOf(address), ...serverTouches(connection.keys) };
  }
  if ((name === 'FUNCTION' && second === 'FLUSH') || (name === 'DEBUG' && stopsServer.has(second ?? ''))) {
    return { ...byName, text: name === 'DEBUG' ? text.confirm.debugStops : text.confirm.functionFlush };
  }
  return undefined;
}

/** The commands of rule 4 that are confirmed without typing. */
function confirmDanger(
  command: CommandArguments,
  session: ConsoleSession,
  connection: ClassifiedConnection,
): CommandDanger | undefined {
  const words = upperWords(command);
  const [name = '', second, third] = words;
  const title = titleOf(words);
  const fixed = confirmTexts[title];
  if (fixed !== undefined) {
    return { danger: 'confirm', text: fixed };
  }
  if (name === 'DEBUG' && second !== undefined && second !== 'HELP') {
    return { danger: 'confirm', text: text.confirm.debug };
  }
  if (name === 'SWAPDB' && words.length >= 3) {
    return { danger: 'confirm', text: text.confirm.swapDb(argumentText(command[1]), argumentText(command[2])) };
  }
  if ((name === 'REPLICAOF' || name === 'SLAVEOF') && second === 'NO' && third === 'ONE') {
    return { danger: 'confirm', text: text.confirm.replicaOfNoOne };
  }
  if (title === 'FUNCTION RESTORE' && words.slice(3).some((word) => word === 'FLUSH' || word === 'REPLACE')) {
    return { danger: 'confirm', text: text.confirm.functionDelete };
  }
  if (name === 'MIGRATE' && !words.slice(6).includes('COPY')) {
    return { danger: 'confirm', text: text.confirm.migrate };
  }
  const keys = connection.keys?.database;
  if (name === 'KEYS' && keys !== undefined && keys > keysConfirmedAbove) {
    return { danger: 'confirm', text: text.confirm.keys(session.database), ...databaseTouches(connection.keys) };
  }
  return undefined;
}

/** Feature: console.classify — rule 4 alone: the danger of one command, outside a transaction. */
export function dangerOf(
  command: CommandArguments,
  session: ConsoleSession,
  connection: ClassifiedConnection,
): CommandDanger | undefined {
  return destructiveDanger(command, session, connection) ?? confirmDanger(command, session, connection);
}

function confirmation(title: string, connection: ConsoleConnection, dangers: readonly CommandDanger[]): Confirmation {
  const destructive = dangers.find((each) => each.danger === 'destructive');
  const touches = dangers.find((each) => each.touches !== undefined)?.touches;
  return {
    danger: destructive === undefined ? 'confirm' : 'destructive',
    title: text.confirm.title(title, connection.name),
    texts: dangers.map((each) => each.text),
    button: text.confirm.button(title),
    ...(touches === undefined ? {} : { touches }),
    ...(destructive?.name === undefined ? {} : { name: destructive.name }),
  };
}

/** Rule 5: an `EXEC` whose queued commands need a confirmation, with the steps of the whole transaction. */
function execConfirmation(session: ConsoleSession, connection: ClassifiedConnection): Classification {
  const queued = session.transaction?.queued ?? [];
  const dangers = queued.flatMap((each) => dangerOf(each, session, connection) ?? []);
  if (dangers.length === 0) {
    return { kind: 'run', writes: false };
  }
  const encoder = new TextEncoder();
  return {
    kind: 'confirm',
    writes: true,
    ...confirmation('EXEC', connection, dangers),
    steps: [[encoder.encode('MULTI')], ...queued, [encoder.encode('EXEC')]],
  };
}

/** Feature: console.classify — whether a command runs, is refused, or is confirmed first. */
export function classification(
  command: CommandArguments,
  flags: CommandFlags,
  session: ConsoleSession,
  connection: ClassifiedConnection,
): Classification {
  const words = upperWords(command);
  const broken = breaksConnection(words, session);
  if (broken !== undefined) {
    return broken;
  }
  const writing = writingOf(command, flags);
  const writes = writing !== 'reads';
  const readOnly = connection.readOnly ? refusedReadOnly(command, writing, connection) : undefined;
  if (readOnly !== undefined) {
    return readOnly;
  }
  const inTransaction = session.transaction !== undefined;
  if (inTransaction) {
    return words[0] === 'EXEC' ? execConfirmation(session, connection) : { kind: 'run', writes };
  }
  const waits = blocksForever(command);
  if (waits !== undefined) {
    return waits;
  }
  const danger = dangerOf(command, session, connection);
  return danger === undefined
    ? { kind: 'run', writes }
    : { kind: 'confirm', writes, ...confirmation(titleOf(words), connection, [danger]) };
}

/** Which count a confirmation needs read first: `DBSIZE` for `FLUSHDB` and `KEYS`, `INFO keyspace` for the others. */
export function countNeeded(command: CommandArguments): 'database' | 'server' | undefined {
  const words = upperWords(command);
  const [name = '', second, third] = words;
  if (name === 'FLUSHDB' || name === 'KEYS') {
    return 'database';
  }
  const replicates = (name === 'REPLICAOF' || name === 'SLAVEOF') && !(second === 'NO' && third === 'ONE');
  return name === 'FLUSHALL' || replicates ? 'server' : undefined;
}
