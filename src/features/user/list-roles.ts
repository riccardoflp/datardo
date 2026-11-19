/**
 * Feature: user.list-roles
 *
 * The roles of one database or of all of them, custom roles first, then by database and by name. With **All
 * databases** it is read in two rounds: first `db.getSiblingDB("admin").system.roles.distinct("db")`, the databases
 * that have custom roles, then one `rolesInfo` for each database asked, `admin` and those (or every database the page
 * knows, when `admin.system.roles` cannot be read). With one database chosen there is one round.
 *
 * Started with `{ connection, database, builtIn, known, customRoleDatabases }`: `database` `null` for **All
 * databases**; `known` the databases the page lists; `customRoleDatabases` what the first round answered, `null` when
 * it was refused, absent before it was read. Ported from Mongoster's `load`, `toRole` and `resourceText`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import { databaseOfArgs, rolesOfReply } from './list';
import { resourceText } from './privilege-summary';
import {
  commandRequest,
  commandTimeLimitMs,
  connectionOfArgs,
  isRecord,
  one,
  recordsOf,
  textOf,
  textsOf,
  type JsonRecord,
  type Privilege,
  type Role,
} from './types';

/** What a round of the read answers: the databases that have custom roles, or the roles. */
export type RolesRead =
  | { readonly kind: 'custom-role-databases'; readonly databases: readonly string[] }
  | { readonly kind: 'roles'; readonly roles: readonly Role[] };

/** What the read is started with, read from its arguments. */
export interface RolesArgs {
  readonly database?: string;
  readonly builtIn: boolean;
  readonly known: readonly string[];
  /** `null` when `admin.system.roles` could not be read; absent before the first round. */
  readonly customRoleDatabases?: readonly string[] | null;
}

/** The arguments as the read takes them. */
export function rolesArgs(args: Json): RolesArgs {
  const fields: JsonRecord = isRecord(args) ? args : {};
  const database = databaseOfArgs(args);
  const custom = fields['customRoleDatabases'];
  return {
    ...(database === undefined ? {} : { database }),
    builtIn: fields['builtIn'] === true,
    known: textsOf(fields['known']),
    ...(custom === null
      ? { customRoleDatabases: null }
      : Array.isArray(custom)
        ? { customRoleDatabases: textsOf(custom) }
        : {}),
  };
}

/** Whether the read is in its first round: **All databases**, before the databases with custom roles are known. */
export function isFirstRound(asked: RolesArgs): boolean {
  return asked.database === undefined && asked.customRoleDatabases === undefined;
}

/** The databases `rolesInfo` is sent to, in order, each once. */
export function databasesAsked(asked: RolesArgs): readonly string[] {
  if (asked.database !== undefined) {
    return [asked.database];
  }
  const others = asked.customRoleDatabases === null ? asked.known : (asked.customRoleDatabases ?? []);
  return [...new Set(['admin', ...others])];
}

/** The `rolesInfo` of one database: the built-in roles with one database chosen, or of `admin` alone with all. */
export function rolesInfoBody(asked: RolesArgs, database: string): Json {
  const showBuiltinRoles = asked.builtIn && (asked.database !== undefined || database === 'admin');
  return { rolesInfo: one, showPrivileges: true, showBuiltinRoles };
}

function distinctRequest(connection: ConnectionId): Extract<ReadRequest, { kind: 'engine' }> {
  return {
    kind: 'engine',
    requests: [
      {
        connection,
        request: {
          engine: 'mongodb',
          database: 'admin',
          collection: 'system.roles',
          method: 'distinct',
          arguments: ['db'],
          timeLimitMs: commandTimeLimitMs,
        },
      },
    ],
  };
}

/** Feature: user.list-roles — the `distinct` of the first round, or one `rolesInfo` for each database asked. */
export function request(context: Context, args: Json): Extract<ReadRequest, { kind: 'engine' }> {
  const connection = connectionOfArgs(args, context);
  const asked = rolesArgs(args);
  if (isFirstRound(asked)) {
    return distinctRequest(connection);
  }
  return {
    kind: 'engine',
    requests: databasesAsked(asked).map((database) => ({
      connection,
      request: commandRequest(database, rolesInfoBody(asked, database)),
    })),
  };
}

function privilegeOf(document: JsonRecord): Privilege {
  return {
    resource: resourceText(document['resource'] ?? null),
    actions: textsOf(document['actions']),
    document,
  };
}

function roleOf(document: JsonRecord): Role {
  const db = textOf(document, 'db') ?? '';
  return {
    role: textOf(document, 'role') ?? '',
    db,
    isBuiltin: document['isBuiltin'] === true,
    privileges: recordsOf(document['privileges']).map(privilegeOf),
    roles: rolesOfReply(document['roles'], db),
    document,
  };
}

/** Custom roles first, then by database and by name, as the page lists them. */
export function byKindDatabaseAndName(first: Role, second: Role): number {
  return (
    Number(first.isBuiltin) - Number(second.isBuiltin) ||
    first.db.localeCompare(second.db, 'en') ||
    first.role.localeCompare(second.role, 'en')
  );
}

/** Feature: user.list-roles — the databases of the first round, or the roles of every reply, in the page's order. */
export function parse(replies: readonly unknown[], args: Json): RolesRead {
  if (isFirstRound(rolesArgs(args))) {
    const databases = Array.isArray(replies[0]) ? textsOf(replies[0] as Json) : [];
    return { kind: 'custom-role-databases', databases };
  }
  const roles = replies.flatMap((reply) => recordsOf(isRecord(reply) ? reply['roles'] : undefined).map(roleOf));
  return { kind: 'roles', roles: roles.sort(byKindDatabaseAndName) };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('user.list-roles'), request, parse };
