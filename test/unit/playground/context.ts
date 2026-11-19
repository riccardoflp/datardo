/**
 * What the tests of the playground operations start from: Local (connected) and the read-only Production, a playground
 * tab **Playground 1** on Local and `shop` with its state, and the reading of the plans.
 */
import type { ConnectionStateName, ConnectionView } from '../../../src/shared/connection';
import type { AppStep, Context, Outcome, Plan } from '../../../src/shared/feature';
import { connectionId, featureId, tabId, type TabId } from '../../../src/shared/ids';
import type { Question } from '../../../src/shared/question';
import type { AppState } from '../../../src/shared/state';
import type { Tab } from '../../../src/shared/state/tabs';
import type { Target } from '../../../src/shared/target';
import type { PlaygroundState, PlaygroundsState, PlaygroundTab } from '../../../src/features/playground/types';
import { mongoConnection, redisConnection, stateWith } from '../connection/context';

/** Local, a MongoDB connection that writes. */
export const local = mongoConnection();

/** Production, a read-only MongoDB connection. */
export const production = mongoConnection({ id: connectionId('c-prod'), name: 'Production', readOnly: true });

/** Cache local, a Redis connection. */
export const cache = redisConnection();

/** The tab of **Playground 1**. */
export const firstTab: TabId = tabId('t1');

/** A playground tab on a connection, with a file when given. */
export function playgroundTabOf(id: TabId, title: string, connection = local, file?: string): PlaygroundTab {
  return {
    id,
    shows: { kind: 'playground', connection: connection.id, title, ...(file === undefined ? {} : { file }) },
    lastActive: 1,
    loaded: true,
  };
}

/** A playground's state, on `shop`, with this text. */
export function playgroundOf(text: string, overrides: Partial<PlaygroundState> = {}): PlaygroundState {
  return { tab: firstTab, defaultDatabase: 'shop', text, savedText: text, layout: 'table', ...overrides };
}

/** What a state is made of. */
export interface Setup {
  readonly saved?: readonly ConnectionView[];
  readonly states?: Readonly<Record<string, ConnectionStateName>>;
  readonly tabs?: readonly Tab[];
  readonly active?: TabId;
  readonly playgrounds?: PlaygroundsState;
  readonly current?: ConnectionView;
}

/** The app's state of a setup: Local connected by default, and the tabs and playgrounds given. */
export function stateOf(setup: Setup = {}): AppState {
  const base = stateWith(setup.saved ?? [local, production], setup.states ?? { [local.id]: 'connected' });
  const tabs = setup.tabs ?? [];
  return {
    ...base,
    tabs: { ...base.tabs, tabs, active: setup.active ?? tabs[0]?.id, nextId: tabs.length + 1 },
    nav: { ...base.nav, current: setup.current?.id },
    playgrounds: setup.playgrounds ?? {},
  };
}

/** The state with **Playground 1** open and active on Local and `shop`, with this text. */
export function withPlayground(text: string, overrides: Partial<PlaygroundState> = {}, setup: Setup = {}): AppState {
  return stateOf({
    tabs: [playgroundTabOf(firstTab, 'Playground 1')],
    playgrounds: { [firstTab]: playgroundOf(text, overrides) },
    ...setup,
  });
}

/** A context of the feature on a state. */
export function contextOf(feature: string, state: AppState, target: Target = { kind: 'app' }): Context {
  return { feature: featureId(feature), now: 1_763_400_000_000, platform: 'windows', startedBy: 'user', target, state };
}

/** The plan of an outcome, which must be one. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The question of an outcome, which must be one. */
export function questionOf(outcome: Outcome): Question {
  if (outcome.kind !== 'ask') {
    throw new Error(`Expected a question, got ${JSON.stringify(outcome)}`);
  }
  return outcome.question;
}

/** The app step of a plan with this action. */
export function appStepOf(plan: Plan, action: string): AppStep {
  const step = plan.steps.find((each): each is AppStep => each.kind === 'app' && each.action === action);
  if (step === undefined) {
    throw new Error(`Expected an app step ${action}`);
  }
  return step;
}

/** The arguments of the app step of a plan with this action. */
export function argsOf(plan: Plan, action: string): Readonly<Record<string, unknown>> {
  return appStepOf(plan, action).args as Readonly<Record<string, unknown>>;
}
