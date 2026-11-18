/**
 * Feature: runner.confirm
 *
 * Before a dangerous write the user sees exactly what will be sent, how much it touches and whether it can be undone,
 * and decides: one button named after the action, and for a destructive plan the name of what is lost, typed.
 */
import type { Confirmation, ConfirmStep } from '../../shared/state/runner';
import { runnerText } from './text';

/** The first 20 steps are shown (Datardo's choice). */
export const stepsShown = 20;

/** What the confirmation is drawn from: the plan as confirmed, and what the user did in it. */
export interface ConfirmState {
  readonly confirmation: Confirmation;
  /** The text typed in the field of a destructive confirmation. */
  readonly typed: string;
  /** **and 37 more** was pressed: every step shows. */
  readonly showAll: boolean;
}

/** What the confirmation shows, from the top. */
export interface ConfirmView {
  readonly title: string;
  /** The text of the confirmation its card gives, one paragraph per line. */
  readonly paragraphs: readonly string[];
  /** How much it touches: *3 documents*. */
  readonly touches?: string;
  readonly steps: readonly ConfirmStep[];
  /** **and 37 more**, a button that shows them all. */
  readonly more?: string;
  readonly undoLine: string;
  /** The field of a destructive confirmation, *Type orders to confirm*, and the name to type. */
  readonly nameField?: { readonly label: string; readonly name: string };
  /** Named after the action: **Delete**, **Drop index**. */
  readonly button: string;
  readonly buttonLook: 'primary' | 'danger';
  /** Disabled until the field holds exactly the name, compared with case. */
  readonly buttonEnabled: boolean;
}

/** Feature: runner.confirm. The confirmation of a plan. */
export function view(state: ConfirmState): ConfirmView {
  const { confirmation } = state;
  const danger = confirmation.danger;
  const hidden = state.showAll ? 0 : Math.max(0, confirmation.steps.length - stepsShown);
  const steps = hidden === 0 ? confirmation.steps : confirmation.steps.slice(0, stepsShown);
  const destructive = danger.kind === 'destructive';
  return {
    title: confirmation.title,
    paragraphs: danger.text.split('\n').filter((line) => line.trim() !== ''),
    steps,
    undoLine: confirmation.undoLine,
    button: danger.button,
    buttonLook: destructive ? 'danger' : 'primary',
    buttonEnabled: !destructive || state.typed === danger.name,
    ...(confirmation.touches === undefined ? {} : { touches: confirmation.touches }),
    ...(hidden > 0 ? { more: runnerText.andMore(hidden) } : {}),
    ...(destructive ? { nameField: { label: runnerText.typeToConfirm(danger.name), name: danger.name } } : {}),
  };
}
