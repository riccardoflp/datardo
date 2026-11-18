/**
 * Feature: settings.change
 *
 * A change in the Settings page, saved at once: one app step that writes the setting, or removes it from
 * `settings.json` when the value is its default. Refused when `settings.validate` does not accept the value, and when
 * `settings.json` was written by a newer Datardo.
 */
import type { Json } from '../../shared/engine-request';
import {
  noDanger,
  refuse,
  run,
  type Answers,
  type AppStep,
  type Context,
  type Outcome,
  type Plan,
} from '../../shared/feature';
import { settingsSchema } from './read';
import { settingsText } from './text';
import type { SettingsSchema, SettingValue } from './types';
import { settingFromText, settingProblem } from './validate';

/** The app action of the main process that writes one setting, `{ name, value }`; a value of `null` removes it. */
export const writeSettingAction = 'settings.write';

/** What the feature is started with: the name of a setting and its new value (a field's text, or a switch's state). */
export interface SettingChange {
  readonly name: string;
  readonly value: Json;
}

/** Feature: settings.change. One step, `set datardo.undo.maxDays to 14`. */
export function plan(context: Context, answers: Answers): Outcome {
  return planChange(settingsSchema, context, answers);
}

/** The plan with a given schema, for the tests. */
export function planChange(schema: SettingsSchema, context: Context, answers: Answers): Outcome {
  const change = startedWith(answers['args']);
  if (!context.state.settings.writable) {
    return refuse('settings.change/newer-version', settingsText.newerVersion);
  }
  const text = typeof change.value === 'string' ? change.value : JSON.stringify(change.value);
  const problem = settingProblem(schema, change.name, text);
  const value = settingFromText(schema, change.name, text);
  if (problem !== undefined || value === undefined) {
    return refuse('settings.change/invalid', problem ?? settingsText.unknown(change.name));
  }
  const declaration = schema.properties[change.name];
  const stored = declaration?.default === value ? null : value;
  return run(
    settingsPlan(settingsText.changeTitle, [
      writeStep(settingsText.set(change.name, valueText(value)), change.name, stored),
    ]),
  );
}

/** What the feature was started with, from the intent's arguments. */
function startedWith(args: unknown): SettingChange {
  if (typeof args !== 'object' || args === null) {
    return { name: '', value: null };
  }
  const record = args as Record<string, unknown>;
  return { name: typeof record['name'] === 'string' ? record['name'] : '', value: (record['value'] ?? null) as Json };
}

/** A value as a step writes it: `14`, `dark`, `on`, `off`. */
export function valueText(value: SettingValue): string {
  if (typeof value === 'boolean') {
    return value ? settingsText.on : settingsText.off;
  }
  return String(value);
}

/** The app step that writes one setting, or removes it when `value` is `null`. */
export function writeStep(text: string, name: string, value: Json): AppStep {
  return { kind: 'app', action: writeSettingAction, args: { name, value }, text };
}

/** A plan of the settings area: nothing is written to a deployment, and nothing goes in the undo history. */
export function settingsPlan(title: string, steps: readonly AppStep[]): Plan {
  return {
    title,
    steps,
    danger: noDanger,
    undo: { cannot: settingsText.nothingToUndo },
    publishes: false,
    after: [],
  };
}
