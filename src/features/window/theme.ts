/**
 * Feature: window.theme
 *
 * The colors of the window: dark, light, or as the system.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import type { SettingsState } from '../../shared/state/settings';
import { setting } from '../settings/read';
import type { ThemeInUse } from './frame';
import { settingStep, variantOf, windowPlan } from './types';

/** The three choices of the setting `datardo.window.theme`. */
export type ThemeChoice = 'system' | 'dark' | 'light';

/** The name of each choice, as the menus and the steps write it. */
export const themeNames: Readonly<Record<ThemeChoice, string>> = {
  system: 'Follow the system',
  dark: 'Dark',
  light: 'Light',
};

/** The choice in use: the setting, read as `system` when it is none of the three. */
export function themeChoice(settings: SettingsState): ThemeChoice {
  return setting(settings, 'datardo.window.theme');
}

/** The theme the window shows: the choice, or the system's colors when the choice is `system`. */
export function themeInUse(choice: ThemeChoice, systemIsDark: boolean): ThemeInUse {
  if (choice === 'system') {
    return systemIsDark ? 'dark' : 'light';
  }
  return choice;
}

/**
 * Feature: window.theme
 *
 * One app step, `set the theme to Dark`, which writes `datardo.window.theme`; the window follows the setting at once.
 */
export function plan(_context: Context, answers: Answers): Outcome {
  const choice = variantOf<ThemeChoice>(answers, ['system', 'dark', 'light']);
  if (choice === undefined) {
    return run(windowPlan('Theme', []));
  }
  const name = themeNames[choice];
  return run(
    windowPlan(`Theme: ${name.toLowerCase()}`, [
      settingStep(`set the theme to ${name}`, 'datardo.window.theme', choice),
    ]),
  );
}
