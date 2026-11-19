/**
 * The commands of the keys area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('key.show', 'Open keys'),
  command('key.refresh', 'Refresh keys', 'F5'),
  command('key.open', 'Open key…'),
  command('key.new', 'New key…'),
  command('key.rename', 'Rename key…'),
  command('key.copy', 'Copy key to…'),
  command('key.set-expiry', 'Set expiry…'),
  command('key.persist', 'Make key persistent'),
  command('key.copy-name', 'Copy key name'),
  command('key.delete', 'Delete key…'),
  command('key.delete-selected', 'Delete selected keys…'),
  command('key.delete-by-pattern', 'Delete keys by pattern…'),
  command('key.export', 'Export keys…'),
  command('key.import', 'Import keys…'),
  command('key.switch-database', 'Switch database…'),
];
