/**
 * The commands of the backup area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { createText, restoreText } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('backup.create', createText.command),
  command('backup.restore', restoreText.command),
];
