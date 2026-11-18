/**
 * The commands of the tab area, each on the Commands line of its card (R2.3). `Ctrl+PageDown` and `Ctrl+PageUp` are
 * second keys of **Next tab** and **Previous tab**, taken by the strip's keys.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('tab.activate:next', text.commands.next, 'Ctrl+Tab'),
  command('tab.activate:previous', text.commands.previous, 'Ctrl+Shift+Tab'),
  command('tab.activate:1', text.commands.goTo(1), 'Ctrl+1'),
  command('tab.activate:2', text.commands.goTo(2), 'Ctrl+2'),
  command('tab.activate:3', text.commands.goTo(3), 'Ctrl+3'),
  command('tab.activate:4', text.commands.goTo(4), 'Ctrl+4'),
  command('tab.activate:5', text.commands.goTo(5), 'Ctrl+5'),
  command('tab.activate:6', text.commands.goTo(6), 'Ctrl+6'),
  command('tab.activate:7', text.commands.goTo(7), 'Ctrl+7'),
  command('tab.activate:8', text.commands.goTo(8), 'Ctrl+8'),
  command('tab.activate:last', text.commands.last, 'Ctrl+9'),
  command('tab.close', text.commands.close, 'Ctrl+W'),
  command('tab.close-many:others', text.commands.closeOthers),
  command('tab.close-many:connection', text.commands.closeConnection),
  command('tab.close-many:all', text.commands.closeAll),
  command('tab.reopen', text.commands.reopen, 'Ctrl+Shift+T'),
  command('tab.reorder:left', text.commands.moveLeft, 'Ctrl+Shift+PageUp'),
  command('tab.reorder:right', text.commands.moveRight, 'Ctrl+Shift+PageDown'),
  command('tab.collapse-group', text.commands.collapseGroup),
];
