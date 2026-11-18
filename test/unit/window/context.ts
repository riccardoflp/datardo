/**
 * What the unit tests of the window area share: a context made from a state, and the texts of a plan's steps.
 */
import type { Answers, Context, Outcome, Plan, Platform } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import type { Json } from '../../../src/shared/engine-request';
import { appTarget } from '../../../src/shared/target';

/** What a test changes in the initial state. */
export interface Given {
  readonly settings?: Readonly<Record<string, Json>>;
  readonly window?: Partial<AppState['window']>;
  readonly runner?: Partial<AppState['runner']>;
  readonly app?: Partial<AppState['app']>;
  readonly nav?: Partial<AppState['nav']>;
  readonly platform?: Platform;
}

/** The app's state with what the test gives. */
export function stateWith(given: Given = {}): AppState {
  return {
    ...initialState,
    settings: { ...initialState.settings, stored: given.settings ?? {} },
    window: { ...initialState.window, ...given.window },
    runner: { ...initialState.runner, ...given.runner },
    app: { ...initialState.app, ...given.app, platform: given.platform ?? given.app?.platform ?? 'windows' },
    nav: { ...initialState.nav, ...given.nav },
  };
}

/** A context for `feature`, at a fixed time. */
export function contextFor(feature: string, given: Given = {}): Context {
  return {
    feature: featureId(feature),
    now: 1_700_000_000_000,
    platform: given.platform ?? 'windows',
    startedBy: 'user',
    target: appTarget,
    state: stateWith(given),
  };
}

/** The answers of a feature started with `args`, as the runner gives them. */
export function startedWith(args: Json): Answers {
  return { args };
}

/** The plan of an outcome that runs; fails the test otherwise. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}.`);
  }
  return outcome.plan;
}

/** The texts of the steps of an outcome that runs, as the confirmation shows them and the Log records them. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return planOf(outcome).steps.map((step) => step.text);
}
