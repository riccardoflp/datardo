/**
 * Feature: user.role-reference
 *
 * One role in the three forms the area needs, the label of a table (`read@reporting`, or `readWrite` beside a user of
 * its database), the whole name, and the argument of a command (`"readWrite"` or `{ role: "read", db: "reporting" }`),
 * and the names a field for a role suggests. Ported from Mongoster's `rolesArg`, `refText`, `roleLabel`, `roleKey` and
 * `ADMIN_ONLY`.
 */
import type { Json } from '../../shared/engine-request';
import { roleKey, type Role, type RoleRef } from './types';

/** The built-in roles a field for a role suggests, in this order (rule 4). */
export const builtInRoleNames = [
  'read',
  'readWrite',
  'dbAdmin',
  'dbOwner',
  'userAdmin',
  'clusterAdmin',
  'clusterManager',
  'clusterMonitor',
  'hostManager',
  'backup',
  'restore',
  'readAnyDatabase',
  'readWriteAnyDatabase',
  'userAdminAnyDatabase',
  'dbAdminAnyDatabase',
  'enableSharding',
  'root',
] as const;

/** The built-in roles that exist in every database; the others exist only in `admin` (rule 5). */
const inEveryDatabase: ReadonlySet<string> = new Set(['read', 'readWrite', 'dbAdmin', 'dbOwner', 'userAdmin']);

/** Feature: user.role-reference — the whole name of a role: `read@reporting` (rule 1). */
export function roleName(role: RoleRef): string {
  return roleKey(role);
}

/**
 * Feature: user.role-reference — the label of a role beside a user or a role of `database`: the role alone when it is
 * of that database, the whole name otherwise (rule 2).
 */
export function roleLabel(role: RoleRef, database: string): string {
  return role.db === database ? role.role : roleName(role);
}

/**
 * Feature: user.role-reference — the role as an argument of a command sent to `database`: its name when it is of that
 * database, `{ role, db }` otherwise (rule 3).
 */
export function roleArgument(role: RoleRef, database: string): Json {
  return role.db === database ? role.role : { role: role.role, db: role.db };
}

/** The roles as the `roles` of a command sent to `database`. */
export function roleArguments(roles: readonly RoleRef[], database: string): Json {
  return roles.map((role) => roleArgument(role, database));
}

/**
 * Feature: user.role-reference — the names suggested: the built-in roles in their order, then the custom roles read,
 * each name once (rule 4).
 */
export function suggestedRoles(customRoles: readonly Pick<Role, 'role' | 'isBuiltin'>[]): readonly string[] {
  const custom = customRoles.filter((role) => !role.isBuiltin).map((role) => role.role);
  return [...new Set<string>([...builtInRoleNames, ...custom])];
}

/** Feature: user.role-reference — whether a built-in role exists only in `admin`, which its field then chooses (rule 5). */
export function existsOnlyInAdmin(name: string): boolean {
  const trimmed = name.trim();
  return (builtInRoleNames as readonly string[]).includes(trimmed) && !inEveryDatabase.has(trimmed);
}

/** The database beside a field for a role once its name is typed: `admin` for a role that exists only there. */
export function databaseForRole(name: string, database: string): string {
  return existsOnlyInAdmin(name) ? 'admin' : database;
}

/** The built-in roles of a database other than `admin`, as `rolesInfo` lists them with `showBuiltinRoles`. */
const builtInOutsideAdmin: ReadonlySet<string> = new Set([...inEveryDatabase, 'enableSharding']);

/** Whether a role is one MongoDB provides, which cannot be changed or deleted. */
export function isBuiltInRole(role: RoleRef): boolean {
  return role.db === 'admin'
    ? (builtInRoleNames as readonly string[]).includes(role.role)
    : builtInOutsideAdmin.has(role.role);
}
