/**
 * Feature: window.single-instance
 *
 * Starting Datardo while it already runs on the same data folder brings its window to the front instead of opening a
 * second Datardo. The main process of the second start quits before it creates a window or touches the data folder.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { appStep, windowPlan } from './types';

/**
 * Feature: window.single-instance
 *
 * In the instance already running: `show the window`, then `bring the window to the front`.
 */
export function plan(_context: Context, _answers: Answers): Outcome {
  return run(
    windowPlan('Show Datardo', [
      appStep('show the window', 'window.show'),
      appStep('bring the window to the front', 'window.focus'),
    ]),
  );
}
