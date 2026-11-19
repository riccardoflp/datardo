/**
 * The commands of the table area, each on the Commands line of its card (R2.3), with the title Go to shows. The keys
 * of the table (`F5`, `Ctrl+A`, `Ctrl+C`, `Esc`) belong to the table while it has the focus, so none is bound here.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('table.show', text.commands.show),
  command('table.refresh', text.commands.refresh),
  command('table.columns', text.commands.columns),
  command('table.expand', text.commands.expand),
  command('table.expand:all-levels', text.commands.expandAll),
  command('table.collapse', text.commands.collapse),
  command('table.arrange-columns:hide', text.commands.hide),
  command('table.arrange-columns:show-all', text.commands.showAll),
  command('table.arrange-columns:pin', text.commands.pin),
  command('table.arrange-columns:unpin', text.commands.unpin),
  command('table.arrange-columns:move-left', text.commands.moveLeft),
  command('table.arrange-columns:move-right', text.commands.moveRight),
  command('table.arrange-columns:reset-width', text.commands.resetWidth),
  command('table.arrange-columns:reset', text.commands.reset),
  command('table.sort', text.commands.sort),
  command('table.paging:next', text.commands.next),
  command('table.paging:previous', text.commands.previous),
  command('table.paging:first', text.commands.first),
  command('table.selection:all', text.commands.selectAll),
  command('table.selection:clear', text.commands.clearSelection),
  command('table.copy-as', text.commands.copyAs),
  command('table.copy-as:mongosh', text.commands.copyAsMongosh),
  command('table.copy-as:extended-json', text.commands.copyAsExtendedJson),
  command('table.copy-as:json-lines', text.commands.copyAsJsonLines),
  command('table.copy-as:json', text.commands.copyAsJson),
  command('table.copy-as:yaml', text.commands.copyAsYaml),
  command('table.copy-as:insert-command', text.commands.copyAsInsert),
  command('table.copy-as:csv', text.commands.copyAsCsv),
  command('table.copy-value', text.commands.copyValue),
  command('table.copy-path', text.commands.copyPath),
];
