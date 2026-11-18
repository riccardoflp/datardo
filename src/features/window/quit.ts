/**
 * Feature: window.quit
 *
 * Quits, after asking about what would be lost: changes not saved, and work still in progress.
 */
import type { Answers, AppStep, Context, Outcome, Plan } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { Work } from '../../shared/state/runner';
import { windowText } from './text';
import { appStep, windowPlan } from './types';

/** How long Datardo waits for the cancelled work to stop before it ends (Datardo's choice). */
export const quitWaitMs = 5000;

/** Whether an item of work is still in progress and is not the close or the quit itself. */
export function isOtherWorkInProgress(item: Work): boolean {
  return item.feature !== 'window.quit' && item.feature !== 'window.close' && item.error === undefined;
}

/** The work in progress a quit cancels, in the order it started; the quit itself and closing are not counted. */
export function workToCancel(work: readonly Work[]): readonly Work[] {
  return work
    .filter(isOtherWorkInProgress)
    .slice()
    .sort((one, other) => one.started - other.started);
}

/**
 * The plan of a quit, which `window.close` also returns when the window does not go to the tray. The questions about
 * unsaved changes of tabs (`tab.close`) come with the tabs, in M4.
 */
export function quitPlan(context: Context): Plan {
  const cancels: AppStep[] = workToCancel(context.state.runner.work).map((work) =>
    appStep(`cancel ${work.title}`, 'runner.cancel-work', { work: work.id }),
  );
  const quit = appStep('quit Datardo', 'window.quit', { waitMs: quitWaitMs });
  if (cancels.length === 0) {
    return windowPlan(windowText.quitTitle, [quit]);
  }
  return {
    title: windowText.quitQuestion,
    steps: [...cancels, quit],
    danger: { kind: 'confirm', text: windowText.quitConfirmText, button: windowText.quitButton },
    undo: { cannot: 'Quitting cannot be undone.' },
    publishes: false,
    after: [],
  };
}

/**
 * Feature: window.quit
 *
 * One step `cancel <title of the work>` for each work in progress, in the order they started, then `quit Datardo`;
 * confirmed with **Quit Datardo?** and **Quit** when there is work to cancel, at once otherwise.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  return run(quitPlan(context));
}
