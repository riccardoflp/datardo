/**
 * The commands typed in the consoles, in the main process (`console.run`): what the window starts is run after the
 * console's client is opened again when it closed, a refused line is put in the output with its refusal, and the one
 * engine step of `console.run` is watched as it goes to the console's client, to put the command and its reply in the
 * output, follow the session and keep the line in the history.
 */
import type { Intent, IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';
import { targetConnection } from '../shared/target';
import { isConsoleAnswer, redisReplyOf } from '../shared/typed-reply';
import { historyAfter } from '../features/console/history';
import { cutNote, replyKeptBytes } from '../features/console/output';
import { commandArguments } from '../features/console/parse-line';
import { maskedArguments, secretArguments } from '../features/console/secret-arguments';
import { promptOf, sessionAfter, sessionNotes } from '../features/console/session';
import { stoppedNote } from '../features/console/stop';
import { text } from '../features/console/text';
import { consoleOwner, upperWords, type CommandArguments, type OutputEntry } from '../features/console/types';
import { commandLine } from '../features/runner/step-text';
import { setting } from '../features/settings/read';
import { closedBeforeReply, EngineError, type EngineService } from '../engines';
import { Cancelled } from '../runner/cancel';
import type { RunnerPorts } from '../runner/ports';
import { start as startFeature } from '../runner/start';
import { consoleHistoryIn } from '../storage/connection-state';
import { stateStoreOf } from './connection-state';
import {
  addEntry,
  afterConnect,
  change,
  connectConsole,
  consoleNow,
  consolesStarted,
  isConnected,
  liveOf,
  need,
  newEntryId,
  saveHistory,
  untilOpened,
  type Pending,
} from './consoles';

const encoder = new TextEncoder();

/** The line as the output writes it: its arguments, each secret one `***`; for a line that cannot be read, its words. */
function shownLine(line: string): string {
  const read = commandArguments(line);
  const command =
    read.kind === 'arguments'
      ? read.arguments
      : line
          .trim()
          .split(/\s+/u)
          .map((word) => encoder.encode(word));
  return read.kind === 'arguments' || line.trim() !== '' ? commandLine(maskedArguments(command)) : '';
}

function argsOf(intent: Intent): Readonly<Record<string, unknown>> {
  const args = intent.args;
  return typeof args === 'object' && args !== null && !Array.isArray(args)
    ? (args as Readonly<Record<string, unknown>>)
    : {};
}

/**
 * `console.run`: opens the console's client first when it closed, waits while it opens, and puts a refused line in
 * the output with its refusal under it. The command sent and its reply are put there as its step goes (`watch`).
 */
async function runInConsole(ports: RunnerPorts, intent: Intent, connection: ConnectionId): Promise<IntentResult> {
  const state = need().state.get();
  if (state.consoles[connection] !== undefined && isConnected(state, connection)) {
    await untilOpened(connection);
    if (consoleNow(connection)?.status === 'closed') {
      const opened = await connectConsole(connection);
      if (opened.kind !== 'done') {
        return opened;
      }
    }
  }
  const line = typeof argsOf(intent)['line'] === 'string' ? (argsOf(intent)['line'] as string) : '';
  const read = commandArguments(line);
  const live = liveOf(connection);
  if (read.kind === 'arguments' && read.arguments.length > 0) {
    live.pending = { line, command: read.arguments, shown: shownLine(line) };
  }
  const before = consoleNow(connection);
  const result = await startFeature(ports, intent);
  live.pending = undefined;
  if (result.kind === 'refused' && before !== undefined) {
    addEntry(connection, {
      id: newEntryId(),
      prompt: promptOf(before.session),
      line: shownLine(line),
      sentAt: Date.now(),
      protocol: before.session.protocol,
      refusal: { code: result.code, message: result.message, offersPubSub: result.code === 'console.run/subscribe' },
      notes: [],
    });
  }
  return result;
}

/** The count of commands kept, for **Clear console history** on a connection whose console is not open. */
async function withHistoryCount(intent: Intent, connection: ConnectionId): Promise<Intent> {
  if (consoleNow(connection) !== undefined) {
    return intent;
  }
  const store = await stateStoreOf(need(), connection);
  return { ...intent, args: { ...argsOf(intent), count: consoleHistoryIn(store.get()).length } as Json };
}

/**
 * Starts a feature from the window, with what the console adds around its features: `console.run` and `console.stop`
 * open the console's client again, `console.clear-history` counts a history whose console is not open.
 */
export async function startWithConsoles(ports: RunnerPorts, intent: Intent): Promise<IntentResult> {
  const connection = targetConnection(intent.target);
  if (connection === undefined || !consolesStarted()) {
    return startFeature(ports, intent);
  }
  switch (intent.feature) {
    case 'console.run':
      return runInConsole(ports, intent, connection);
    case 'console.stop': {
      const result = await startFeature(ports, intent);
      if (consoleNow(connection)?.status === 'connecting') {
        afterConnect(connection, result);
      }
      return result;
    }
    case 'console.clear-history':
      return startFeature(ports, await withHistoryCount(intent, connection));
    default:
      return startFeature(ports, intent);
  }
}

function sameCommand(first: CommandArguments, second: readonly Uint8Array[]): boolean {
  return (
    first.length === second.length &&
    first.every(
      (argument, index) =>
        argument.length === second[index]?.length && argument.every((byte, at) => byte === second[index]?.[at]),
    )
  );
}

/** The history after a line was sent, kept in the state and in the file when it changed. */
function keepInHistory(connection: ConnectionId, pending: Pending): void {
  const console = consoleNow(connection);
  if (console === undefined) {
    return;
  }
  const size = setting(need().state.get().settings, 'datardo.console.historySize');
  const history = historyAfter(console.history, pending.line, secretArguments(pending.command), size);
  if (history !== console.history) {
    change(connection, { history });
    void saveHistory(connection, history);
  }
}

/** Sends the command typed in the console, with the command and its reply in the output. */
async function sendTyped(
  engines: EngineService,
  connection: ConnectionId,
  pending: Pending,
  sent: { readonly request: Parameters<EngineService['send']>[0]; readonly signal: AbortSignal },
): Promise<unknown> {
  const console = consoleNow(connection);
  if (console === undefined) {
    return engines.send(sent.request, sent.signal);
  }
  const started = performance.now();
  const entry: OutputEntry = {
    id: newEntryId(),
    prompt: promptOf(console.session),
    line: pending.shown,
    sentAt: Date.now(),
    protocol: console.session.protocol,
    notes: [],
  };
  addEntry(connection, entry);
  change(connection, { status: 'running', running: upperWords(pending.command)[0] ?? '' });
  keepInHistory(connection, pending);
  try {
    const answer = await engines.send(sent.request, sent.signal);
    if (!isConsoleAnswer(answer)) {
      return answer;
    }
    const tookMs = performance.now() - started;
    const session = consoleNow(connection)?.session ?? console.session;
    const notes = [
      ...sessionNotes(session, pending.command, answer.reply),
      ...(answer.bytes > replyKeptBytes ? [cutNote(answer.bytes)] : []),
    ];
    addEntry(connection, { ...entry, reply: answer.reply, tookMs, notes });
    change(connection, {
      status: 'ready',
      running: null,
      session: sessionAfter(session, pending.command, answer.reply),
      lastReplyMs: tookMs,
    });
    return answer;
  } catch (error: unknown) {
    const live = liveOf(connection);
    const closed = error instanceof Error && error.message === closedBeforeReply;
    if (live.stopping) {
      live.stopping = false;
      addEntry(connection, { ...entry, notes: [stoppedNote(performance.now() - started)] });
      change(connection, { running: null });
      throw new Cancelled();
    }
    const failure = closed ? text.run.closedBeforeReply : error instanceof Error ? error.message : String(error);
    addEntry(connection, { ...entry, failure });
    change(connection, {
      running: null,
      ...(consoleNow(connection)?.status === 'running' ? { status: 'closed' } : {}),
    });
    throw closed ? new EngineError(text.run.closedBeforeReply) : error;
  }
}

/**
 * The engines as the runner uses them: a request to a console's client is the command typed in the console when it is
 * the one `console.run` was started with, and its command and reply go to the output; any other (`COMMAND INFO`) is
 * answered in the shape of the ordinary clients.
 */
export function withConsoles(engines: EngineService): EngineService {
  return {
    ...engines,
    send: async (request, signal) => {
      const connection = consoleOwner(request.connection);
      if (connection === undefined || request.request.engine !== 'redis') {
        return engines.send(request, signal);
      }
      const live = liveOf(connection);
      const pending = live.pending;
      if (
        pending !== undefined &&
        request.request.timeLimitMs === undefined &&
        sameCommand(pending.command, request.request.command)
      ) {
        live.pending = undefined;
        return sendTyped(engines, connection, pending, { request, signal });
      }
      const answer = await engines.send(request, signal);
      return isConsoleAnswer(answer) ? redisReplyOf(answer.reply) : answer;
    },
  };
}
