/**
 * Feature: table.toggle-formatting
 *
 * Shows every table without its colors, and back, without changing a rule. The choice is for every tab and is
 * remembered across starts, in `formatting.json`.
 */
import { run, type Answers, type Context, type Outcome } from '../../shared/feature';
import type { AppState } from '../../shared/state';
import { text } from './text';
import { startArgs, tablePlan } from './types';

/** Whether formatting is hidden now. */
export function isFormattingHidden(state: AppState): boolean {
  return state.table.formatting.hidden;
}

/** The title of the command and of the button now: **Hide formatting** while it is shown, **Show formatting** else. */
export function toggleTitle(hidden: boolean): string {
  return hidden ? text.formatting.show : text.formatting.hide;
}

/**
 * Feature: table.toggle-formatting
 *
 * One app step, `hide formatting` or `show formatting`: the other of what is now, or what `args.hidden` asks.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const asked = startArgs(answers)['hidden'];
  const hidden = typeof asked === 'boolean' ? asked : !isFormattingHidden(context.state);
  const step = {
    kind: 'app',
    text: hidden ? text.formatting.hideStep : text.formatting.showStep,
    action: 'table.set-formatting-hidden',
    args: { hidden },
  } as const;
  return run(tablePlan(hidden ? text.formatting.hide : text.formatting.show, [step]));
}
