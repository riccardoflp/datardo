/**
 * Feature: tab.activate
 *
 * Shows a tab, and makes the rest of the window follow it: its connection becomes the current one, the scope bar and
 * the inspector island are its own, and a place is added for **Back**. Started on a tab (`args.tab`), or by a command
 * with its variant: `next`, `previous`, `1` to `8`, `last`.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab, TabsState } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { text } from './text';
import { shownTabs, startedWith, stepName, tabOfArgs } from './types';

/** The variants of the commands of this card. */
export type ActivateVariant = 'next' | 'previous' | 'last' | `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

/**
 * The tab a command makes active. **Next** and **previous** follow the shown tabs of the strip and go round at the
 * ends; a number counts the shown tabs from the left; `last` is the last one. `undefined` when there is no such tab.
 */
export function tabOfVariant(tabs: TabsState, variant: string): Tab | undefined {
  const shown = shownTabs(tabs);
  if (variant === 'next' || variant === 'previous') {
    const index = shown.findIndex((tab) => tab.id === tabs.active);
    if (index < 0) {
      return variant === 'next' ? shown[0] : shown[shown.length - 1];
    }
    const step = variant === 'next' ? 1 : -1;
    return shown[(index + step + shown.length) % shown.length];
  }
  if (variant === 'last') {
    return shown[shown.length - 1];
  }
  const number = Number(variant);
  return Number.isInteger(number) && number >= 1 && number <= 8 ? shown[number - 1] : undefined;
}

/** The steps that make a tab active: the tab, and for a tab of a connection the recent place (`palette.recent`). */
export function activationSteps(state: AppState, tab: Tab): ReturnType<typeof appStep>[] {
  const name = stepName(state, tab.shows);
  const made = appStep(text.steps.activate(name), 'tab.activate', { tab: tab.id });
  if (tab.shows.kind === 'app') {
    return [made];
  }
  return [made, appStep(text.steps.rememberPlace(name), 'palette.remember-place', { tab: tab.id })];
}

/** The tab asked for: by its identifier, or by the variant of a command. */
function askedTab(state: AppState, answers: Answers): Tab | undefined {
  const started = startedWith(answers);
  if (started.kind === 'variant') {
    return tabOfVariant(state.tabs, started.variant);
  }
  return started.kind === 'object' ? tabOfArgs(state.tabs, answers) : undefined;
}

/** Makes a tab active; nothing when there is no such tab, or when it is the active one already. */
export function plan(context: Context, answers: Answers): Outcome {
  const tab = askedTab(context.state, answers);
  if (tab === undefined || tab.id === context.state.tabs.active) {
    return run(appPlan(text.plans.activate, []));
  }
  return run(appPlan(text.plans.activate, activationSteps(context.state, tab)));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.activate'), plan };
