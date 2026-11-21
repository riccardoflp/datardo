/**
 * The states the Views of the Users and roles page are drawn from (`user.show`, `user.inspect`), made of what a tab
 * keeps and the app's state; and what the page adds to the active tab for the status line and the inspector island
 * (`nav.status-line`, `nav.inspector`).
 */
import type { Inspection } from '../../../features/nav/types';
import type { InspectState } from '../../../features/user/inspect';
import { usersPage, view, type UsersPageState } from '../../../features/user/show';
import { text } from '../../../features/user/text';
import { roleKey, userKey, type Role, type User } from '../../../features/user/types';
import type { ConnectionId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { savedConnection } from '../../../shared/state/connections';
import { activeTabOf } from '../../../shared/state/tabs';
import { usersTabOf, type UsersTab } from './user-store';

/** Whether the connection is read-only now; a connection no longer saved writes nothing. */
export function isReadOnly(app: AppState, connection: ConnectionId): boolean {
  return savedConnection(app.connections, connection)?.readOnly ?? true;
}

/** The state of the page's View. */
export function pageStateOf(app: AppState, tab: UsersTab): UsersPageState {
  return {
    connection: tab.connection,
    readOnly: isReadOnly(app, tab.connection),
    section: tab.section,
    ...(tab.database === undefined ? {} : { database: tab.database }),
    filter: tab.filter,
    builtIn: tab.builtIn,
    ...(tab.listed === undefined ? {} : { listed: tab.listed }),
    users: tab.users,
    roles: tab.roles,
    ...(tab.signedIn === undefined ? {} : { signedIn: tab.signedIn }),
  };
}

/** The user selected, while it is listed. */
export function selectedUser(tab: UsersTab): User | undefined {
  const selected = tab.selected;
  return selected?.kind === 'user' ? tab.users.items.find((user) => userKey(user) === selected.key) : undefined;
}

/** The role selected, while it is listed. */
export function selectedRole(tab: UsersTab): Role | undefined {
  const selected = tab.selected;
  return selected?.kind === 'role' ? tab.roles.items.find((role) => roleKey(role) === selected.key) : undefined;
}

/** The state of the inspector of what is selected; `undefined` when nothing listed is. */
export function inspectStateOf(app: AppState, tab: UsersTab): InspectState | undefined {
  const user = selectedUser(tab);
  const role = selectedRole(tab);
  const chosen: InspectState['selected'] | undefined =
    user !== undefined ? { kind: 'user', user } : role !== undefined ? { kind: 'role', role } : undefined;
  if (chosen === undefined) {
    return undefined;
  }
  const signedIn = tab.signedIn?.kind === 'read' ? tab.signedIn.signedIn : undefined;
  const grant = user !== undefined && tab.grant?.user === userKey(user) ? tab.grant : undefined;
  return {
    connection: tab.connection,
    readOnly: isReadOnly(app, tab.connection),
    selected: chosen,
    users: tab.users.items,
    roles: tab.roles.items,
    ...(signedIn === undefined ? {} : { signedIn }),
    ...(grant === undefined ? {} : { grant: { role: grant.role, database: grant.database } }),
  };
}

/** The Users and roles tab that is active, with its state, when there is one. */
export function activeUsersTab(app: AppState): { readonly id: string; readonly tab: UsersTab } | undefined {
  const active = activeTabOf(app.tabs);
  if (active?.shows.kind !== 'page' || active.shows.page !== usersPage) {
    return undefined;
  }
  const tab = usersTabOf(active.id);
  return tab === undefined ? undefined : { id: active.id, tab };
}

/** What a Users and roles tab adds to the active tab: the count of its section, and what the inspector shows. */
export function usersExtras(app: AppState, tabId: string): { count?: string; inspection?: Inspection } {
  const tab = usersTabOf(tabId);
  if (tab === undefined) {
    return {};
  }
  const shown = view(pageStateOf(app, tab));
  const count = tab.section === 'users' ? shown.users.count : shown.roles.count;
  const inspected = selectedUser(tab) ?? selectedRole(tab);
  const title = inspected === undefined ? undefined : 'user' in inspected ? userKey(inspected) : roleKey(inspected);
  return {
    ...(count === '' ? {} : { count }),
    inspection:
      title === undefined ? { selected: 0, emptyLine: text.window.emptyLine } : { selected: 1, title, emptyLine: '' },
  };
}
