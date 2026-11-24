/**
 * The commands of the nav area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('nav.toggle-explorer', text.commands.toggleExplorer, 'Ctrl+B'),
  command('nav.toggle-inspector', text.commands.toggleInspector, 'Ctrl+Shift+B'),
  command('nav.toggle-inspector:formatting', text.commands.formattingRules, 'Ctrl+Shift+F'),
  command('nav.toggle-inspector:selection', text.commands.inspectSelection),
  command('nav.switch-connection', text.commands.switchConnection, 'Ctrl+Shift+O'),
  command('nav.back:back', text.commands.back, 'Alt+Left'),
  command('nav.back:forward', text.commands.forward, 'Alt+Right'),
  command('nav.focus-island:next', text.commands.focusNext, 'F6'),
  command('nav.focus-island:previous', text.commands.focusPrevious, 'Shift+F6'),
  command('nav.pin', text.commands.pin),
  command('nav.copy-path', text.commands.copyPath),
  command('nav.open-on-another-connection', text.commands.openOnAnother),
  command('nav.resize:reset', text.commands.resetWidths),
];
