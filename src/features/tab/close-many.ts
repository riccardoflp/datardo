/**
 * Feature: tab.close-many
 *
 * Closes several tabs at once: **Close others** (every tab but the one it was started on), **Close tabs of
 * \<connection\>** (every tab of a group) and **Close all**. Started with the variant of a command (`others`,
 * `connection`, `all`) on the active tab, or with `args.which` and `args.tab` or `args.connection` from a menu. Every
 * question about unsaved changes comes before anything is closed.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { tabConnectionOf, type Tab } from '../../shared/state/tabs';
import { appPlan } from '../nav/types';
import { changesAnswer, changesQuestion, closeSteps, stepsWhenNoneLeft, titleOf } from './close';
import { text } from './text';
import { connectionName, startedWith, tabOfArgs } from './types';

/** Which tabs are closed. */
export type CloseMany = 'others' | 'connection' | 'all';

/** What the plan closes, and its title. */
interface Closing {
  readonly title: string;
  readonly tabs: readonly Tab[];
}

function which(answers: Answers): CloseMany | undefined {
  const started = startedWith(answers);
  const asked =
    started.kind === 'variant' ? started.variant : started.kind === 'object' ? started.args['which'] : undefined;
  return asked === 'others' || asked === 'connection' || asked === 'all' ? asked : undefined;
}

function connectionAsked(state: AppState, answers: Answers): ConnectionId | undefined {
  const started = startedWith(answers);
  const named = started.kind === 'object' ? started.args['connection'] : undefined;
  if (typeof named === 'string') {
    return connectionId(named);
  }
  const tab = tabOfArgs(state.tabs, answers);
  return tab === undefined ? undefined : tabConnectionOf(tab);
}

/** The tabs a variant closes, in the order of the strip; `undefined` when it is not offered. */
export function closing(state: AppState, answers: Answers): Closing | undefined {
  const tabs = state.tabs.tabs;
  switch (which(answers)) {
    case 'all':
      return { title: text.plans.closeAll, tabs };
    case 'others': {
      const tab = tabOfArgs(state.tabs, answers);
      return tab === undefined
        ? undefined
        : { title: text.plans.closeOthers, tabs: tabs.filter((each) => each !== tab) };
    }
    case 'connection': {
      const connection = connectionAsked(state, answers);
      return connection === undefined
        ? undefined
        : {
            title: text.plans.closeTabsOf(connectionName(state, connection)),
            tabs: tabs.filter((tab) => tabConnectionOf(tab) === connection),
          };
    }
    case undefined:
      return undefined;
  }
}

/** The key of the answer about one tab's unsaved changes. */
export function changesKey(tab: Tab): string {
  return `changes:${tab.id}`;
}

/** Closes the tabs, asking first about each that has unsaved changes, in the order of the strip. */
export function plan(context: Context, answers: Answers): Outcome {
  const { state } = context;
  const asked = closing(state, answers);
  if (asked === undefined || asked.tabs.length === 0) {
    return run(appPlan(text.plans.closeAll, []));
  }
  const unanswered = asked.tabs.find(
    (tab) => tab.unsaved === true && changesAnswer(answers, changesKey(tab)) === undefined,
  );
  if (unanswered !== undefined) {
    return changesQuestion(titleOf(state, unanswered), changesKey(unanswered));
  }
  const steps = asked.tabs.flatMap((tab) => closeSteps(state, tab, changesAnswer(answers, changesKey(tab))));
  return run(appPlan(asked.title, [...steps, ...stepsWhenNoneLeft(state, asked.tabs.length)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.close-many'), plan };
