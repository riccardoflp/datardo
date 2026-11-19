/**
 * The result of a run once it has ended (`playground.run`, `playground.results`): from the last message of its process,
 * or from the process ending before the script did, with the lines it printed and the notes of the sessions closed
 * for it (`playground.sessions`). And the lines the Log writes under the source **Playground**.
 */
import { text } from '../text';
import type { PlaygroundRun, RunError, RunResult } from '../types';
import type { FromRun } from '../runtime/calls';

/** How a run ended: the process's last message, or the process gone before it (killed, out of memory). */
export type RunEnd = Extract<FromRun, { readonly kind: 'done' | 'failed' }> | { readonly kind: 'process-ended' };

/** What a run has gathered when it ends. */
export interface RunEnding {
  readonly run: PlaygroundRun;
  /** When it ended, in milliseconds since 1970. */
  readonly endedAt: number;
  readonly output: readonly string[];
  /** The notes of the sessions and transactions closed at the end (`playground.sessions`). */
  readonly notes: readonly string[];
  readonly end: RunEnd;
}

function errorOf(end: RunEnd): RunError | undefined {
  switch (end.kind) {
    case 'done':
      return undefined;
    case 'failed':
      return end.error;
    case 'process-ended':
      return { message: text.results.outOfMemory };
  }
}

/** The result of a run that ended. The database is the one current when the script ended. */
export function endedResult(ending: RunEnding): RunResult {
  const { run, end } = ending;
  const error = errorOf(end);
  return {
    title: run.title,
    connectionName: run.connectionName,
    database: end.kind === 'process-ended' ? run.database : end.database,
    durationMs: Math.max(0, ending.endedAt - run.startedAt),
    value: end.kind === 'done' ? end.value : { kind: 'none' },
    output: [...ending.output, ...ending.notes],
    ...(error === undefined ? {} : { error }),
  };
}

/** The first line of a run in the Log: `▶ Playground 1 on Local › shop`. */
export function startLine(run: Pick<PlaygroundRun, 'title' | 'connectionName' | 'database'>): string {
  return text.run.logStart(run.title, run.connectionName, run.database);
}

/** The last line of a run that failed, in the Log: `✖ <message> (line <n>)`; none for a run that did not fail. */
export function failedLine(result: RunResult): string | undefined {
  return result.error === undefined ? undefined : text.run.logFailed(result.error.message, result.error.line);
}

/**
 * The line of an error thrown while the script ran, in the script: the line of the rewritten text the error reports
 * (which is the line of the text run), moved to where that text starts in the script.
 */
export function scriptLine(lineInText: number | undefined, firstLine: number): number | undefined {
  return lineInText === undefined ? undefined : firstLine + lineInText - 1;
}

/**
 * The message of an error thrown by the script: its name first when it is not a plain `Error`, *TypeError: u is
 * null*, unless the message already starts with it.
 */
export function errorMessage(name: string, message: string): string {
  return name !== '' && name !== 'Error' && !message.startsWith(name) ? `${name}: ${message}` : message;
}
