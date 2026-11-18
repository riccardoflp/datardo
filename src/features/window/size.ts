/**
 * Feature: window.size
 *
 * Minimize, maximize and restore the window, for whoever uses the keyboard or Datardo's own buttons on Linux.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { WindowState } from '../../shared/state/window';
import { appStep, variantOf, windowPlan } from './types';

/** The three variants of the command. */
export type SizeVariant = 'minimize' | 'maximize' | 'restore';

const titles: Readonly<Record<SizeVariant, string>> = {
  minimize: 'Minimize window',
  maximize: 'Maximize window',
  restore: 'Restore window',
};

/** **Maximize window** while neither maximized nor in full screen, **Restore window** while maximized, **Minimize** always. */
export function isSizeOffered(window: WindowState, variant: SizeVariant): boolean {
  switch (variant) {
    case 'minimize':
      return true;
    case 'maximize':
      return !window.maximized && !window.fullScreen;
    case 'restore':
      return window.maximized;
  }
}

/** What a double click on the empty part of the top bar does: restore a maximized window, maximize another. */
export function toggledSize(window: WindowState): SizeVariant {
  return window.maximized ? 'restore' : 'maximize';
}

/**
 * Feature: window.size
 *
 * One app step: `minimize the window`, `maximize the window` or `restore the window`.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const variant = variantOf<SizeVariant>(answers, ['minimize', 'maximize', 'restore']);
  if (variant === undefined) {
    return run(windowPlan('Window size', []));
  }
  return run(windowPlan(titles[variant], [appStep(`${variant} the window`, `window.${variant}`)]));
}
