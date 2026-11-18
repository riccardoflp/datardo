/**
 * Feature: window.full-screen
 *
 * Gives the window the whole display, without the taskbar or the Dock, and gives back what it had when it leaves.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { WindowState } from '../../shared/state/window';
import { windowText } from './text';
import { appStep, windowPlan } from './types';

/** The title of the command now: **Enter full screen**, or **Exit full screen** while in it. */
export function fullScreenTitle(window: WindowState): string {
  return window.fullScreen ? windowText.exitFullScreen : windowText.enterFullScreen;
}

/**
 * Feature: window.full-screen
 *
 * One app step: `enter full screen`, or `exit full screen` while the window is in it.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const leaving = context.state.window.fullScreen;
  const step = leaving
    ? appStep('exit full screen', 'window.set-full-screen', { on: false })
    : appStep('enter full screen', 'window.set-full-screen', { on: true });
  return run(windowPlan(fullScreenTitle(context.state.window), [step]));
}
