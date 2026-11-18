/**
 * Feature: window.zoom
 *
 * Makes everything in the window larger or smaller: zoom in, zoom out, reset the zoom.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { SettingsState } from '../../shared/state/settings';
import { setting } from '../settings/read';
import { settingStep, variantOf, windowPlan } from './types';

/** The three variants of the command. */
export type ZoomVariant = 'in' | 'out' | 'reset';

/** The steps of the zoom, in percent (Datardo's choice: Chromium's own steps). */
export const zoomSteps: readonly number[] = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200];

/** The zoom that is neither in nor out. */
export const zoomReset = 100;

/** The zoom in use, in percent: the setting, brought within 50 and 200. */
export function zoomInUse(settings: SettingsState): number {
  return setting(settings, 'datardo.window.zoom');
}

/** The zoom a variant gives from `value`, or the same value at a limit. */
export function nextZoom(value: number, variant: ZoomVariant): number {
  switch (variant) {
    case 'in':
      return zoomSteps.find((step) => step > value) ?? value;
    case 'out':
      return [...zoomSteps].reverse().find((step) => step < value) ?? value;
    case 'reset':
      return zoomReset;
  }
}

/** Whether a variant is offered at this zoom: **Zoom in** under 200%, **Zoom out** over 50%, **Reset** off 100%. */
export function isZoomOffered(value: number, variant: ZoomVariant): boolean {
  return nextZoom(value, variant) !== value;
}

/**
 * Feature: window.zoom
 *
 * One app step, `set the zoom to 125%`, which writes `datardo.window.zoom`. At a limit the plan has no step, so the
 * key does nothing.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const variant = variantOf<ZoomVariant>(answers, ['in', 'out', 'reset']);
  const value = zoomInUse(context.state.settings);
  const next = variant === undefined ? value : nextZoom(value, variant);
  const title = variant === 'in' ? 'Zoom in' : variant === 'out' ? 'Zoom out' : 'Reset zoom';
  if (next === value) {
    return run(windowPlan(title, []));
  }
  return run(windowPlan(title, [settingStep(`set the zoom to ${next}%`, 'datardo.window.zoom', next)]));
}
