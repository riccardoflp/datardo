/**
 * Feature: watch.clear
 *
 * Empties the list of change events, what a pause holds and the count of the dropped, with the app step
 * `watch.clear`; the inspector island shows nothing. The stream goes on as it was, the next change event has the next
 * number, and the resume token stays. It asks nothing: the change events are a view of what happened, not data.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { pagePlan, pageStep } from './page/plans';
import { contextPage } from './page/state';
import { controlText } from './text';

/** Feature: watch.clear — the app step that empties the list of the page. */
export function plan(context: Context, _answers: Answers): Outcome {
  const found = contextPage(context);
  const steps = found === undefined ? [] : [pageStep(controlText.clearStep, 'watch.clear', { tab: found.tab })];
  return pagePlan(controlText.clearTitle, steps);
}
