/**
 * What the Operations of the window area share: the shape of their plans, which change only Datardo's own window and
 * data, and how they read what they were started with.
 */
import type { Json } from '../../shared/engine-request';
import { noDanger, type Answers, type AppStep, type Plan } from '../../shared/feature';
import { windowText } from './text';

/** An app step: its text as the Log records it, the action the main process carries out, and its arguments. */
export function appStep(text: string, action: string, args: Json = null): AppStep {
  return { kind: 'app', text, action, args };
}

/** A plan of app steps that runs at once and is not recorded: nothing is written to a deployment. */
export function windowPlan(title: string, steps: readonly AppStep[]): Plan {
  return { title, steps, danger: noDanger, undo: { cannot: windowText.nothingRecorded }, publishes: false, after: [] };
}

/** What the feature was started with: the variant of its command (`in`, `dark`) or the arguments of the intent. */
export function startedWith(answers: Answers): unknown {
  return answers['args'];
}

/** The variant a feature was started with, when it is one of `variants`. */
export function variantOf<V extends string>(answers: Answers, variants: readonly V[]): V | undefined {
  const value = startedWith(answers);
  return variants.find((variant) => variant === value);
}

/** The step that writes a setting, carried out by the settings area (`settings.write`). */
export function settingStep(text: string, name: string, value: Json): AppStep {
  return appStep(text, 'settings.write', { name, value });
}
