/**
 * Feature: settings.validate
 *
 * Whether a value typed for a setting is accepted, and why not, while the user types: the message shown under the
 * field. A value it accepts is given to the setting as it is: `settings.read` never changes it.
 */
import { settingsText } from './text';
import type { SettingDeclaration, SettingsSchema, SettingValue } from './types';

/** A key separator has at most 8 characters (Datardo's choice). */
export const longestSeparator = 8;

/** The characters that mean something in a pattern of keys, which a separator cannot hold. */
const patternCharacters = /[*?[\]\\]/u;

/** Feature: settings.validate. Nothing when the text is accepted, or the message to show under the field. */
export function settingProblem(schema: SettingsSchema, name: string, value: string): string | undefined {
  const declaration = schema.properties[name];
  if (declaration === undefined) {
    return settingsText.unknown(name);
  }
  switch (declaration.type) {
    case 'integer':
      return numberProblem(name, declaration, value);
    case 'string':
      return textProblem(name, declaration, value);
    case 'boolean':
      return value === 'true' || value === 'false' ? undefined : settingsText.onOrOff;
  }
}

/** The value of an accepted text, of the type the setting declares; `undefined` when it is not accepted. */
export function settingFromText(schema: SettingsSchema, name: string, value: string): SettingValue | undefined {
  const declaration = schema.properties[name];
  if (declaration === undefined || settingProblem(schema, name, value) !== undefined) {
    return undefined;
  }
  switch (declaration.type) {
    case 'integer':
      return Number(value.trim());
    case 'boolean':
      return value === 'true';
    case 'string':
      return value;
  }
}

/** A value as the field shows it: the number or the text; a switch's `true` or `false`. */
export function settingAsText(value: SettingValue): string {
  return String(value);
}

function numberProblem(name: string, declaration: SettingDeclaration, value: string): string | undefined {
  const low = declaration.minimum ?? 0;
  const high = declaration.maximum;
  const text = value.trim();
  const number = Number(text);
  const accepted = /^-?\d+$/u.test(text) && number >= low && (high === undefined || number <= high);
  if (accepted) {
    return undefined;
  }
  if (name === 'datardo.mcp.port') {
    return settingsText.port(low, high ?? 65535);
  }
  return high === undefined ? settingsText.wholeNumberFrom(low) : settingsText.wholeNumberWithin(low, high);
}

function textProblem(name: string, declaration: SettingDeclaration, value: string): string | undefined {
  if (declaration.enum !== undefined) {
    return declaration.enum.includes(value) ? undefined : settingsText.oneOf(declaration.enum);
  }
  if ((declaration.minLength ?? 0) > 0 && value === '') {
    return settingsText.notEmpty;
  }
  if (name === 'datardo.key.separator' && patternCharacters.test(value)) {
    return settingsText.separatorCharacters;
  }
  const longest = name === 'datardo.key.separator' ? longestSeparator : declaration.maxLength;
  return longest !== undefined && Array.from(value).length > longest ? settingsText.atMost(longest) : undefined;
}
