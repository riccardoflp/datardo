/**
 * The commands of the query area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('query.bar', text.commands.bar, 'Ctrl+F'),
  command('query.run', text.commands.run, 'Ctrl+Enter'),
  command('query.reset', text.commands.reset),
  command('query.mode:find', text.commands.find),
  command('query.mode:aggregate', text.commands.aggregate),
  command('query.builder', text.commands.builder),
];
