/**
 * Feature: tab.reopen
 *
 * Brings back the tab that was just closed, with the section and the query it had, in its group at the place it had.
 * The last 20 tabs closed in this run are offered, the last closed first; one whose target has a tab again is skipped.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import type { ClosedTab } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { targetKey } from './same-target';
import { text } from './text';
import { isSaved, stepName } from './types';

/** The closed tab that would be reopened now: the last closed among the last 20 whose target has no tab. */
export function nextToReopen(state: AppState): ClosedTab | undefined {
  const open = new Set(state.tabs.tabs.map((tab) => targetKey(tab.shows, state.app.platform)));
  return state.tabs.closed.find((closed) => {
    const connection = closed.shows.kind === 'app' ? undefined : closed.shows.connection;
    return closed.reopenable && !open.has(closed.key) && (connection === undefined || isSaved(state, connection));
  });
}

/** Whether a closed tab can be reopened. */
export function isOffered(state: AppState): boolean {
  return nextToReopen(state) !== undefined;
}

/** The step that opens a closed tab again, as `tab.open` writes it. */
export function reopenStep(state: AppState, closed: ClosedTab): ReturnType<typeof appStep> {
  const args = {
    shows: JSON.parse(JSON.stringify(closed.shows)) as Parameters<typeof appStep>[2],
    background: false,
    place: closed.place,
    ...(closed.section === undefined ? {} : { section: closed.section }),
    ...(closed.memory === undefined ? {} : { memory: { ...closed.memory } }),
  };
  return appStep(text.steps.open(stepName(state, closed.shows)), 'tab.open', args);
}

/** Reopens the last closed tab; nothing when none can be. */
export function plan(context: Context, _answers: Answers): Outcome {
  const closed = nextToReopen(context.state);
  return run(appPlan(text.plans.reopen, closed === undefined ? [] : [reopenStep(context.state, closed)]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.reopen'), plan };
