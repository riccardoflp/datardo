/**
 * The commands of the value area, each on the Commands line of its card (R2.3), with the title Go to shows. The cards
 * that name no title in Go to have the title of their action.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('value.refresh', 'Refresh value', 'F5'),
  command('value.copy', 'Copy value'),
  command('value.save-string', 'Save value', 'Ctrl+S'),
  command('value.add-field', 'Add field…'),
  command('value.edit-field', 'Edit field'),
  command('value.rename-field', 'Rename field…'),
  command('value.remove-fields', 'Remove fields…'),
  command('value.push-element', 'Push element…'),
  command('value.edit-element', 'Edit element'),
  command('value.remove-elements', 'Remove elements…'),
  command('value.trim-list', 'Trim list…'),
  command('value.add-member', 'Add member…'),
  command('value.remove-members', 'Remove members…'),
  command('value.add-scored-member', 'Add member…'),
  command('value.change-score', 'Change score'),
  command('value.remove-scored-members', 'Remove members…'),
  command('value.add-entry', 'Add entry…'),
  command('value.delete-entries', 'Delete entries…'),
  command('value.trim-stream', 'Trim stream…'),
];
