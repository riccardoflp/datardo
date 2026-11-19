/**
 * The commands of the document area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. Those that act on a document act on the selected row, or on the active document tab. Their keys (`F2`,
 * `Delete`, `Ctrl+S`) belong to the table and to the editor that has the focus, which bind them.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the document area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [
  command('document.inspect', text.commands.inspect),
  command('document.open', text.commands.open),
  command('document.inline-edit', text.commands.inlineEdit),
  command('document.save', text.commands.save),
  command('document.insert', text.commands.insert),
  command('document.duplicate', text.commands.duplicate),
  command('document.delete', text.commands.delete),
  command('document.update-many', text.commands.updateMany),
  command('document.delete-many', text.commands.deleteMany),
];
