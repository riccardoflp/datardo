/**
 * Feature: playground.run
 *
 * Runs the whole script, the selected lines or one statement on the playground's connection, in a process of its own
 * (D40, D51, T6), and shows what it returned. The plan is one app step, `run <title> on <connection> › <database>`,
 * which the main process carries out until the run ends: it starts a process for the run with the rewritten text,
 * answers each call the script makes after the check of `playground.writes`, and ends the process when the script
 * ends or is stopped. A text that does not parse starts nothing: its syntax error is the result. Ported from
 * Mongoster's `src/playground/playground.ts` (`Playgrounds.run`) and `src/playground/shell.ts` (`runPlayground`).
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature, ReadRequest, Step } from '../../shared/feature';
import { needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { lineOf, lineStarts } from '../../shared/playground/statements';
import { connectionState } from '../../shared/state/connections';
import { appStep, mongoConnection } from './plans/common';
import { rewritten } from './rewrite';
import { databaseOfPart, statementAtCaret, statementOnLine } from './statements';
import { chosenTarget } from './target';
import { text } from './text';
import type { PlaygroundState, PlaygroundTab, RunPart, TextRange } from './types';
import { playgroundOf, runInProgress, startArgs, startedTab, type JsonObject } from './types';

/** The read that connects the playground's connection before a run when it is not connected: null, or the error. */
export const connectReadId = 'playground.run:connect';

/** The words that make the tree and the open pages of the connection be read again after a run. */
const writeWords = /insert|update|replace|delete|drop|create|rename|bulkWrite|findOneAnd/u;

/** What a run runs: the text, where it starts in the script, its title, and the database it starts on. */
export interface RunText {
  readonly text: string;
  readonly firstLine: number;
  readonly title: string;
  readonly database: string;
}

/** Where the part to run is: the selection (from the editor, or as it last reported it), a line, the caret. */
function whereOf(
  args: Readonly<Record<string, unknown>>,
  playground: PlaygroundState,
): { readonly selection?: TextRange; readonly line?: number; readonly caret?: number } {
  const selection = rangeOf(args['selection'] ?? playground.selection);
  return {
    ...(selection === undefined ? {} : { selection }),
    ...(typeof args['line'] === 'number' ? { line: args['line'] } : {}),
    ...(typeof args['caret'] === 'number' ? { caret: args['caret'] } : {}),
  };
}

function partOf(answers: Answers): RunPart {
  const args = answers['args'];
  const part = typeof args === 'string' ? args : startArgs(answers)['part'];
  return part === 'selection' || part === 'statement' ? part : 'all';
}

function rangeOf(value: unknown): TextRange | undefined {
  const range = typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : {};
  const from = range['from'];
  const to = range['to'];
  return typeof from === 'number' && typeof to === 'number' && from < to ? { from, to } : undefined;
}

function piece(source: string, range: TextRange, base: string, playground: PlaygroundState): RunText {
  const starts = lineStarts(source);
  const first = lineOf(starts, range.from);
  const last = lineOf(starts, Math.max(range.from, range.to - 1));
  return {
    text: source.slice(range.from, range.to),
    firstLine: first,
    title: text.run.lines(base, first, last),
    database: databaseOfPart(source, range.from, playground.defaultDatabase),
  };
}

/**
 * The text a run runs: the whole script (**Run all**, or `Ctrl+Enter` with nothing selected), the selected text, or
 * the statement of a **Run** button (`line`) or at the caret. A part runs on the database of the last `use("…")`
 * written before it, although that line is not run.
 */
export function runText(
  source: string,
  part: RunPart,
  where: { readonly selection?: TextRange; readonly line?: number; readonly caret?: number },
  context: { readonly title: string; readonly playground: PlaygroundState },
): RunText {
  const whole: RunText = {
    text: source,
    firstLine: 1,
    title: context.title,
    database: context.playground.defaultDatabase,
  };
  if (part === 'selection') {
    return where.selection === undefined ? whole : piece(source, where.selection, context.title, context.playground);
  }
  if (part === 'statement') {
    const caretLine = where.caret === undefined ? 1 : lineOf(lineStarts(source), where.caret);
    const statement =
      where.line === undefined ? statementAtCaret(source, caretLine) : statementOnLine(source, where.line);
    return statement === undefined
      ? whole
      : piece(source, { from: statement.start, to: statement.end }, context.title, context.playground);
  }
  return whole;
}

/** The arguments of the run step: the rewritten text, or the syntax error that is the result without a process. */
function runArgs(tab: PlaygroundTab, connection: string, ran: RunText): JsonObject {
  const common = { tab: tab.id, title: ran.title, connection, database: ran.database, firstLine: ran.firstLine };
  const result = rewritten(ran.text);
  if (result.kind === 'rewritten') {
    return { ...common, code: result.code, writes: writeWords.test(ran.text) };
  }
  const message = text.run.syntaxError(result.message);
  return { ...common, error: { message, line: ran.firstLine + result.line - 1 } };
}

/**
 * Feature: playground.run — `run <title> on <connection> › <database>`, the run of the active playground (or of
 * `args.tab`): `args` is the variant of the command (`all`, `selection`, `statement`), or `{ part, tab, text,
 * selection, caret, line }` from the editor. One playground runs at a time (D51).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const tab = startedTab(context, args);
  const playground = tab === undefined ? undefined : playgroundOf(context.state, tab.id);
  if (tab === undefined || playground === undefined) {
    return refuse('playground.run/no-playground', text.run.noPlayground);
  }
  if (runInProgress(context.state) !== undefined) {
    return refuse('playground.run/running', text.run.running);
  }
  const steps: Step[] = [];
  let connection = mongoConnection(context.state, tab.shows.connection);
  let defaultDatabase = playground.defaultDatabase;
  if (connection === undefined) {
    const choice = chosenTarget(context.state, answers, undefined, 'playground.run');
    if (choice.kind === 'outcome') {
      return choice.outcome;
    }
    ({ connection } = choice);
    defaultDatabase = choice.database;
    steps.push(
      appStep(text.target.step(tab.shows.title, connection.name, defaultDatabase), 'playground.set-target', {
        tab: tab.id,
        connection: connection.id,
        database: defaultDatabase,
      }),
    );
  }
  if (connectionState(context.state.connections, connection.id) !== 'connected') {
    const connected = answers['connected'];
    if (connected === undefined) {
      return needRead('connected', connectReadId, { connection: connection.id });
    }
    if (typeof connected === 'string') {
      return refuse('playground.run/not-connected', text.run.notConnected(connection.name, connected));
    }
  }
  const source = typeof args['text'] === 'string' ? args['text'] : playground.text;
  const ran = runText(source, partOf(answers), whereOf(args, playground), {
    title: tab.shows.title,
    playground: { ...playground, defaultDatabase },
  });
  const stepArgs = runArgs(tab, connection.id, ran);
  steps.push(appStep(text.run.step(ran.title, connection.name, ran.database), 'playground.run', stepArgs));
  return run({
    title: ran.title,
    steps,
    danger: { kind: 'none' },
    undo: { cannot: text.run.cannotUndo },
    // The writes are published call by call, by `oplog.playground-writes`, not by the runner after the step.
    publishes: false,
    // The step returns once the run has started: the host reads the tree again when the run ends (`args.writes`).
    after: [],
  });
}

/** The read that connects the connection: an app read that answers null once connected, or the error's text. */
export const connectRead: ReadFeature = {
  kind: 'read',
  id: featureId(connectReadId),
  request: (_context: Context, args: Json): ReadRequest => ({ kind: 'app', action: 'playground.connect', args }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};
