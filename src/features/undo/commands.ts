/**
 * The commands of the undo history, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('undo.show', 'Undo history'),
  command('undo.last', 'Undo last change'),
  command('undo.clear', 'Clear undo history'),
  command('undo.per-connection:stop', 'Stop keeping undo history'),
  command('undo.per-connection:keep', 'Keep undo history'),
];
