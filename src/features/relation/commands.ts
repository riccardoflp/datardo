/**
 * The commands of the relation area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. **Relationship diagram** opens the diagram of the database of the active tab; **Open referenced document**
 * follows the reference of the selected cell (`Ctrl+Enter`, which the table binds).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the relation area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [
  command('relation.diagram', text.commands.diagram),
  command('relation.open-referenced', text.commands.openReferenced),
];
