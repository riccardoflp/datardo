/**
 * The commands of the user area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers. Those that act on a user or a role act on the selected row of the page, or on what the inspector shows.
 */
import { command, type Command } from '../command';
import { text } from './text';

/** The commands of the user area, in the order Go to lists them. */
export const areaCommands: readonly Command[] = [
  command('user.show', text.commands.show),
  command('user.create', text.commands.create),
  command('user.change-password', text.commands.changePassword),
  command('user.grant-role', text.commands.grantRole),
  command('user.revoke-role', text.commands.revokeRole),
  command('user.delete', text.commands.delete),
  command('user.create-role', text.commands.createRole),
  command('user.edit-role', text.commands.editRole),
  command('user.delete-role', text.commands.deleteRole),
];
