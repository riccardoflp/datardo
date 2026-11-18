/**
 * Feature: settings.reset
 *
 * Puts a setting back to its default, or all of them after a confirmation that lists the values that are lost.
 * Connections, pins, saved queries and the undo history are not touched: they are not settings.
 */
import { refuse, run, type Answers, type Context, type Outcome } from '../../shared/feature';
import type { SettingsState } from '../../shared/state/settings';
import { settingsPlan, valueText, writeStep } from './change';
import { settingValue, settingsSchema } from './read';
import { settingsText } from './text';
import type { SettingName, SettingsSchema } from './types';

/** Feature: settings.reset. One step for each setting, `reset datardo.undo.maxDays to 7`. */
export function plan(context: Context, answers: Answers): Outcome {
  return planReset(settingsSchema, context, answers);
}

/** The plan with a given schema, for the tests. */
export function planReset(schema: SettingsSchema, context: Context, answers: Answers): Outcome {
  if (!context.state.settings.writable) {
    return refuse('settings.reset/newer-version', settingsText.newerVersion);
  }
  const args = answers['args'];
  const name = typeof args === 'object' && args !== null ? (args as { name?: unknown }).name : undefined;
  if (typeof name === 'string') {
    const declaration = schema.properties[name];
    const text = declaration === undefined ? '' : valueText(declaration.default);
    return run(settingsPlan(settingsText.resetOneTitle, [writeStep(settingsText.resetTo(name, text), name, null)]));
  }
  return resetAll(schema, context.state.settings);
}

function resetAll(schema: SettingsSchema, settings: SettingsState): Outcome {
  const names = changedSettings(schema, settings);
  const steps = names.map((name) =>
    writeStep(settingsText.resetTo(name, valueText(schema.properties[name]?.default ?? '')), name, null),
  );
  const values = names.map((name) =>
    settingsText.valueNow(
      schema.properties[name]?.title ?? name,
      valueText(settingValue(schema, settings.stored, name as SettingName)),
    ),
  );
  const plan = settingsPlan(settingsText.resetAllTitle, steps);
  if (steps.length === 0) {
    return run(plan);
  }
  return run({
    ...plan,
    danger: {
      kind: 'confirm',
      text: [settingsText.resetAllQuestion, ...values].join('\n'),
      button: settingsText.resetAllButton,
    },
    touches: settingsText.settingsCount(steps.length),
    undo: { cannot: settingsText.resetAllUndo },
  });
}

/** The declared settings that are stored, in the order of the schema: those **Reset all settings…** puts back. */
export function changedSettings(schema: SettingsSchema, settings: SettingsState): readonly string[] {
  return Object.keys(schema.properties).filter((name) => name in settings.stored);
}

/** Whether **Reset all settings…** is offered: at least one setting is not at its default. */
export function isOffered(settings: SettingsState): boolean {
  return changedSettings(settingsSchema, settings).length > 0;
}
