/**
 * The commands of the structure area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers: **Compare structure with…**, for the database of the active tab.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [command('structure.show', text.show.commandTitle)];
