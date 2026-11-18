/**
 * Feature: nav.toggle-inspector
 *
 * Shows or hides the inspector island, giving the page its room, and back. Offered only while the page of the active
 * tab has something to inspect; the choice is one for every tab, and is remembered.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { hasSomethingToInspect } from './inspector';
import { appPlan, appStep, navInput, startArgs, type NavInput } from './types';

/** Whether **Show inspector** or **Hide inspector** is offered: only while the page has something to inspect. */
export function isOffered(input: NavInput): boolean {
  return hasSomethingToInspect(input.activeTab);
}

/** The plan for the nav input given: nothing on a page with nothing to inspect. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  if (!isOffered(input)) {
    return run(appPlan('Show or hide the inspector island', []));
  }
  const asked = startArgs(answers)['hidden'];
  const hidden = typeof asked === 'boolean' ? asked : !input.nav.inspectorHidden;
  const words = hidden ? 'hide the inspector island' : 'show the inspector island';
  const title = hidden ? 'Hide the inspector island' : 'Show the inspector island';
  return run(appPlan(title, [appStep(words, 'nav.set-inspector', { hidden })]));
}

/** Hides the inspector island when it is shown, shows it when it is hidden; `args.hidden` asks for one of the two. */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.toggle-inspector'), plan };
