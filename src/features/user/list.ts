/**
 * Feature: user.list
 *
 * The users of one database, `db.getSiblingDB("shop").runCommand({ usersInfo: 1 })`, or of all of them,
 * `db.getSiblingDB("admin").runCommand({ usersInfo: { forAllDBs: true } })`, sorted by database and then by name.
 * Started with `{ connection, database }`, the database `null` (or absent) for **All databases**. The server returns
 * no password and no credentials with these commands. A server that refuses the command gives its message as the
 * error of the users, which the page shows in place of their table; the roles are read apart (`user.list-roles`).
 * Ported from Mongoster's `load`, `toUser` and `roleRef`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import {
  commandRequest,
  connectionOfArgs,
  isRecord,
  one,
  recordsOf,
  textOf,
  textsOf,
  type JsonRecord,
  type RoleRef,
  type User,
} from './types';

/** The database asked for: a name, or `undefined` for **All databases**. */
export function databaseOfArgs(args: Json): string | undefined {
  const database = isRecord(args) ? textOf(args, 'database') : undefined;
  return database === undefined || database === '' ? undefined : database;
}

/** Feature: user.list — `usersInfo: 1` to the database chosen, or `usersInfo: { forAllDBs: true }` to `admin`. */
export function request(context: Context, args: Json): Extract<ReadRequest, { kind: 'engine' }> {
  const connection = connectionOfArgs(args, context);
  const database = databaseOfArgs(args);
  const body: Json = database === undefined ? { usersInfo: { forAllDBs: true } } : { usersInfo: one };
  return { kind: 'engine', requests: [{ connection, request: commandRequest(database ?? 'admin', body) }] };
}

/** A role of a reply: a bare name is in the database of the user or the role that has it. */
export function roleOfReply(value: Json, database: string): RoleRef {
  if (typeof value === 'string') {
    return { role: value, db: database };
  }
  const fields = isRecord(value) ? value : {};
  return { role: textOf(fields, 'role') ?? '', db: textOf(fields, 'db') ?? database };
}

/** The roles of a reply's list, each with its database. */
export function rolesOfReply(value: Json | undefined, database: string): readonly RoleRef[] {
  return Array.isArray(value) ? (value as readonly Json[]).map((item) => roleOfReply(item, database)) : [];
}

function userOf(document: JsonRecord): User {
  const db = textOf(document, 'db') ?? '';
  const customData = document['customData'];
  return {
    user: textOf(document, 'user') ?? '',
    db,
    roles: rolesOfReply(document['roles'], db),
    mechanisms: textsOf(document['mechanisms']),
    ...(customData === undefined ? {} : { customData }),
    document,
  };
}

/** Sorted by database, then by name, as the page lists them. */
export function byDatabaseAndName(first: User, second: User): number {
  return first.db.localeCompare(second.db, 'en') || first.user.localeCompare(second.user, 'en');
}

/** Feature: user.list — the users of the reply, sorted by database and then by name. */
export function parse(replies: readonly unknown[]): readonly User[] {
  const reply = replies[0];
  return recordsOf(isRecord(reply) ? reply['users'] : undefined)
    .map(userOf)
    .sort(byDatabaseAndName);
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('user.list'), request, parse };
