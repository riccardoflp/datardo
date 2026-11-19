/**
 * Feature: console.run
 *
 * Sends the command typed in the console to the server, on the console's own connection, after refusing what a
 * read-only connection must not send and what would hold the console's connection, and after confirming what loses
 * data or changes the server (`console.classify`). The command is one step, sent as an array of arguments, never as
 * a line of text; its secret arguments are `***` in the step's text, which the confirmation and the Log show. Nothing
 * is recorded in the undo history.
 */
import type { Json, RedisReply } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { After, Answers, AppStep, Context, EngineStep, Outcome, Plan, ReadRequest } from '../../shared/feature';
import { needRead, noDanger, refuse, run } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { classification, countNeeded, titleOf, type Classification, type ClassifiedConnection } from './classify';
import { serverVersion } from './command-docs';
import { savedDatabase } from './connect';
import { commandArguments } from './parse-line';
import { commandLine } from '../runner/step-text';
import { maskedArguments } from './secret-arguments';
import { openedSession } from './session';
import { text } from './text';
import type { CommandArguments, CommandFlags, ConsoleSession, ConsoleState, KeyCounts } from './types';
import {
  argumentText,
  consoleClient,
  consoleConnection,
  consoleOf,
  containers,
  jsonField,
  startArgs,
  upperWords,
} from './types';

/** The console runs up to 500 lines at a time (Datardo's choice). */
export const mostLines = 500;

/** The key of `state.runner.remembered` under which the flags read on each console's connection are kept. */
export const flagsKey = 'console.command-flags';

/** The Read that counts the keys a confirmation names (`DBSIZE`, `INFO keyspace`). */
export const keyCountRead = 'console.key-count';

type FlagsMemory = Readonly<
  Record<string, { readonly opened: number; readonly flags: Readonly<Record<string, Json>> }>
>;

function flagsMemory(context: Context): FlagsMemory {
  const value = context.state.runner.remembered[flagsKey];
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as FlagsMemory) : {};
}

function flagsFromJson(value: Json | undefined): CommandFlags | undefined {
  if (Array.isArray(value)) {
    return { kind: 'told', flags: value.filter((flag): flag is string => typeof flag === 'string') };
  }
  return value === 'unknown' ? { kind: 'unknown' } : value === 'not-told' ? { kind: 'not-told' } : undefined;
}

function flagsAsJson(flags: CommandFlags): Json {
  return flags.kind === 'told' ? [...flags.flags] : flags.kind;
}

/** The name the flags are kept under: `set`, `function|flush`. */
function flagsName(command: CommandArguments): string {
  const [name = '', second] = command.map((argument) => argumentText(argument).toLowerCase());
  return second === undefined || !containers.has(name.toUpperCase()) ? name : `${name}|${second}`;
}

/** The flags of a command read on this opening of the console's connection, when they were. */
export function knownFlags(
  context: Context,
  console: ConsoleState,
  command: CommandArguments,
): CommandFlags | undefined {
  const kept = flagsMemory(context)[console.connection];
  return kept?.opened === console.opened ? flagsFromJson(kept.flags[flagsName(command)]) : undefined;
}

/** What follows that keeps the flags just read, for as long as the console's connection stays open. */
export function rememberFlags(
  context: Context,
  console: ConsoleState,
  command: CommandArguments,
  flags: CommandFlags,
): After {
  const memory = flagsMemory(context);
  const kept = memory[console.connection];
  const before = kept?.opened === console.opened ? kept.flags : {};
  const value = { opened: console.opened, flags: { ...before, [flagsName(command)]: flagsAsJson(flags) } };
  return { kind: 'remember', key: flagsKey, value: { ...memory, [console.connection]: value } as Json };
}

/** The console of the connection, or the one about to be opened on the saved connection's database. */
function consoleFor(context: Context, connection: ConnectionId): ConsoleState {
  const saved = savedConnection(context.state.connections, connection);
  return (
    consoleOf(context.state, connection) ?? {
      connection,
      status: 'ready',
      session: openedSession(saved === undefined ? 0 : savedDatabase(saved), 3),
      opened: 0,
      entries: [],
      history: [],
    }
  );
}

function linesOf(args: Readonly<Record<string, unknown>>): number {
  return typeof args['lines'] === 'number' ? args['lines'] : 1;
}

/** The step that sends the command on the console's connection, its secret arguments `***` in its text. */
export function commandStep(
  connection: ConnectionId,
  session: ConsoleSession,
  command: CommandArguments,
  writes: boolean,
): EngineStep {
  return {
    kind: 'engine',
    connection: consoleClient(connection),
    request: { engine: 'redis', database: session.database, command },
    writes,
    text: commandLine(maskedArguments(command)),
  };
}

/** A command queued before an `EXEC`, shown in its confirmation and not sent again. */
function queuedStep(command: CommandArguments): AppStep {
  return { kind: 'app', text: commandLine(maskedArguments(command)), action: 'console.queued', args: null };
}

function planOf(
  context: Context,
  console: ConsoleState,
  command: CommandArguments,
  decided: Exclude<Classification, { kind: 'refuse' }>,
): Plan {
  const steps =
    decided.kind === 'confirm' && decided.steps !== undefined
      ? [
          ...decided.steps.slice(0, -1).map(queuedStep),
          commandStep(console.connection, console.session, command, decided.writes),
        ]
      : [commandStep(console.connection, console.session, command, decided.writes)];
  return {
    title: decided.kind === 'confirm' ? decided.title : titleOf(upperWords(command)),
    steps,
    danger: dangerOf(decided),
    ...(decided.kind === 'confirm' && decided.touches !== undefined ? { touches: decided.touches } : {}),
    undo: { cannot: text.confirm.cannotUndo },
    publishes: false,
    after: decided.writes ? [{ kind: 'refresh', connection: console.connection }] : [],
  };
}

function dangerOf(decided: Exclude<Classification, { kind: 'refuse' }>): Plan['danger'] {
  if (decided.kind === 'run') {
    return noDanger;
  }
  const paragraphs = decided.texts.join('\n');
  return decided.danger === 'destructive'
    ? { kind: 'destructive', text: paragraphs, button: decided.button, name: decided.name ?? '' }
    : { kind: 'confirm', text: paragraphs, button: decided.button };
}

/** Why a command cannot be sent before it is read: the connection, a command still running, too many lines. */
function refusalBefore(
  context: Context,
  console: ConsoleState,
  args: Readonly<Record<string, unknown>>,
): Outcome | undefined {
  const saved = savedConnection(context.state.connections, console.connection);
  if (saved === undefined || connectionState(context.state.connections, saved.id) !== 'connected') {
    return refuse('console.run/not-connected', text.run.notConnected(saved?.name ?? ''));
  }
  if (linesOf(args) > mostLines) {
    return refuse('console.run/too-many-lines', text.run.tooManyLines);
  }
  return console.status === 'running' ? refuse('console.run/busy', text.run.busy(console.running ?? '')) : undefined;
}

function connectionFor(context: Context, console: ConsoleState, keys: KeyCounts | undefined): ClassifiedConnection {
  const saved = savedConnection(context.state.connections, console.connection);
  return {
    name: saved?.name ?? '',
    readOnly: saved?.readOnly ?? false,
    version: serverVersion(context, console.connection),
    ...(keys === undefined ? {} : { keys }),
  };
}

/** Whether a count must be read before deciding: a confirmation that names it, or a `KEYS` that may need one. */
function needsCount(command: CommandArguments, decided: Classification): boolean {
  const name = upperWords(command)[0];
  return (
    countNeeded(command) !== undefined && (decided.kind === 'confirm' || (name === 'KEYS' && decided.kind === 'run'))
  );
}

function keysOf(answers: Answers): KeyCounts | undefined {
  const keys = answers['keys'];
  return typeof keys === 'object' && keys !== null ? keys : undefined;
}

/** Feature: console.run — `{ line, lines }`: the line typed, and how many lines the run has. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = consoleConnection(context);
  if (connection === undefined) {
    return refuse('console.run/not-connected', text.run.notConnected(''));
  }
  const console = consoleFor(context, connection);
  const before = refusalBefore(context, console, args);
  if (before !== undefined) {
    return before;
  }
  const read = commandArguments(typeof args['line'] === 'string' ? args['line'] : '');
  if (read.kind === 'invalid') {
    return refuse('console.run/invalid-line', read.message);
  }
  const command = read.arguments;
  if (command.length === 0) {
    return run({
      title: '',
      steps: [],
      danger: noDanger,
      undo: { cannot: text.confirm.cannotUndo },
      publishes: false,
      after: [],
    });
  }
  const known = knownFlags(context, console, command);
  const readFlags = flagsFromAnswer(answers['flags']);
  const flags = known ?? readFlags;
  if (flags === undefined) {
    return needRead('flags', 'console.command-flags', flagsArgs(connection, command));
  }
  return decide(context, console, command, { flags, answers, remember: known === undefined });
}

function flagsFromAnswer(value: unknown): CommandFlags | undefined {
  return typeof value === 'object' && value !== null && 'kind' in value ? (value as CommandFlags) : undefined;
}

function flagsArgs(connection: ConnectionId, command: CommandArguments): Json {
  const [name = '', second] = command.map((argument) => argumentText(argument));
  return second === undefined || !containers.has(name.toUpperCase())
    ? { connection, name }
    : { connection, name, subcommand: second };
}

interface Decision {
  readonly flags: CommandFlags;
  readonly answers: Answers;
  readonly remember: boolean;
}

function decide(context: Context, console: ConsoleState, command: CommandArguments, decision: Decision): Outcome {
  const keys = keysOf(decision.answers);
  const decided = classification(command, decision.flags, console.session, connectionFor(context, console, keys));
  if (decided.kind === 'refuse') {
    return refuse(decided.code, decided.message);
  }
  if (keys === undefined && needsCount(command, decided)) {
    const count = countNeeded(command) ?? 'database';
    return needRead('keys', keyCountRead, {
      connection: console.connection,
      database: console.session.database,
      count,
    });
  }
  const planned = planOf(context, console, command, decided);
  const remembered = decision.remember ? [rememberFlags(context, console, command, decision.flags)] : [];
  return run({ ...planned, after: [...remembered, ...planned.after] });
}

/** Feature: console.run — the count a confirmation names: `DBSIZE` of the database, or `INFO keyspace`. */
export function keyCountRequest(_context: Context, args: Json): ReadRequest {
  const named = jsonField(args, 'connection');
  const connection = connectionId(typeof named === 'string' ? named : '');
  const database = Number(jsonField(args, 'database') ?? 0);
  const request =
    jsonField(args, 'count') === 'server' ? redisCommand(0, 'INFO', 'keyspace') : redisCommand(database, 'DBSIZE');
  return { kind: 'engine', requests: [{ connection, request: { ...request, timeLimitMs: 5000 } }] };
}

/** Feature: console.run — the counts from the reply of {@link keyCountRequest}; none when the read failed. */
export function parseKeyCount(replies: readonly unknown[]): KeyCounts {
  const [reply] = replies as readonly RedisReply[];
  if (typeof reply === 'number') {
    return { database: reply };
  }
  if (!(reply instanceof Uint8Array)) {
    return {};
  }
  const counts = [...new TextDecoder().decode(reply).matchAll(/^db\d+:keys=(\d+)/gmu)].map((match) => Number(match[1]));
  return { server: { keys: counts.reduce((sum, count) => sum + count, 0), databases: counts.length } };
}
