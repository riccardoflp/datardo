/**
 * The text of the interface of the settings area, word for word from its cards (R10.1).
 */
import { groupThousands } from '../../shared/text-units';

/** The texts of the Settings page and of its features. */
export const settingsText = {
  title: 'Settings',
  filter: 'Filter settings',
  groups: 'Groups',
  reset: 'Reset',
  resetAll: 'Reset all settings…',
  resetAllButton: 'Reset all',
  resetAllQuestion: 'Reset all settings to their defaults?',
  resetAllTitle: 'Reset all settings',
  resetOneTitle: 'Reset a setting',
  changeTitle: 'Change a setting',
  clearFilter: 'Clear filter',
  aboutDatardo: 'About Datardo',
  openDataFolder: 'Open data folder',
  changed: 'Changed from its default',
  resetAllUndo: 'It cannot be undone: the values above are lost.',
  nothingToUndo: 'Nothing is written to a deployment; Reset puts the default back.',
  newerVersion:
    'These settings were written by a newer version of Datardo. Changes are not saved until Datardo is updated.',
  noMatch: (filter: string): string => `No setting matches "${filter}".`,
  notEmpty: "This can't be empty.",
  port: (low: number, high: number): string => `Enter a port from ${String(low)} to ${String(high)}.`,
  wholeNumberWithin: (low: number, high: number): string =>
    `Enter a whole number from ${groupThousands(low)} to ${groupThousands(high)}.`,
  wholeNumberFrom: (low: number): string => `Enter a whole number, ${groupThousands(low)} or more.`,
  atMost: (characters: number): string => `Enter at most ${String(characters)} characters.`,
  separatorCharacters: "The separator can't contain *, ?, [, ] or \\.",
  oneOf: (choices: readonly string[]): string => `Choose one of ${choices.join(', ')}.`,
  onOrOff: 'Choose on or off.',
  unknown: (name: string): string => `Datardo has no setting named ${name}.`,
  set: (name: string, value: string): string => `set ${name} to ${value}`,
  resetTo: (name: string, value: string): string => `reset ${name} to ${value}`,
  valueNow: (title: string, value: string): string => `${title}: ${value}`,
  settingsCount: (count: number): string => `${String(count)} ${count === 1 ? 'setting' : 'settings'}`,
  on: 'on',
  off: 'off',
} as const;
