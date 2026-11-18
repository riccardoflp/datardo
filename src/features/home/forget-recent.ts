/**
 * Feature: home.forget-recent
 *
 * Takes one thing, or everything, out of **Jump back in** and of the recent places of Go to: one app step, `forget
 * shop.orders of Local as a recent place`, or for **Clear** `forget every recent place`. Open tabs, pins, saved
 * queries and the places of **Back** are untouched; opening the thing again makes it a recent place again.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { appPlan, appStep, startArgs } from '../nav/types';
import { recentEntries } from '../palette/recent';
import { stepName } from '../tab/types';
import { text } from './text';

/** The app action that forgets recent places. */
export const forgetAction = 'palette.forget-places';

/** Forgets the recent place `args.key` (as `tab.same-target` writes it), or every one with `args.all`. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if (args['all'] === true) {
    return run(appPlan(text.plans.clear, [appStep(text.steps.forgetAll, forgetAction, { all: true })]));
  }
  const key = args['key'];
  const entry = recentEntries(context.state).find((each) => each.key === key);
  if (entry === undefined) {
    return run(appPlan(text.plans.forget, []));
  }
  const name = stepName(context.state, entry.place.shows);
  return run(appPlan(text.plans.forget, [appStep(text.steps.forget(name), forgetAction, { keys: [entry.key] })]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('home.forget-recent'), plan };
