/**
 * The part of the app's state about the console tabs of Redis connections (`console.show`): for each connection whose
 * console is open, what its own connection is in (`console.session`), its output (`console.output`) and its history of
 * commands (`console.history`). The main process changes it as commands are sent and answered; the history is also
 * kept in `state/<connection id>.json`, the output is not kept anywhere.
 */
import type { ConnectionId } from '../ids';
import type { TypedReply } from '../typed-reply';

/** The arguments of a command, the name first, each as the bytes the server receives. */
export type CommandArguments = readonly Uint8Array[];

/** The protocol the console's connection reads replies in. */
export type Protocol = 2 | 3;

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

/** A refusal shown under its command. */
export interface EntryRefusal {
  readonly code: string;
  readonly message: string;
  readonly offersPubSub: boolean;
}

/** One command of the output and what came of it (`console.output`); a line of notes alone when `line` is empty. */
export interface OutputEntry {
  readonly id: number;
  /** The prompt it was typed at: `db0>`. */
  readonly prompt: string;
  /** The line as typed, each secret argument written `***`; empty for notes that follow no command. */
  readonly line: string;
  /** When it was sent, in milliseconds since 1970. */
  readonly sentAt: number;
  /** How long the reply took, once it arrived. */
  readonly tookMs?: number;
  readonly reply?: TypedReply;
  /** The protocol the reply was read in. */
  readonly protocol: Protocol;
  readonly refusal?: EntryRefusal;
  /** What went wrong before a reply could arrive: the connection could not be opened, or closed. */
  readonly failure?: string;
  /** The notes under the reply: a transaction that did not run, a stop, a connection opened again. */
  readonly notes: readonly string[];
}

/** Where the console's own connection is. */
export type ConsoleStatus = 'connecting' | 'ready' | 'running' | 'closed';

/** The console of one connection, as the main process keeps it. */
export interface ConsoleState {
  readonly connection: ConnectionId;
  readonly status: ConsoleStatus;
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

/** The output keeps the last 500 commands with their replies (Datardo's choice). */
export const outputKeeps = 500;

/** What a `changed` event sets; `running: null` says that nothing runs any more. */
export interface ConsoleChange {
  readonly status?: ConsoleStatus;
  readonly running?: string | null;
  readonly session?: ConsoleSession;
  readonly opened?: number;
  readonly history?: readonly string[];
  readonly lastReplyMs?: number;
}

/** The events of this part of the state. */
export type ConsolesEvent =
  | { readonly slice: 'consoles'; readonly type: 'opened'; readonly console: ConsoleState }
  | {
      readonly slice: 'consoles';
      readonly type: 'changed';
      readonly connection: ConnectionId;
      readonly change: ConsoleChange;
    }
  /** Adds an entry to the output, or replaces the one of the same id. */
  | {
      readonly slice: 'consoles';
      readonly type: 'entry';
      readonly connection: ConnectionId;
      readonly entry: OutputEntry;
    }
  | { readonly slice: 'consoles'; readonly type: 'cleared'; readonly connection: ConnectionId }
  | { readonly slice: 'consoles'; readonly type: 'forgotten'; readonly connection: ConnectionId };

/** No console open. */
export const initialConsolesState: ConsolesState = {};

/** The output once cleared: only the command still waiting for its reply, when one is. */
export function clearedEntries(entries: readonly OutputEntry[]): readonly OutputEntry[] {
  return entries.filter(
    (entry) =>
      entry.line !== '' &&
      entry.reply === undefined &&
      entry.refusal === undefined &&
      entry.failure === undefined &&
      entry.tookMs === undefined,
  );
}

/** The output once an entry is added or replaced: the oldest dropped from the top beyond 500. */
export function entriesWith(entries: readonly OutputEntry[], entry: OutputEntry): readonly OutputEntry[] {
  const index = entries.findIndex((each) => each.id === entry.id);
  if (index >= 0) {
    return entries.map((each, at) => (at === index ? entry : each));
  }
  const after = [...entries, entry];
  return after.length > outputKeeps ? after.slice(after.length - outputKeeps) : after;
}

function changed(console: ConsoleState, change: ConsoleChange): ConsoleState {
  const { running, ...rest } = change;
  const { running: _before, ...others } = console;
  const kept = running === null ? others : running === undefined ? console : { ...others, running };
  return { ...kept, ...rest };
}

function withConsole(
  state: ConsolesState,
  connection: ConnectionId,
  change: (console: ConsoleState) => ConsoleState,
): ConsolesState {
  const console = state[connection];
  return console === undefined ? state : { ...state, [connection]: change(console) };
}

/** Changes this part of the state. */
export function reduceConsoles(state: ConsolesState, event: ConsolesEvent): ConsolesState {
  switch (event.type) {
    case 'opened':
      return { ...state, [event.console.connection]: event.console };
    case 'changed':
      return withConsole(state, event.connection, (console) => changed(console, event.change));
    case 'entry':
      return withConsole(state, event.connection, (console) => ({
        ...console,
        entries: entriesWith(console.entries, event.entry),
      }));
    case 'cleared':
      return withConsole(state, event.connection, (console) => ({
        ...console,
        entries: clearedEntries(console.entries),
      }));
    case 'forgotten': {
      const { [event.connection]: _gone, ...others } = state;
      return others;
    }
  }
}
