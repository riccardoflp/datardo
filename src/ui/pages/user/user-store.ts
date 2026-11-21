/**
 * What each Users and roles tab keeps in the window alone (`user.show`): the section shown, the database chosen, the
 * filter, **Built-in roles**, what was read of each part and the requests of each part, what is selected and what
 * **Grant** holds as typed. A tab's state lives until Datardo quits or the tab is closed; the database chosen is kept
 * with the tab as its section, which `user.show` sets.
 */
import { useSyncExternalStore } from 'react';
import type { PageRequests } from '../../../features/user/page/reads';
import type { ListState, UsersSection } from '../../../features/user/show';
import type { SignedInRead } from '../../../features/user/signed-in';
import type { Role, User } from '../../../features/user/types';
import type { ConnectionId } from '../../../shared/ids';

/** What is selected: a user or a role, by its whole name (`app@shop`). */
export interface UsersSelection {
  readonly kind: 'user' | 'role';
  readonly key: string;
}

/** What one Users and roles tab keeps. */
export interface UsersTab {
  readonly connection: ConnectionId;
  readonly section: UsersSection;
  /** The database chosen; `undefined` for **All databases**. */
  readonly database?: string;
  /** The section of the tab, as `user.show` last set it, once the page followed it. */
  readonly followed?: string;
  readonly filter: string;
  readonly builtIn: boolean;
  readonly listed?: readonly string[];
  readonly users: ListState<User>;
  readonly roles: ListState<Role>;
  readonly signedIn?: SignedInRead;
  readonly requests: PageRequests;
  readonly selected?: UsersSelection;
  /** What **Grant** holds, for the user it was typed for. */
  readonly grant?: { readonly user: string; readonly role: string; readonly database: string };
  /** The plans that asked the pages to read again, as counted when the page last read. */
  readonly refreshes: number;
  /** What the connection was when who signs in was read: when it changes, it is read again. */
  readonly connectionSeen?: string;
}

const tabs = new Map<string, UsersTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** A tab never shown in this run. */
export function freshUsersTab(connection: ConnectionId, refreshes: number): UsersTab {
  return {
    connection,
    section: 'users',
    filter: '',
    builtIn: false,
    users: { items: [], loading: false },
    roles: { items: [], loading: false },
    requests: {},
    refreshes,
  };
}

/** The state of a tab, when it was shown once. */
export function usersTabOf(tab: string): UsersTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepUsersTab(tab: string, state: UsersTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeUsersTab(tab: string, change: (state: UsersTab) => UsersTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the tabs that are closed. */
export function forgetClosedUsersTabs(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useUsersTab(tab: string | undefined): UsersTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
