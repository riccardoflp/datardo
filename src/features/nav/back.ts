/**
 * Feature: nav.back
 *
 * Back and Forward through the places shown, as a browser does. A place is a tab and the section shown; the list is
 * for one run, keeps the last 100 places, and Back and Forward move in it without adding to it.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { NavHistory, NavPlace } from '../../shared/state/nav';
import { appPlan, appStep, findConnection, navInput, startArgs, type NavInput, type SavedConnection } from './types';

/** How many places the list keeps (Datardo's choice). */
export const historyLimit = 100;

/** Which way to go. */
export type HistoryDirection = 'back' | 'forward';

function isSamePlace(one: NavPlace | undefined, other: NavPlace): boolean {
  return one !== undefined && one.shows === other.shows && one.section === other.section;
}

/**
 * The list after a place is visited: the places ahead are dropped, the same place twice in a row is kept once, and
 * the oldest go first beyond 100.
 */
export function visit(history: NavHistory, place: NavPlace): NavHistory {
  if (isSamePlace(history.places[history.index], place)) {
    return history;
  }
  const places = [...history.places.slice(0, history.index + 1), place].slice(-historyLimit);
  return { places, index: places.length - 1 };
}

/** Whether a place can still be opened: a place of a connection that was removed cannot. */
export function isReachable(place: NavPlace, connections: readonly SavedConnection[]): boolean {
  return place.connection === undefined || findConnection(connections, place.connection) !== undefined;
}

/** The list without the places that cannot be opened any more, with the place shown kept where it was. */
export function withoutUnreachable(history: NavHistory, connections: readonly SavedConnection[]): NavHistory {
  const kept = history.places.filter((place) => isReachable(place, connections));
  const shownBefore = history.places.slice(0, history.index + 1).filter((place) => isReachable(place, connections));
  return { places: kept, index: Math.max(0, shownBefore.length - 1) };
}

/** The index of the place Back or Forward goes to, skipping those that cannot be opened; `undefined` when none. */
export function destination(
  history: NavHistory,
  direction: HistoryDirection,
  connections: readonly SavedConnection[],
): number | undefined {
  const step = direction === 'back' ? -1 : 1;
  for (let index = history.index + step; index >= 0 && index < history.places.length; index += step) {
    const place = history.places[index];
    if (place !== undefined && isReachable(place, connections)) {
      return index;
    }
  }
  return undefined;
}

/** Whether Back, or Forward, has a place to go to. */
export function canGo(input: NavInput, direction: HistoryDirection): boolean {
  return destination(input.nav.history, direction, input.connections) !== undefined;
}

/** The plan for the nav input given; nothing when there is no place to go to. */
export function planFor(input: NavInput, answers: Answers): Outcome {
  const direction: HistoryDirection = startArgs(answers)['direction'] === 'forward' ? 'forward' : 'back';
  const title = direction === 'back' ? 'Back' : 'Forward';
  const index = destination(input.nav.history, direction, input.connections);
  const place = index === undefined ? undefined : input.nav.history.places[index];
  if (index === undefined || place === undefined) {
    return run(appPlan(title, []));
  }
  const words = `go ${direction === 'back' ? 'back' : 'forward'} to ${place.path}`;
  return run(appPlan(title, [appStep(words, 'nav.go-to-place', { index })]));
}

/** Goes back or forward: `args.direction` is `back` or `forward`. */
export function plan(context: Context, answers: Answers): Outcome {
  return planFor(navInput(context.state), answers);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('nav.back'), plan };
