/**
 * Feature: window.remember
 *
 * Datardo opens where it was closed, as large as it was, maximized if it was. Runs by itself after the window moved or
 * changed size, when it is maximized or restored, and when it closes.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { Placement } from './placement';
import { appStep, startedWith, windowPlan } from './types';

/** How long after the window was last moved or resized its place is saved (Datardo's choice). */
export const rememberDelayMs = 500;

/** A placement from what the feature was started with, when it is one. */
export function placementOf(value: unknown): Placement | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const numbers = [record['left'], record['top'], record['width'], record['height']];
  if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number))) {
    return undefined;
  }
  if (typeof record['maximized'] !== 'boolean') {
    return undefined;
  }
  const [left, top, width, height] = numbers as [number, number, number, number];
  return { left, top, width, height, maximized: record['maximized'] };
}

/**
 * Feature: window.remember
 *
 * One app step, `save the size and place of the window`: the left, top, width and height the window has when it is
 * not maximized, and whether it is maximized. Started with nothing usable, it saves nothing.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const placement = placementOf(startedWith(answers));
  const steps =
    placement === undefined
      ? []
      : [appStep('save the size and place of the window', 'window.save-placement', { ...placement })];
  return run(windowPlan('Remember the window', steps));
}
