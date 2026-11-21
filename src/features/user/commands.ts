/**
 * The commands of the user area, each on the Commands line of its card (R2.3), which `src/features/commands.ts`
 * gathers, and whether each is offered now. Those that act on a user or a role act on the selected row of the Users
 * and roles page, or on what the inspector shows: they are offered while that page is the active tab.
 */
import type { ConnectionView } from '../../shared/connection';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import { activeTabOf, tabConnectionOf } from '../../shared/state/tabs';
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

/** The connection of the active tab, or the current one, as saved. */
function connectionNow(state: AppState): ConnectionView | undefined {
  const active = activeTabOf(state.tabs);
  const id = (active === undefined ? undefined : tabConnectionOf(active)) ?? state.nav.current;
  return id === undefined ? undefined : savedConnection(state.connections, id);
}

/** Whether the active tab is the Users and roles page (`user.show`), whose page is named `users`. */
export function isUsersPageActive(state: AppState): boolean {
  const active = activeTabOf(state.tabs);
  return active?.shows.kind === 'page' && active.shows.page === 'users';
}

/**
 * Whether a command of this area is offered now, as the **Offered when** of its card says, for Go to and its key: the
 * page on a MongoDB connection; a write on a connection that is not read-only, and on the page's selection for those
 * that act on a user or a role.
 */
export function isOffered(state: AppState, id: string): boolean {
  const connection = connectionNow(state);
  const writable = connection?.engine === 'mongodb' && !connection.readOnly;
  switch (id) {
    case 'user.show':
      return connection?.engine === 'mongodb';
    case 'user.create':
    case 'user.create-role':
      return writable;
    case 'user.change-password':
    case 'user.grant-role':
    case 'user.revoke-role':
    case 'user.delete':
    case 'user.edit-role':
    case 'user.delete-role':
      return writable && isUsersPageActive(state);
    default:
      return false;
  }
}
