/**
 * The commands of the manage area, each on the Commands line of its card (R2.3).
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('manage.create-database', text.commands.createDatabase),
  command('manage.create-collection', text.commands.createCollection),
  command('manage.rename-collection', text.commands.renameCollection),
  command('manage.drop-collection', text.commands.dropCollection),
  command('manage.drop-database', text.commands.dropDatabase),
  command('manage.definition', text.commands.definition),
  command('manage.edit-view', text.commands.editView),
  command('manage.validation', text.commands.validation),
  command('manage.edit-validation', text.commands.editValidation),
];
