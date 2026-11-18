/**
 * Feature: tab.collapse-group
 *
 * Puts away the tabs of a connection that is not being worked on, without closing them: a click on the label of a
 * group (`args.connection`), its context menu, or Go to for the group of the active tab. `args.collapsed` says which
 * way; without it the group changes to the other. The app's group cannot be collapsed.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { activeTabOf, tabConnectionOf } from '../../shared/state/tabs';
import { appPlan, appStep } from '../nav/types';
import { text } from './text';
import { connectionName, startedWith } from './types';

/** Whether a group is collapsed. */
export function isCollapsed(state: AppState, connection: ConnectionId): boolean {
  return state.tabs.collapsed.includes(connection);
}

function askedConnection(state: AppState, answers: Answers): ConnectionId | undefined {
  const started = startedWith(answers);
  const named = started.kind === 'object' ? started.args['connection'] : undefined;
  if (typeof named === 'string') {
    return connectionId(named);
  }
  const active = activeTabOf(state.tabs);
  return active === undefined ? undefined : tabConnectionOf(active);
}

/** Collapses or expands the group of a connection; nothing for the app's group or a connection with no tab. */
export function plan(context: Context, answers: Answers): Outcome {
  const { state } = context;
  const connection = askedConnection(state, answers);
  if (connection === undefined || !state.tabs.tabs.some((tab) => tabConnectionOf(tab) === connection)) {
    return run(appPlan(text.plans.collapse, []));
  }
  const started = startedWith(answers);
  const asked = started.kind === 'object' ? started.args['collapsed'] : undefined;
  const collapsed = typeof asked === 'boolean' ? asked : !isCollapsed(state, connection);
  const name = connectionName(state, connection);
  const step = appStep(collapsed ? text.steps.collapse(name) : text.steps.expand(name), 'tab.collapse', {
    connection,
    collapsed,
  });
  return run(appPlan(collapsed ? text.plans.collapse : text.plans.expand, [step]));
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('tab.collapse-group'), plan };
