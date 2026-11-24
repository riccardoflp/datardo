/**
 * Feature: settings.page
 *
 * One page lists every setting by group, with what it does, its value and its default; a change takes effect at once.
 * `view` says what the page shows for the settings and the filter typed; `open` is what `Ctrl+,`, **Settings** of the
 * rail and Go to start, which shows the page, at a group when asked.
 */
import type { Json } from '../../shared/engine-request';
import { featureId } from '../../shared/ids';
import { run, type OperationFeature } from '../../shared/feature';
import type { SettingsState } from '../../shared/state/settings';
import { settingsPlan } from './change';
import { settingValue, settingsSchema } from './read';
import { isOffered } from './reset';
import { settingsText } from './text';
import type { SettingDeclaration, SettingName, SettingsSchema, SettingValue } from './types';

/** The groups of the page, in this order (settings.page, "Shows"). */
export const settingGroups = [
  'Window',
  'Tabs',
  'Notifications',
  'Queries',
  'Relationships',
  'Undo history',
  'Scheduled tasks',
  'MCP server',
  'Redis keys',
  'Redis console',
] as const;

/** The control of a setting: a switch for on and off, a number field, a menu of choices, a text field. */
export type SettingControl = 'switch' | 'number' | 'menu' | 'text';

/** One setting as the page shows it. */
export interface SettingRow {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly control: SettingControl;
  readonly value: SettingValue;
  readonly default: SettingValue;
  /** Its value differs from its default: a dot before the title, and **Reset** beside the control. */
  readonly changed: boolean;
  readonly choices?: readonly string[];
  /** The name the menu shows for each choice, in the same order. */
  readonly choiceTitles?: readonly string[];
}

/** One group of settings, under its heading. */
export interface SettingGroup {
  readonly title: string;
  readonly rows: readonly SettingRow[];
}

/** What the page shows. */
export interface SettingsPageView {
  /** The groups with a setting left by the filter, in the page's order. */
  readonly groups: readonly SettingGroup[];
  /** The list at the left: the groups shown. */
  readonly groupList: readonly string[];
  /** *No setting matches "…".* when the filter leaves nothing. */
  readonly empty?: string;
  /** The line at the top when `settings.json` was written by a newer Datardo; the controls are then disabled. */
  readonly newerVersion?: string;
  readonly disabled: boolean;
  /** **Reset all settings…** is enabled: a setting is not at its default. */
  readonly canResetAll: boolean;
}

/** What the page is drawn from: the settings and the filter typed. */
export interface SettingsPageState {
  readonly settings: SettingsState;
  readonly filter: string;
}

/** Feature: settings.page. What the Settings page shows. */
export function view(state: SettingsPageState, schema: SettingsSchema = settingsSchema): SettingsPageView {
  const words = state.filter
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => word !== '');
  const rows = Object.entries(schema.properties)
    .map(([name, declaration]) => row(schema, state.settings, name, declaration))
    .filter((setting) => words.every((word) => matchText(setting).includes(word)));
  const groups = settingGroups
    .map((title) => ({ title, rows: rows.filter((setting) => groupOf(schema, setting.name) === title) }))
    .filter((group) => group.rows.length > 0);
  const filter = state.filter.trim();
  return {
    groups,
    groupList: groups.map((group) => group.title),
    disabled: !state.settings.writable,
    canResetAll: state.settings.writable && isOffered(state.settings),
    ...(groups.length === 0 ? { empty: settingsText.noMatch(filter) } : {}),
    ...(state.settings.writable ? {} : { newerVersion: settingsText.newerVersion }),
  };
}

function row(
  schema: SettingsSchema,
  settings: SettingsState,
  name: string,
  declaration: SettingDeclaration,
): SettingRow {
  const value: SettingValue = settingValue(schema, settings.stored, name as SettingName);
  return {
    name,
    title: declaration.title,
    description: declaration.description,
    control: controlOf(declaration),
    value,
    default: declaration.default,
    changed: value !== declaration.default,
    ...(declaration.enum === undefined ? {} : { choices: declaration.enum }),
    ...(declaration['x-enumTitles'] === undefined ? {} : { choiceTitles: declaration['x-enumTitles'] }),
  };
}

function controlOf(declaration: SettingDeclaration): SettingControl {
  switch (declaration.type) {
    case 'boolean':
      return 'switch';
    case 'integer':
      return 'number';
    case 'string':
      return declaration.enum === undefined ? 'text' : 'menu';
  }
}

function groupOf(schema: SettingsSchema, name: string): string {
  return schema.properties[name]?.['x-group'] ?? '';
}

function matchText(setting: SettingRow): string {
  return `${setting.title} ${setting.description} ${setting.name}`.toLowerCase();
}

/** What opening the page is started with: the group to show, when one is asked (`{ group: 'Undo history' }`). */
function groupAsked(args: Json | undefined): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  const group = (args as { readonly group?: Json }).group;
  return typeof group === 'string' ? group : undefined;
}

/** Feature: settings.page. Opening the page: no step; what follows shows it, at a group when one is asked. */
export const open: OperationFeature = {
  kind: 'operation',
  id: featureId('settings.page'),
  plan: (_context, answers) => {
    const group = groupAsked(answers['args'] as Json | undefined);
    return run({
      ...settingsPlan(settingsText.title, []),
      after: [{ kind: 'open', page: 'settings', ...(group === undefined ? {} : { at: group }) }],
    });
  },
};
