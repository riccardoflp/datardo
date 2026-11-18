/**
 * Feature: tab.close
 *
 * Closes one tab: `args.tab`, or the active tab. A tab with unsaved changes asks first whether to save them (D33).
 * The tab is remembered for **Reopen closed tab**, and the tab that was active before it becomes active.
 */
import {
  ask,
  run,
  type Answers,
  type AppStep,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { Tab } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { text } from './text';
import { titledTabs } from './title';
import { connectionName, stepName, tabOfArgs, tabWhenNoneLeft } from './types';

/** The answers to the question of a tab with unsaved changes. */
export type ChangesAnswer = 'save' | 'discard';

/** Whether a tab can be closed: always, except Home while it is the only tab. */
export function isOffered(state: AppState, tab: Tab): boolean {
  const alone = state.tabs.tabs.length === 1;
  return !(alone && tab.shows.kind === 'app' && tab.shows.page === 'home');
}

/** The title of a tab as the strip writes it. */
export function titleOf(state: AppState, tab: Tab): string {
  const names = (id: Parameters<typeof connectionName>[1]): string => connectionName(state, id);
  return titledTabs(state.tabs.tabs, names).get(tab.id) ?? '';
}

/**
 * The question of a tab with unsaved changes: *Do you want to save the changes you made to orders · 7?*, answered
 * under `key` with `save` or `discard`; **Cancel** keeps the tab.
 */
export function changesQuestion(title: string, key: string): Outcome {
  return ask({
    title: text.question.title(title),
    text: text.question.line,
    button: text.question.button,
    fields: [
      {
        kind: 'pick-one',
        key,
        label: text.question.field,
        choices: [
          { value: 'save', label: text.question.save },
          { value: 'discard', label: text.question.dontSave },
        ],
        default: 'save',
      },
    ],
  });
}

/** The steps that close a tab: its save first when the answer was **Save**, then closing it. */
export function closeSteps(state: AppState, tab: Tab, answer: ChangesAnswer | undefined): readonly AppStep[] {
  const name = stepName(state, tab.shows);
  const close = appStep(text.steps.close(name), 'tab.close', { tab: tab.id });
  return answer === 'save' ? [appStep(text.steps.save(name), 'tab.save', { tab: tab.id }), close] : [close];
}

/** The step that opens what the strip shows once its last tab is closed, when there is one (M5: Home). */
export function stepsWhenNoneLeft(state: AppState, closing: number): readonly AppStep[] {
  if (tabWhenNoneLeft === undefined || closing < state.tabs.tabs.length) {
    return [];
  }
  return [appStep(text.steps.open(stepName(state, tabWhenNoneLeft)), 'tab.open', { shows: tabWhenNoneLeft })];
}

/** The answer to the question of a tab, when it was answered. */
export function changesAnswer(answers: Answers, key: string): ChangesAnswer | undefined {
  const answer = answers[key];
  return answer === 'save' || answer === 'discard' ? answer : undefined;
}

/** Closes the tab, asking first when it has unsaved changes. */
export function plan(context: Context, answers: Answers): Outcome {
  const { state } = context;
  const tab = tabOfArgs(state.tabs, answers);
  if (tab === undefined || !isOffered(state, tab)) {
    return run(appPlan(text.plans.close, []));
  }
  const answer = changesAnswer(answers, 'changes');
  if (tab.unsaved === true && answer === undefined) {
    return changesQuestion(titleOf(state, tab), 'changes');
  }
  return run(appPlan(text.plans.close, [...closeSteps(state, tab, answer), ...stepsWhenNoneLeft(state, 1)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.close'), plan };
