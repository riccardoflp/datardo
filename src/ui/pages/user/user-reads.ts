/**
 * The reads of a Users and roles tab (`user.show`, **Reads**), started through the bridge as the Read features the
 * runner carries out: the databases, the users, the roles (in two rounds with **All databases**) and, when the page
 * opens and when the connection is edited, who the connection is signed in as. The users and the roles are read
 * apart, so that one refused leaves the other shown; a reply older than the last request of its part is dropped.
 */
import type { RolesRead } from '../../../features/user/list-roles';
import {
  isLatestPageReply,
  pageReads,
  secondRolesRead,
  sendPageRequest,
  type PagePart,
  type PageReadInput,
  type PageReadReason,
} from '../../../features/user/page/reads';
import { databasesOffered } from '../../../features/user/show';
import type { SignedInUser, User } from '../../../features/user/types';
import type { IntentResult } from '../../../shared/bridge';
import type { ReadNeed } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import { currentAppState } from '../../state/store';
import { pageStateOf } from './user-state';
import { changeUsersTab, usersTabOf, type UsersTab } from './user-store';

/** Starts a Read of the page on the tab's connection and waits for what it gives. */
function readOn(state: UsersTab, need: ReadNeed): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(need.read),
    target: { kind: 'connection', connection: state.connection },
    place: 'toolbar',
    args: need.args,
  });
}

/** The server's message of a read that gave nothing. */
function messageOf(result: IntentResult): string {
  return result.kind === 'failed' || result.kind === 'refused' ? result.message : '';
}

/** The number of a new request of a part, kept in the tab. */
function sent(tab: string, part: PagePart): number {
  let number = 0;
  changeUsersTab(tab, (state) => {
    const next = sendPageRequest(state.requests, part);
    number = next.number;
    return { ...state, requests: next.requests };
  });
  return number;
}

/** Keeps what a part answered, unless a newer request of the part was sent meanwhile. */
function answered(tab: string, part: PagePart, number: number, change: (state: UsersTab) => UsersTab): void {
  changeUsersTab(tab, (state) => (isLatestPageReply(state.requests, part, number) ? change(state) : state));
}

function withUsers(state: UsersTab, result: IntentResult): UsersTab {
  return result.kind === 'read'
    ? { ...state, users: { items: result.result as readonly User[], loading: false } }
    : { ...state, users: { items: [], loading: false, error: messageOf(result) } };
}

function withRoles(state: UsersTab, result: IntentResult): UsersTab {
  const read = result.kind === 'read' ? (result.result as RolesRead) : undefined;
  return read?.kind === 'roles'
    ? { ...state, roles: { items: read.roles, loading: false } }
    : { ...state, roles: { items: [], loading: false, error: messageOf(result) } };
}

/** The databases the page lists, for the second round of the roles. */
function known(tab: string): readonly string[] {
  const state = usersTabOf(tab);
  return state === undefined ? [] : databasesOffered(pageStateOf(currentAppState(), state));
}

/** The roles: one round for a database, two for **All databases**; the second waits for the databases read. */
async function readRoles(tab: string, need: ReadNeed, input: PageReadInput, listed: Promise<void>): Promise<void> {
  const number = sent(tab, 'roles');
  const state = usersTabOf(tab);
  if (state === undefined) {
    return;
  }
  const first = await readOn(state, need);
  const firstRead = first.kind === 'read' ? (first.result as RolesRead) : null;
  if (input.database !== undefined || firstRead?.kind === 'roles') {
    answered(tab, 'roles', number, (now) => withRoles(now, first));
    return;
  }
  await listed;
  const asked = secondRolesRead({ ...input, known: known(tab) }, firstRead);
  const result = asked === undefined ? first : await readOn(state, asked);
  answered(tab, 'roles', number, (now) => withRoles(now, result));
}

/** Reads one part other than the roles and keeps its reply. */
async function readPart(tab: string, need: ReadNeed): Promise<void> {
  const part = need.key as PagePart;
  const number = sent(tab, part);
  const state = usersTabOf(tab);
  if (state === undefined) {
    return;
  }
  const result = await readOn(state, need);
  answered(tab, part, number, (now) => withPart(now, part, result));
}

function withPart(state: UsersTab, part: PagePart, result: IntentResult): UsersTab {
  switch (part) {
    case 'databases': {
      // A refused `listDatabases` lists no database of its own: the others are still offered.
      const { listed: _dropped, ...rest } = state;
      return result.kind === 'read' ? { ...state, listed: result.result as readonly string[] } : rest;
    }
    case 'users':
      return withUsers(state, result);
    case 'signed-in':
      return {
        ...state,
        signedIn:
          result.kind === 'read'
            ? { kind: 'read', signedIn: result.result as SignedInUser }
            : { kind: 'failed', message: messageOf(result) },
      };
    case 'roles':
      return withRoles(state, result);
  }
}

/** Reads the page again for a reason: the rows stay, dimmed, while they are read. */
export async function readPage(tab: string, reason: PageReadReason): Promise<void> {
  changeUsersTab(tab, (state) => ({
    ...state,
    users: { ...state.users, loading: true },
    roles: { ...state.roles, loading: true },
  }));
  const state = usersTabOf(tab);
  if (state === undefined) {
    return;
  }
  const input: PageReadInput = {
    connection: state.connection,
    ...(state.database === undefined ? {} : { database: state.database }),
    builtIn: state.builtIn,
    known: known(tab),
  };
  const needs = pageReads(reason, input);
  const databases = needs.find((need) => need.key === 'databases');
  const listed = databases === undefined ? Promise.resolve() : readPart(tab, databases);
  await Promise.all([
    listed,
    ...needs
      .filter((need) => need.key !== 'databases')
      .map((need) => (need.key === 'roles' ? readRoles(tab, need, input, listed) : readPart(tab, need))),
  ]);
}
