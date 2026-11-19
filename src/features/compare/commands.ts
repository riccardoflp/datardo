/**
 * The commands of the compare area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. **Compare with…** compares the collection of the active tab.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the compare area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [command('compare.show', text.commands.show)];
