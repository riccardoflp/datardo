/**
 * The commands of the console area, each on the Commands line of its card (R2.3), with the title Go to shows.
 * `Ctrl+L` clears the output from the input only, where the editor takes it.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('console.show', text.commands.show),
  command('console.run', text.commands.run),
  command('console.stop', text.commands.stop),
  command('console.clear', text.commands.clear),
  command('console.clear-history', text.commands.clearHistory),
  command('console.copy-reply:reply', text.commands.copyReply),
  command('console.copy-reply:value', text.commands.copyValue),
  command('console.copy-reply:command', text.commands.copyCommand),
];
