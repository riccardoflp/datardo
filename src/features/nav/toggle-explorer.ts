/**
 * Feature: nav.toggle-explorer
 *
 * Shows or hides the explorer, giving the main island its room, and back. The choice is the user's and is remembered;
 * an explorer hidden by `nav.layout` in a narrow window is not.
 */
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { OperationFeature } from '../../shared/feature';
import { appPlan, appStep, startArgs } from './types';

/** Hides the explorer when it is shown, shows it when it is hidden; `args.hidden` asks for one of the two. */
export function plan(context: Context, answers: Answers): Outcome {
  const asked = startArgs(answers)['hidden'];
  const hidden = typeof asked === 'boolean' ? asked : !context.state.nav.explorerHidden;
  const words = hidden ? 'hide the explorer' : 'show the explorer';
  const title = hidden ? 'Hide the explorer' : 'Show the explorer';
  return run(appPlan(title, [appStep(words, 'nav.set-explorer', { hidden })]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.toggle-explorer'), plan };
