/**
 * Feature: user.inspect
 *
 * The selected user or role in the inspector island: for a user, its roles as chips that revoke, **Grant**, its custom
 * data and **Raw**; for a role, its privileges, the roles it inherits, the users listed that have it and **Raw**. It
 * shows what `user.list` and `user.list-roles` returned and reads nothing more. On a read-only connection nothing that
 * writes is shown. Ported from Mongoster's `userDetail`, `roleDetail` and `describeRole`.
 */
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import { formattedValue, prettyWidth } from '../aggregate/mongosh/format';
import { databaseForRole, suggestedRoles } from './role-reference';
import { text } from './text';
import {
  isSameRole,
  isSignedInAs,
  roleKey,
  startControl,
  userKey,
  type Role,
  type RoleRef,
  type SignedInUser,
  type User,
  type UserControl,
} from './types';

/** The tooltip of a chip lists up to 12 privileges of the role, each with up to 8 actions. */
export const tooltipPrivileges = 12;

/** The actions of a privilege a tooltip shows, before `…`. */
export const tooltipActions = 8;

/** What the inspector is drawn from. */
export interface InspectState {
  readonly connection: ConnectionId;
  readonly readOnly: boolean;
  readonly selected: { readonly kind: 'user'; readonly user: User } | { readonly kind: 'role'; readonly role: Role };
  /** The users and the roles listed in the page. */
  readonly users: readonly User[];
  readonly roles: readonly Role[];
  readonly signedIn?: SignedInUser;
  /** What **Grant**'s fields hold, as typed; the field starts empty, in the user's database. */
  readonly grant?: { readonly role: string; readonly database: string };
}

/** A role or a user shown as a chip, written whole, with what it grants as its tooltip, and `✕` when it revokes. */
export interface Chip {
  readonly label: string;
  readonly tooltip: string;
  readonly revoke?: UserControl;
}

/** **Raw**: the document as the server returned it, in mongosh syntax, and **Copy**. */
export interface Raw {
  readonly label: string;
  readonly text: string;
  readonly copy: UserControl;
}

/** **Grant**: the field for the role with its suggestions, *in*, the database, and the button. */
export interface GrantView {
  readonly label: string;
  readonly placeholder: string;
  readonly suggestions: readonly string[];
  readonly in: string;
  readonly role: string;
  readonly database: string;
  /** **Grant**, and `Enter` in the field: absent while the field is empty, so that nothing is sent. */
  readonly control?: UserControl;
}

/** The inspector of a user. */
export interface UserInspectView {
  readonly kind: 'user';
  readonly heading: string;
  readonly you?: string;
  readonly buttons: readonly UserControl[];
  readonly roles: { readonly label: string; readonly chips: readonly Chip[]; readonly none?: string };
  readonly grant?: GrantView;
  readonly customData?: { readonly label: string; readonly text: string };
  readonly raw: Raw;
}

/** The inspector of a role. */
export interface RoleInspectView {
  readonly kind: 'role';
  readonly heading: string;
  readonly builtIn?: string;
  readonly buttons: readonly UserControl[];
  readonly privileges?: {
    readonly label: string;
    readonly columns: readonly [string, string];
    readonly rows: readonly { readonly resource: string; readonly actions: string }[];
  };
  readonly inherits?: { readonly label: string; readonly chips: readonly Chip[] };
  readonly users?: { readonly label: string; readonly chips: readonly Chip[] };
  readonly raw: Raw;
}

/** What the inspector shows. */
export type InspectView = UserInspectView | RoleInspectView;

/** One privilege in a tooltip: `shop.orders: find, insert`, with `…` after 8 actions. */
function privilegeLine(resource: string, actions: readonly string[]): string {
  const more = actions.length > tooltipActions ? '…' : '';
  return `${resource}: ${actions.slice(0, tooltipActions).join(', ')}${more}`;
}

/**
 * What a role grants, as the tooltip of its chip: the role, then up to 12 of its privileges, then `inherits …`; the
 * role alone when it is not among those read.
 */
export function roleTooltip(ref: RoleRef, roles: readonly Role[]): string {
  const found = roles.find((role) => isSameRole(role, ref));
  if (found === undefined) {
    return roleKey(ref);
  }
  const lines = found.privileges
    .slice(0, tooltipPrivileges)
    .map((privilege) => privilegeLine(privilege.resource, privilege.actions));
  const inherits = found.roles.length > 0 ? [text.inspector.inheritsLine(found.roles.map(roleKey).join(', '))] : [];
  return [roleKey(ref), ...lines, ...inherits].join('\n');
}

/** The database of **Grant** once a role is typed: `admin` for a role that exists only there, else as it was. */
export function grantDatabaseAfterTyping(role: string, current: string): string {
  return databaseForRole(role, current);
}

/** A value in mongosh syntax on several lines, as **Raw** and **Custom data** show it (`query.format`). */
export function documentShown(document: Json): string {
  return formattedValue(document, { kind: 'pretty', width: prettyWidth });
}

function rawOf(document: Json): Raw {
  const shown = documentShown(document);
  return { label: text.inspector.raw, text: shown, copy: { kind: 'copy', label: text.inspector.copy, text: shown } };
}

/** The users listed that have a role. */
export function holdersOf(role: RoleRef, users: readonly User[]): readonly User[] {
  return users.filter((user) => user.roles.some((each) => isSameRole(each, role)));
}

function userChips(state: InspectState, user: User): readonly Chip[] {
  const on = { connection: state.connection, database: user.db };
  return user.roles.map((role) => {
    const label = roleKey(role);
    const chip = { label, tooltip: roleTooltip(role, state.roles) };
    if (state.readOnly) {
      return chip;
    }
    const ids = {
      element: 'user.revoke-role@inspector',
      feature: 'user.revoke-role',
      tooltip: text.inspector.revoke(label),
    };
    return {
      ...chip,
      revoke: startControl('✕', ids, on, { user: user.user, role: { role: role.role, db: role.db } }),
    };
  });
}

function grantOf(state: InspectState, user: User): GrantView {
  const role = state.grant?.role ?? '';
  const database = state.grant?.database ?? user.db;
  const on = { connection: state.connection, database: user.db };
  const ids = { element: 'user.grant-role@inspector', feature: 'user.grant-role' };
  return {
    label: text.inspector.grant,
    placeholder: text.inspector.grantPlaceholder,
    suggestions: suggestedRoles(state.roles),
    in: text.inspector.in,
    role,
    database,
    ...(role.trim() === ''
      ? {}
      : {
          control: startControl(text.inspector.grant, ids, on, {
            user: user.user,
            role: role.trim(),
            roleDatabase: database,
          }),
        }),
  };
}

function userView(state: InspectState, user: User): UserInspectView {
  const on = { connection: state.connection, database: user.db };
  const chips = userChips(state, user);
  const buttons = state.readOnly
    ? []
    : [
        startControl(
          text.menu.password,
          {
            element: 'user.change-password@inspector',
            feature: 'user.change-password',
            tooltip: text.menu.passwordTooltip,
          },
          on,
          { user: user.user },
        ),
        startControl(
          text.menu.delete,
          { element: 'user.delete@inspector', feature: 'user.delete', tooltip: text.menu.deleteUserTooltip },
          on,
          { user: user.user },
        ),
      ];
  return {
    kind: 'user',
    heading: userKey(user),
    ...(isSignedInAs(state.signedIn, user) ? { you: text.users.you } : {}),
    buttons,
    roles: { label: text.inspector.roles, chips, ...(chips.length === 0 ? { none: text.inspector.none } : {}) },
    ...(state.readOnly ? {} : { grant: grantOf(state, user) }),
    ...(user.customData === undefined
      ? {}
      : { customData: { label: text.inspector.customData, text: documentShown(user.customData) } }),
    raw: rawOf(user.document),
  };
}

function roleButtons(state: InspectState, role: Role): readonly UserControl[] {
  if (state.readOnly || role.isBuiltin) {
    return [];
  }
  const on = { connection: state.connection, database: role.db };
  return [
    startControl(
      text.menu.edit,
      { element: 'user.edit-role@inspector', feature: 'user.edit-role', tooltip: text.menu.editTooltip },
      on,
      { role: role.role },
    ),
    startControl(
      text.menu.delete,
      { element: 'user.delete-role@inspector', feature: 'user.delete-role', tooltip: text.menu.deleteRoleTooltip },
      on,
      { role: role.role },
    ),
  ];
}

function roleView(state: InspectState, role: Role): RoleInspectView {
  const holders = holdersOf(role, state.users);
  const inherits = role.roles.map((each) => ({ label: roleKey(each), tooltip: roleTooltip(each, state.roles) }));
  return {
    kind: 'role',
    heading: roleKey(role),
    ...(role.isBuiltin ? { builtIn: text.roles.builtIn } : {}),
    buttons: roleButtons(state, role),
    ...(role.privileges.length === 0
      ? {}
      : {
          privileges: {
            label: text.inspector.privileges,
            columns: [text.inspector.resource, text.inspector.actions],
            rows: role.privileges.map((each) => ({ resource: each.resource, actions: each.actions.join(', ') })),
          },
        }),
    ...(inherits.length === 0 ? {} : { inherits: { label: text.inspector.inherits, chips: inherits } }),
    ...(holders.length === 0
      ? {}
      : {
          users: {
            label: text.inspector.users,
            chips: holders.map((user) => ({ label: userKey(user), tooltip: userKey(user) })),
          },
        }),
    raw: rawOf(role.document),
  };
}

/** Feature: user.inspect — what the inspector shows of the selected user or role. */
export function view(state: InspectState): InspectView {
  return state.selected.kind === 'user' ? userView(state, state.selected.user) : roleView(state, state.selected.role);
}
