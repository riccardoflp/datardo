/**
 * The commands of the connection area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('connection.add', 'Add connection'),
  command('connection.add:mongodb', 'Add MongoDB connection'),
  command('connection.add:redis', 'Add Redis connection'),
  command('connection.edit', 'Edit connection…'),
  command('connection.connect', 'Connect'),
  command('connection.disconnect', 'Disconnect'),
  command('connection.reconnect', 'Reconnect'),
  command('connection.overview', 'Overview'),
  command('connection.read-only', 'Make read-only'),
  command('connection.allow-changes', 'Allow changes'),
  command('connection.remove', 'Remove connection'),
];
