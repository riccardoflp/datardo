/**
 * The commands of the saved-query area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. They act on the collection of the active tab, or on the current connection.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the saved-query area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('saved-query.show', text.commands.show),
  command('saved-query.save', text.commands.save),
  command('saved-query.save:folder', text.commands.saveInFolder),
  command('saved-query.clear-recent', text.commands.clearRecent),
  command('saved-query.choose-folder', text.commands.chooseFolder),
];
