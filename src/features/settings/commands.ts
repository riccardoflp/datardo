/**
 * The commands of the settings area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('settings.page', 'Settings', 'Ctrl+,'),
  command('settings.reset', 'Reset all settings…'),
];
