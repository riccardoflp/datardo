/**
 * The value of a setting, always a valid one, from the schema and the values the user changed.
 *
 * Feature: settings.read
 */
import type { Json } from '../../shared/engine-request';
import type { SettingsState } from '../../shared/state/settings';
import declared from '../../../resources/settings.schema.json';
import type { SettingDeclaration, SettingName, SettingsSchema, SettingValue, SettingValues } from './types';

/** The schema Datardo is built with. */
export const settingsSchema: SettingsSchema = declared as SettingsSchema;

/** The value to use for a setting: the stored one when it is valid, brought within bounds, or the default. */
export function settingValue<N extends SettingName>(
  schema: SettingsSchema,
  stored: Readonly<Record<string, Json>>,
  name: N,
): SettingValues[N] {
  const declaration = schema.properties[name];
  if (declaration === undefined) {
    throw new Error(`The setting ${name} is not declared.`);
  }
  return usable(declaration, stored[name]) as SettingValues[N];
}

/** The value of a setting in the app's state, with the schema Datardo is built with. */
export function setting<N extends SettingName>(settings: SettingsState, name: N): SettingValues[N] {
  return settingValue(settingsSchema, settings.stored, name);
}

function usable(declaration: SettingDeclaration, value: Json | undefined): SettingValue {
  switch (declaration.type) {
    case 'boolean':
      return typeof value === 'boolean' ? value : declaration.default;
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value)
        ? withinBounds(declaration, Math.round(value))
        : declaration.default;
    case 'string':
      if (typeof value !== 'string') {
        return declaration.default;
      }
      if (declaration.enum !== undefined && !declaration.enum.includes(value)) {
        return declaration.default;
      }
      return value;
  }
}

function withinBounds(declaration: SettingDeclaration, value: number): number {
  const low = declaration.minimum ?? Number.NEGATIVE_INFINITY;
  const high = declaration.maximum ?? Number.POSITIVE_INFINITY;
  return Math.min(high, Math.max(low, value));
}
