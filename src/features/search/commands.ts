/**
 * The commands of the search area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. **Search documents** opens the Search documents page of the current connection.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the search area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [command('search.show', text.commands.show)];
