/**
 * The commands of the playground area, each on the Commands line of its card (R2.3), with the title Go to shows and
 * the key that starts it. `Ctrl+Enter` runs the selected text, or the whole script when nothing is selected; the keys
 * of a playground act while its tab is active.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('playground.open', text.commands.open),
  command('playground.open-file', text.commands.openFile, 'Ctrl+O'),
  command('playground.save', text.commands.save, 'Ctrl+S'),
  command('playground.save:as', text.commands.saveAs, 'Ctrl+Shift+S'),
  command('playground.target', text.commands.target),
  command('playground.run:all', text.commands.runAll),
  command('playground.run:selection', text.commands.runSelection, 'Ctrl+Enter'),
  command('playground.run:statement', text.commands.runStatement, 'Ctrl+Shift+Enter'),
  command('playground.stop', text.commands.stop),
];
