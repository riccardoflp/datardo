/**
 * The commands of the runner area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('runner.log', 'Show log'),
  command('runner.cancel', 'Cancel work in progress'),
];
