/**
 * The commands of the scheduled tasks area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('task.show', 'Scheduled tasks'),
  command('task.edit', 'New scheduled task…'),
];
