/**
 * The commands of the window area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('window.zoom:in', 'Zoom in', 'Ctrl+='),
  command('window.zoom:out', 'Zoom out', 'Ctrl+-'),
  command('window.zoom:reset', 'Reset zoom', 'Ctrl+0'),
  command('window.theme:system', 'Theme: follow the system'),
  command('window.theme:dark', 'Theme: dark'),
  command('window.theme:light', 'Theme: light'),
  command('window.full-screen', 'Enter full screen', 'F11'),
  command('window.size:minimize', 'Minimize window'),
  command('window.size:maximize', 'Maximize window'),
  command('window.size:restore', 'Restore window'),
  command('window.close', 'Close window'),
  command('window.quit', 'Quit Datardo', 'Ctrl+Q'),
  command('window.about', 'About Datardo'),
  command('window.open-data-folder', 'Open data folder'),
  command('window.check-update', 'Check for updates'),
];
