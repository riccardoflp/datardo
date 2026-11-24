/**
 * The shapes of the settings: how `resources/settings.schema.json` declares one, and the type of each value.
 */

/** A value a setting can hold. */
export type SettingValue = boolean | number | string;

/** How the schema declares one setting. */
export interface SettingDeclaration {
  readonly type: 'boolean' | 'integer' | 'string';
  readonly default: SettingValue;
  readonly enum?: readonly string[];
  /** The name the menu of the Settings page shows for each value of `enum`, in its order; the value itself without. */
  readonly 'x-enumTitles'?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  /** The title in the Settings page. */
  readonly title: string;
  /** The group of the Settings page it is listed under. */
  readonly 'x-group': string;
  readonly description: string;
}

/** The schema of the settings: every setting by its full name. */
export interface SettingsSchema {
  readonly properties: Readonly<Record<string, SettingDeclaration>>;
}

/** The value of each setting, by its full name: the table of settings.md. */
export interface SettingValues {
  readonly 'datardo.window.theme': 'system' | 'dark' | 'light';
  readonly 'datardo.window.zoom': number;
  readonly 'datardo.window.checkForUpdates': boolean;
  readonly 'datardo.tab.restore': boolean;
  readonly 'datardo.runner.systemNotifications': boolean;
  readonly 'datardo.query.timeLimitSeconds': number;
  readonly 'datardo.query.position': 'top' | 'right';
  readonly 'datardo.relation.detect': boolean;
  readonly 'datardo.undo.enabled': boolean;
  readonly 'datardo.undo.maxSizeMb': number;
  readonly 'datardo.undo.maxDays': number;
  readonly 'datardo.undo.maxOperations': number;
  readonly 'datardo.undo.maxDocumentsPerOperation': number;
  readonly 'datardo.undo.maxOperationSizeMb': number;
  readonly 'datardo.task.keepRunningInTray': boolean;
  readonly 'datardo.mcp.enabled': boolean;
  readonly 'datardo.mcp.port': number;
  readonly 'datardo.mcp.readData': boolean;
  readonly 'datardo.key.separator': string;
  readonly 'datardo.console.historySize': number;
}

/** The full name of a setting. */
export type SettingName = keyof SettingValues;
