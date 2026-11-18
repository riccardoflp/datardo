/**
 * Feature: window.close
 *
 * Closing the window quits Datardo, unless scheduled tasks keep it running in the tray. Closing quits on macOS too:
 * Datardo has one window and its tabs live in it.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { quitPlan } from './quit';
import { appStep, windowPlan } from './types';

/**
 * Feature: window.close
 *
 * When `task.tray` keeps Datardo running: `hide the window` and `show the tray icon`, asking nothing. Otherwise the
 * plan of `window.quit`, with its questions.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  if (context.state.window.closeKeepsRunning) {
    return run(
      windowPlan('Close window', [
        appStep('hide the window', 'window.hide'),
        appStep('show the tray icon', 'window.show-tray'),
      ]),
    );
  }
  return run(quitPlan(context));
}
