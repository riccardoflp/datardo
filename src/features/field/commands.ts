/**
 * The commands of the column actions, each on the Commands line of its card (R2.3), with the title Go to shows. Each
 * acts on the column of the selected cell.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('field.rename', text.commands.rename),
  command('field.remove', text.commands.remove),
  command('field.convert-type', text.commands.convert),
];
