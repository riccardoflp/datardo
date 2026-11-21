/**
 * Feature: tab.restore
 *
 * Datardo starts with the tabs it had, in their groups and order, on the tab that was active. While it runs the open
 * tabs are saved 1 second after the last change and when it quits; at start the saved tabs are opened, only the
 * active one loading its page. With `datardo.tab.restore` off only drafts are saved and restored.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import { connectionOfShows, type TabSeed, type TabsState } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { text } from './text';
import { startedWith, stepName, tabOfArgs } from './types';

/** How long after the last change the open tabs are saved, in ms (Datardo's choice). */
export const saveDelayMs = 1000;

/** What is saved of the tabs in `session.json`. Never a result, a document, a value, a selection or a secret. */
export interface Session {
  /** The tabs in the order of the strip, which keeps the groups in their order. */
  readonly tabs: readonly TabSeed[];
  /** The index of the active tab in `tabs`. */
  readonly active?: number;
  readonly collapsed: readonly ConnectionId[];
}

/** Nothing saved. */
export const emptySession: Session = { tabs: [], collapsed: [] };

function seedOf(tab: TabsState['tabs'][number]): TabSeed {
  return {
    shows: tab.shows,
    ...(tab.section === undefined ? {} : { section: tab.section }),
    ...(tab.memory === undefined ? {} : { memory: tab.memory }),
    ...(tab.draft === undefined ? {} : { draft: tab.draft }),
  };
}

/**
 * What is saved of the open tabs. With the setting off, only the tabs that have a draft, since their text would be
 * lost otherwise; no collapsed group and no active tab.
 */
export function sessionOf(tabs: TabsState, restoreOn: boolean): Session {
  const kept = restoreOn ? tabs.tabs : tabs.tabs.filter((tab) => tab.draft !== undefined);
  const active = kept.findIndex((tab) => tab.id === tabs.active);
  return {
    tabs: kept.map(seedOf),
    ...(restoreOn && active >= 0 ? { active } : {}),
    collapsed: restoreOn
      ? tabs.collapsed.filter((connection) => kept.some((tab) => connectionOfShows(tab.shows) === connection))
      : [],
  };
}

/**
 * What is restored of a saved session: every tab with the setting on, only the tabs with a draft with it off; never a
 * tab whose connection is no longer saved (`isSaved` is absent while the connections are not read).
 */
export function restoredSession(
  session: Session,
  restoreOn: boolean,
  isSaved?: (connection: ConnectionId) => boolean,
): Session {
  const isKept = (seed: TabSeed): boolean => {
    const connection = connectionOfShows(seed.shows);
    return (
      (restoreOn || seed.draft !== undefined) &&
      (connection === undefined || isSaved === undefined || isSaved(connection))
    );
  };
  const kept = session.tabs.filter(isKept);
  const activeSeed = session.active === undefined ? undefined : session.tabs[session.active];
  const active = activeSeed === undefined ? -1 : kept.indexOf(activeSeed);
  return {
    tabs: kept,
    ...(restoreOn && active >= 0 ? { active } : {}),
    collapsed: restoreOn
      ? session.collapsed.filter((connection) => kept.some((seed) => connectionOfShows(seed.shows) === connection))
      : [],
  };
}

/**
 * Keeps the draft of a tab with unsaved changes, so that a crash does not lose it (D33): started by the page with
 * `{ tab, draft }`, the draft `{ text, original? }`, or `draft: null` once the changes are saved or dropped.
 */
function draftPlan(context: Context, args: Readonly<Record<string, Json>>): Outcome {
  const tab = tabOfArgs(context.state.tabs, { args });
  if (tab === undefined) {
    return run(appPlan(text.plans.restore, []));
  }
  const name = stepName(context.state, tab.shows);
  const draft = args['draft'] ?? null;
  const step = appStep(draft === null ? text.steps.dropDraft(name) : text.steps.keepDraft(name), 'tab.keep-draft', {
    tab: tab.id,
    draft,
  });
  return run(appPlan(text.plans.restore, [step]));
}

/** Saves the open tabs (the variant `save`), opens the saved ones (`start`), or keeps the draft of a tab. */
export function plan(context: Context, answers: Answers): Outcome {
  const started = startedWith(answers);
  if (started.kind === 'object' && 'draft' in started.args) {
    return draftPlan(context, started.args);
  }
  const step =
    started.kind === 'variant' && started.variant === 'start'
      ? appStep(text.steps.openSaved, 'tab.open-saved', null)
      : appStep(text.steps.saveSession, 'tab.save-session', null);
  return run(appPlan(text.plans.restore, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.restore'), plan };
