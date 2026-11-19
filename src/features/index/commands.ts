/**
 * The commands of the index area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('index.show', text.commands.show),
  command('index.create', text.commands.create),
  command('index.edit', text.commands.edit),
  command('index.hide', text.commands.hide),
  command('index.drop', text.commands.drop),
  command('index.create-search', text.commands.createSearch),
  command('index.edit-search', text.commands.editSearch),
  command('index.drop-search', text.commands.dropSearch),
];
