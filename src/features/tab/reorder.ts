/**
 * Feature: tab.reorder
 *
 * Moves a tab to another place among the tabs of its connection: by a drag along the strip (`args.tab` and `args.to`,
 * its new place in its group from 0), or the active tab one place left or right (the variants `left` and `right`).
 * A tab never leaves its group; the keys stop at the ends of the group.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { tabConnectionOf, tabsOfGroup, type Tab } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { text } from './text';
import { findTab, startedWith, stepName, tabOfArgs } from './types';

/** The tab to move and its place now and after, in its group, from 0. */
interface Move {
  readonly tab: Tab;
  readonly from: number;
  readonly to: number;
}

/** Whether a tab can be moved: its group has more than one tab. */
export function isOffered(state: AppState, tab: Tab): boolean {
  return tabsOfGroup(state.tabs.tabs, tabConnectionOf(tab)).length > 1;
}

function asked(state: AppState, answers: Answers): Move | undefined {
  const started = startedWith(answers);
  const tab = started.kind === 'variant' ? findTab(state.tabs, state.tabs.active) : tabOfArgs(state.tabs, answers);
  if (tab === undefined) {
    return undefined;
  }
  const group = tabsOfGroup(state.tabs.tabs, tabConnectionOf(tab));
  const from = group.findIndex((each) => each.id === tab.id);
  let to: number;
  if (started.kind === 'variant') {
    to = from + (started.variant === 'left' ? -1 : 1);
  } else {
    const wanted = started.kind === 'object' ? started.args['to'] : undefined;
    to = typeof wanted === 'number' && Number.isInteger(wanted) ? wanted : from;
  }
  return { tab, from, to: Math.max(0, Math.min(to, group.length - 1)) };
}

/** Moves a tab in its group; nothing when it stays where it is. */
export function plan(context: Context, answers: Answers): Outcome {
  const move = asked(context.state, answers);
  if (move === undefined || move.from === move.to) {
    return run(appPlan(text.plans.move, []));
  }
  const step = appStep(text.steps.move(stepName(context.state, move.tab.shows), move.to + 1), 'tab.move', {
    tab: move.tab.id,
    to: move.to,
  });
  return run(appPlan(text.plans.move, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.reorder'), plan };
