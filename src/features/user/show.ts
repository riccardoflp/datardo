/**
 * Feature: user.show
 *
 * The Users and roles page of a MongoDB connection, in a tab of its own, one per connection: the section bar
 * (**Users**, **Roles**), the toolbar (**Database**, the filter, **Refresh**), who the connection is signed in as, and
 * the table of each section with its count, its empty state and its error. The filter narrows both tables as it is
 * typed, without reading again. `view` says what is shown; `page/reads.ts` says what is read and when; `plan` is what
 * the tree's database menu and Go to start: the tab of the page, with the database asked for as its section (a tab of
 * the page is one per connection, and its section is what each request gives an open tab). Ported from Mongoster's
 * `UsersPanel`, `load`, `renderUsers` and `renderRoles`.
 */
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { appPlan } from '../nav/types';
import { connectionPageShows } from '../palette/sources';
import { planOf } from '../tab/open';
import { privilegeSummary } from './privilege-summary';
import { roleLabel } from './role-reference';
import { signedInText, type SignedInRead } from './signed-in';
import { text } from './text';
import {
  isSignedInAs,
  roleKey,
  startArgs,
  startControl,
  textOf,
  userKey,
  type Role,
  type User,
  type UserControl,
} from './types';

/** The page's name in a tab and in its path. */
export const usersPage = 'users';

/** The two sections of the page. */
export type UsersSection = 'users' | 'roles';

/** What a table of the page holds: what was read (kept while it is read again), or the server's message. */
export interface ListState<T> {
  readonly items: readonly T[];
  readonly loading: boolean;
  readonly error?: string;
}

/** What the page is drawn from. */
export interface UsersPageState {
  readonly connection: ConnectionId;
  readonly readOnly: boolean;
  readonly section: UsersSection;
  /** The database chosen; `undefined` for **All databases**. */
  readonly database?: string;
  readonly filter: string;
  readonly builtIn: boolean;
  /** What `listDatabases` answered; `undefined` when it was refused or not read yet. */
  readonly listed?: readonly string[];
  readonly users: ListState<User>;
  readonly roles: ListState<Role>;
  readonly signedIn?: SignedInRead;
}

/** The databases **Database** offers: `admin`, those listed and those of the users and roles read, and the one chosen. */
export function databasesOffered(state: UsersPageState): readonly string[] {
  const names = new Set<string>(['admin', ...(state.listed ?? [])]);
  state.users.items.forEach((user) => names.add(user.db));
  state.roles.items.forEach((role) => names.add(role.db));
  if (state.database !== undefined) {
    names.add(state.database);
  }
  return [...names].filter((name) => name !== 'local' && name !== 'config').sort((a, b) => a.localeCompare(b, 'en'));
}

/** Whether a user matches the filter: in its `name@database`, one of its roles written whole, or a mechanism. */
export function isUserShown(user: User, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return (
    needle === '' ||
    [userKey(user), ...user.roles.map(roleKey), ...user.mechanisms].some((each) => each.toLowerCase().includes(needle))
  );
}

/** Whether a role matches the filter: in its `name@database`, a role it inherits, a resource or an action. */
export function isRoleShown(role: Role, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  const words = [
    roleKey(role),
    ...role.roles.map(roleKey),
    ...role.privileges.flatMap((privilege) => [privilege.resource, ...privilege.actions]),
  ];
  return needle === '' || words.some((each) => each.toLowerCase().includes(needle));
}

/** A row of **Users**. */
export interface UserRow {
  readonly user: string;
  readonly you?: string;
  readonly database: string;
  readonly roles: string;
  /** The roles whole, one per line. */
  readonly rolesTooltip: string;
  readonly mechanisms: string;
  /** **Password…** and **Delete**, in the row's menu and its `…` button; none on a read-only connection. */
  readonly menu: readonly UserControl[];
}

/** A row of **Roles**. */
export interface RoleRow {
  readonly role: string;
  readonly builtIn?: string;
  readonly database: string;
  readonly privileges: string;
  readonly privilegesTooltip: string;
  readonly inherits: string;
  readonly inheritsTooltip: string;
  /** How many of the users listed have it; empty for none. */
  readonly users: string;
  /** **Edit…** and **Delete** for a custom role on a connection that is not read-only. */
  readonly menu: readonly UserControl[];
}

/** A section's table: its rows, or what takes their place. */
export interface SectionView<Row> {
  /** **Create user…** or **Create role…**; absent on a read-only connection. */
  readonly create?: UserControl;
  readonly count: string;
  readonly rows: readonly Row[];
  /** The rows are dimmed while they are read again. */
  readonly dimmed: boolean;
  readonly empty?: string;
  readonly error?: string;
}

/** What the page shows. */
export interface UsersPageView {
  readonly title: string;
  readonly sectionBar: readonly { readonly section: UsersSection; readonly label: string; readonly chosen: boolean }[];
  readonly toolbar: {
    readonly database: {
      readonly label: string;
      readonly value: string;
      readonly choices: readonly { readonly value: string; readonly label: string }[];
    };
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly refresh: { readonly label: string; readonly tooltip: string };
  };
  readonly signedIn?: string;
  readonly users: SectionView<UserRow>;
  readonly roles: SectionView<RoleRow> & {
    readonly builtIn: { readonly label: string; readonly tooltip: string; readonly checked: boolean };
  };
  readonly readOnly: boolean;
}

function userRow(state: UsersPageState, user: User): UserRow {
  const on = { connection: state.connection, database: user.db };
  const signedIn = state.signedIn?.kind === 'read' ? state.signedIn.signedIn : undefined;
  const menu = state.readOnly
    ? []
    : [
        startControl(
          text.menu.password,
          {
            element: 'user.change-password@row-menu',
            feature: 'user.change-password',
            tooltip: text.menu.passwordTooltip,
          },
          on,
          { user: user.user },
        ),
        startControl(
          text.menu.delete,
          { element: 'user.delete@row-menu', feature: 'user.delete', tooltip: text.menu.deleteUserTooltip },
          on,
          { user: user.user },
        ),
      ];
  return {
    user: user.user,
    ...(isSignedInAs(signedIn, user) ? { you: text.users.you } : {}),
    database: user.db,
    roles: user.roles.length === 0 ? text.users.noRoles : user.roles.map((role) => roleLabel(role, user.db)).join(', '),
    rolesTooltip: user.roles.map(roleKey).join('\n'),
    mechanisms: user.mechanisms.join(', '),
    menu,
  };
}

function roleRow(state: UsersPageState, role: Role): RoleRow {
  const on = { connection: state.connection, database: role.db };
  const holders = state.users.items.filter((user) => user.roles.some((each) => roleKey(each) === roleKey(role))).length;
  const summary = privilegeSummary(role);
  const menu =
    state.readOnly || role.isBuiltin
      ? []
      : [
          startControl(
            text.menu.edit,
            { element: 'user.edit-role@row-menu', feature: 'user.edit-role', tooltip: text.menu.editTooltip },
            on,
            { role: role.role },
          ),
          startControl(
            text.menu.delete,
            { element: 'user.delete-role@row-menu', feature: 'user.delete-role', tooltip: text.menu.deleteRoleTooltip },
            on,
            { role: role.role },
          ),
        ];
  return {
    role: role.role,
    ...(role.isBuiltin ? { builtIn: text.roles.builtIn } : {}),
    database: role.db,
    privileges: summary,
    privilegesTooltip: summary,
    inherits: role.roles.map((each) => roleLabel(each, role.db)).join(', '),
    inheritsTooltip: role.roles.map(roleKey).join('\n'),
    users: holders === 0 ? '' : String(holders),
    menu,
  };
}

function usersSection(state: UsersPageState): SectionView<UserRow> {
  const all = state.users.items;
  const shown = all.filter((user) => isUserShown(user, state.filter));
  const empty =
    shown.length > 0
      ? undefined
      : all.length > 0
        ? text.users.noMatch
        : state.database === undefined
          ? text.users.none
          : text.users.noneIn(state.database);
  const on = { connection: state.connection, database: state.database ?? '' };
  return {
    ...(state.readOnly
      ? {}
      : {
          create: startControl(text.users.create, { element: 'user.create@toolbar', feature: 'user.create' }, on, {
            database: state.database ?? null,
          }),
        }),
    count: all.length === 0 ? '' : text.users.count(shown.length, all.length),
    rows: shown.map((user) => userRow(state, user)),
    dimmed: state.users.loading,
    ...(state.users.error === undefined
      ? empty === undefined || state.users.loading
        ? {}
        : { empty }
      : { error: state.users.error }),
  };
}

function rolesSection(state: UsersPageState): UsersPageView['roles'] {
  const all = state.roles.items;
  const shown = all.filter((role) => isRoleShown(role, state.filter));
  const custom = all.filter((role) => !role.isBuiltin).length;
  const empty =
    shown.length > 0
      ? undefined
      : all.length > 0
        ? text.roles.noMatch
        : state.database === undefined
          ? text.roles.none
          : text.roles.noneIn(state.database);
  const on = { connection: state.connection, database: state.database ?? '' };
  return {
    ...(state.readOnly
      ? {}
      : {
          create: startControl(
            text.roles.create,
            { element: 'user.create-role@toolbar', feature: 'user.create-role' },
            on,
            { database: state.database ?? null },
          ),
        }),
    builtIn: { label: text.toolbar.builtIn, tooltip: text.toolbar.builtInTooltip, checked: state.builtIn },
    count: all.length === 0 ? '' : text.roles.count(custom, all.length - custom),
    rows: shown.map((role) => roleRow(state, role)),
    dimmed: state.roles.loading,
    ...(state.roles.error === undefined
      ? empty === undefined || state.roles.loading
        ? {}
        : { empty }
      : { error: state.roles.error }),
  };
}

/** Feature: user.show — what the page shows. */
export function view(state: UsersPageState): UsersPageView {
  return {
    title: text.page,
    sectionBar: (['users', 'roles'] as const).map((section) => ({
      section,
      label: text.sections[section],
      chosen: section === state.section,
    })),
    toolbar: {
      database: {
        label: text.toolbar.database,
        value: state.database ?? '',
        choices: [
          { value: '', label: text.toolbar.allDatabases },
          ...databasesOffered(state).map((name) => ({ value: name, label: name })),
        ],
      },
      filter: { placeholder: text.toolbar.filter, value: state.filter },
      refresh: { label: text.toolbar.refresh, tooltip: text.toolbar.refreshTooltip },
    },
    ...(state.signedIn === undefined ? {} : { signedIn: signedInText(state.signedIn) }),
    users: usersSection(state),
    roles: rolesSection(state),
    readOnly: state.readOnly,
  };
}

/** The database a tab of the page was asked for: its section; **All databases** when it has none. */
export function databaseOfSection(section: string | undefined): string | undefined {
  return section === undefined || section === '' ? undefined : section;
}

/** Feature: user.show — the tab of the page of the connection, on the database asked for (`args.database`). */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const id = textOf(args, 'connection') ?? targetConnection(context.target) ?? context.state.nav.current;
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, connectionId(id));
  if (connection?.engine !== 'mongodb') {
    return run(appPlan(text.openPlan, []));
  }
  const database = textOf(args, 'database') ?? (context.target.kind === 'database' ? context.target.database : '');
  return planOf(context.state, {
    shows: connectionPageShows(connection.id, usersPage),
    background: false,
    section: database,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('user.show'), plan };
