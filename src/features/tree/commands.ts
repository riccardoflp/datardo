/**
 * The commands of the tree area, each on the Commands line of its card (R2.3), with the title Go to shows. `F5` and
 * `Ctrl+F` act only while the tree island has the focus (`tree.keyboard`), so they are not the commands' keys.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('tree.refresh', text.commands.refresh),
  command('tree.filter', text.commands.filter),
];
