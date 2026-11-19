/**
 * The commands of the schema area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('schema.show', text.commands.show),
  command('schema.sample', text.commands.sample),
];
