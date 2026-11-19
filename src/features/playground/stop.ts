/**
 * Feature: playground.stop
 *
 * Ends the run of a playground at once, whatever its script is doing: the main process ends the process of the run
 * without waiting for the script, then aborts the transactions the run left open, ends its sessions
 * (`playground.sessions`) and closes its cursors. No operation is killed on the server. While the run waits for the
 * answer to a drop, the confirmation closes and the drop is not sent. Ported from Mongoster's
 * `src/playground/playground.ts` (`Playgrounds.run`, the cancellation) and `src/playground/shell.ts`
 * (`Shell.closeSessions`); ending the process is new in Datardo.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { appPlan, appStep } from './plans/common';
import { text } from './text';
import type { RunResult } from './types';
import { runInProgress } from './types';

/**
 * Feature: playground.stop — `stop the run of <title>`, an app step, for the run in progress, from whichever tab (one
 * runs at a time, D51); nothing when no playground is running.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const running = runInProgress(context.state);
  const steps =
    running === undefined
      ? []
      : [appStep(text.stop.step(running.title), 'playground.stop', { tab: running.tab, title: running.title })];
  return appPlan(text.stop.title, steps, text.stop.cannotUndo);
}

/**
 * The result of a run that was stopped: the output up to the stop and the notes of what was aborted, with the error
 * *Cancelled. Operations already sent may still complete on the server.*
 */
export function stoppedResult(
  result: Omit<RunResult, 'error' | 'stopped' | 'value'>,
  notes: readonly string[],
): RunResult {
  return {
    ...result,
    output: [...result.output, ...notes],
    value: { kind: 'none' },
    error: { message: text.results.cancelled },
    stopped: true,
  };
}
