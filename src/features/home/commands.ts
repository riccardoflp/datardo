/**
 * The commands of the Home area, each on the Commands line of its card (R2.3), with the title Go to shows.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [command('home.show', text.commands.show, 'Alt+Home')];
