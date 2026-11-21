/**
 * The commands of the value area, each on the Commands line of its card (R2.3), with the title Go to shows. The cards
 * that name no title in Go to have the title of their action. Their keys belong to the key tab and to the editor that
 * has the focus, which bind them: `F5` is the key of **Refresh keys** (`key.refresh`), which a key tab carries out as
 * `value.refresh`, and `Ctrl+S` is the string editor's.
 */
import { command, type Command } from '../command';

/** The commands of this area, in the order Go to lists them. */
export const commands: readonly Command[] = [
  command('value.refresh', 'Refresh value'),
  // `table.copy-value` is **Copy value** in Go to too, and no two commands have one title (palette.commands; Q67).
  command('value.copy', 'Copy Redis value'),
  command('value.save-string', 'Save value'),
  command('value.add-field', 'Add field…'),
  command('value.edit-field', 'Edit field'),
  command('value.rename-field', 'Rename field…'),
  command('value.remove-fields', 'Remove fields…'),
];

/** The commands of the cards of lists, sets, sorted sets and streams, registered when those cards are built (M15). */
export const laterCommands: readonly Command[] = [
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
