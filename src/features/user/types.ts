/**
 * What the cards of the user area share: a user and a role as the reads return them, where a feature acts (the
 * connection, how it is now, and the database where the user or the role is defined), and the readers of the
 * arguments a feature is started with.
 *
 * A feature of this area is started with `args.connection` and `args.database`, the database of the user or of the
 * role, and `args.user` or `args.role`, its name; or on the target, a database of a connection. Values cross as
 * canonical Extended JSON (R5.5).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { targetConnection, type Target } from '../../shared/target';

/** A JSON object, as a reader of arguments and replies sees it. */
export type JsonRecord = Readonly<Record<string, Json>>;

/** Whether a value is a JSON object (not an array, not null). */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One role, by its name and the database where it is defined: `read@reporting`. */
export interface RoleRef {
  readonly role: string;
  readonly db: string;
}

/** A user by its name and its database: `app@shop`. */
export interface UserRef {
  readonly user: string;
  readonly db: string;
}

/** What a role allows on one resource: the text of the resource (`shop.*`), its actions, and the resource as sent. */
export interface Privilege {
  readonly resource: string;
  readonly actions: readonly string[];
  /** The privilege as the server reported it, `{ resource, actions }`, to be sent back the same. */
  readonly document: Json;
}

/** A server user, as `user.list` returns it. */
export interface User extends UserRef {
  readonly roles: readonly RoleRef[];
  readonly mechanisms: readonly string[];
  /** Its custom data, when it has some, as canonical Extended JSON. */
  readonly customData?: Json;
  /** The whole document the server returned, as canonical Extended JSON. */
  readonly document: JsonRecord;
}

/** A role, built-in or custom, as `user.list-roles` returns it. */
export interface Role extends RoleRef {
  readonly isBuiltin: boolean;
  /** Its own privileges, without those it inherits. */
  readonly privileges: readonly Privilege[];
  /** The roles it inherits directly. */
  readonly roles: readonly RoleRef[];
  readonly document: JsonRecord;
}

/** Who the connection is signed in as, as `user.signed-in` returns it; both empty when it did not sign in. */
export interface SignedInUser {
  readonly users: readonly UserRef[];
  readonly roles: readonly RoleRef[];
}

/** `role@database`, the whole name of a role (`user.role-reference`, rule 1). */
export function roleKey(role: RoleRef): string {
  return `${role.role}@${role.db}`;
}

/** `name@database`, the whole name of a user. */
export function userKey(user: UserRef): string {
  return `${user.user}@${user.db}`;
}

/** Whether two references name the same role. */
export function isSameRole(first: RoleRef, second: RoleRef): boolean {
  return first.role === second.role && first.db === second.db;
}

/** Whether the connection is signed in as the user; "no" when it is not known (`user.signed-in`). */
export function isSignedInAs(signedIn: SignedInUser | undefined, user: UserRef): boolean {
  return signedIn?.users.some((each) => each.user === user.user && each.db === user.db) ?? false;
}

/** Where a feature of this area acts: a database of a saved connection, with how the connection is now (D14). */
export interface UserPlace {
  readonly connection: ConnectionId;
  /** The name of the connection, or its identifier when it is no longer saved. */
  readonly connectionName: string;
  readonly readOnly: boolean;
  /** The database where the user or the role is defined. */
  readonly database: string;
}

/** The arguments a feature was started with, as an object; empty when there are none. */
export function startArgs(answers: Answers): JsonRecord {
  const args = answers['args'];
  return isRecord(args) ? args : {};
}

/** A text of an object, or `undefined`. */
export function textOf(fields: JsonRecord, name: string): string | undefined {
  const value = fields[name];
  return typeof value === 'string' ? value : undefined;
}

/** A text answer, or `undefined` when the question was not answered. */
export function answerText(answers: Answers, key: string): string | undefined {
  const value = answers[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The database and the connection a feature acts on: `args.connection` and `args.database`, else the target's. Every
 * control that starts a feature of this area names them, so a start without them is a fault of the caller.
 */
export function requiredPlace(context: Context, answers: Answers): UserPlace {
  const place = connectionPlace(context, answers);
  if (place.database === '') {
    throw new Error(`${context.feature} is started on a database of a connection.`);
  }
  return place;
}

/**
 * The connection a feature acts on, with the database chosen in the page as its database: empty with **All
 * databases**, for the dialogs that ask where to create a user or a role.
 */
export function connectionPlace(context: Context, answers: Answers): UserPlace {
  const args = startArgs(answers);
  const target = context.target;
  const connection = textOf(args, 'connection') ?? targetConnection(target);
  const database =
    args['database'] === null ? '' : (textOf(args, 'database') ?? (target.kind === 'database' ? target.database : ''));
  if (connection === undefined) {
    throw new Error(`${context.feature} is started on a connection.`);
  }
  const saved = context.state.connections.saved.find((each) => each.id === connection);
  return {
    connection: connectionId(connection),
    connectionName: saved?.name ?? connection,
    readOnly: saved?.readOnly ?? false,
    database,
  };
}

/** A text argument the feature cannot do without, such as the name of the user it is started on. */
export function requiredText(context: Context, answers: Answers, name: string): string {
  const value = textOf(startArgs(answers), name);
  if (value === undefined) {
    throw new Error(`${context.feature} is started with ${name}.`);
  }
  return value;
}

/** A role of arguments or answers: `{ role, db }`, `"read"` in `database`, or `read@reporting`. */
export function roleOf(value: unknown, database: string): RoleRef | undefined {
  if (typeof value === 'string') {
    const text = value.trim();
    const at = text.lastIndexOf('@');
    if (text === '') {
      return undefined;
    }
    return at > 0
      ? { role: text.slice(0, at).trim(), db: text.slice(at + 1).trim() || database }
      : { role: text, db: database };
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const role = typeof value['role'] === 'string' ? value['role'].trim() : '';
  const db = typeof value['db'] === 'string' && value['db'].trim() !== '' ? value['db'].trim() : database;
  return role === '' ? undefined : { role, db };
}

/**
 * The rows of roles of a dialog (`user.create`'s **Roles**, `user.create-role`'s **Inherits**): an array of `{ role,
 * db }` from the rows, or a text of roles written whole and separated by commas (`readWrite@shop, clusterMonitor@admin`,
 * a bare name being in `database`). Rows with no role are left out.
 */
export function rolesOf(value: unknown, database: string): readonly RoleRef[] {
  const items: readonly unknown[] = Array.isArray(value)
    ? (value as readonly unknown[])
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return items.flatMap((item) => {
    const role = roleOf(item, database);
    return role === undefined ? [] : [role];
  });
}

/** How long a command of this area may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const commandTimeLimitMs = 30_000;

/** A command run on a database: `db.getSiblingDB("shop").runCommand({ usersInfo: 1 })`. */
export function commandRequest(database: string, body: Json): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'runCommand',
    arguments: [body],
    timeLimitMs: commandTimeLimitMs,
  };
}

/** `1` as canonical Extended JSON, as the commands of this area send it. */
export const one: Json = { $numberInt: '1' };

/** The texts of a list of a reply; empty when it is not one. */
export function textsOf(value: Json | undefined): readonly string[] {
  return Array.isArray(value)
    ? (value as readonly Json[]).filter((item): item is string => typeof item === 'string')
    : [];
}

/** The objects of a list of a reply; empty when it is not one. */
export function recordsOf(value: Json | undefined): readonly JsonRecord[] {
  return Array.isArray(value) ? (value as readonly Json[]).filter(isRecord) : [];
}

/** A connection of a Read's arguments. */
export function connectionOfArgs(args: Json, context: Context): ConnectionId {
  const fields = isRecord(args) ? args : {};
  const connection = textOf(fields, 'connection') ?? targetConnection(context.target);
  if (connection === undefined) {
    throw new Error(`${context.feature} is read on a connection.`);
  }
  return connectionId(connection);
}

/** A control of the page or the inspector: a feature it starts, or a text it copies. */
export type UserControl =
  | {
      readonly kind: 'start';
      readonly label: string;
      readonly tooltip?: string;
      /** The control's identifier, written whole, as `data-feature` carries it. */
      readonly element: string;
      readonly feature: string;
      readonly target: Target;
      readonly args: Json;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string };

/** What the controls of a user or a role start with: its connection, its database and its name. */
export interface Started {
  readonly connection: ConnectionId;
  readonly database: string;
}

/** A control that starts a feature on the database of a user or a role. */
export function startControl(
  label: string,
  ids: { readonly element: string; readonly feature: string; readonly tooltip?: string },
  on: Started,
  args: Readonly<Record<string, Json>>,
): UserControl {
  return {
    kind: 'start',
    label,
    ...(ids.tooltip === undefined ? {} : { tooltip: ids.tooltip }),
    element: ids.element,
    feature: ids.feature,
    target: { kind: 'database', connection: on.connection, database: on.database },
    args: { connection: on.connection, database: on.database, ...args },
  };
}

/** Roles written whole and separated by commas, as the rows of a dialog start: `readWrite@shop, read@reporting`. */
export function rolesText(roles: readonly RoleRef[]): string {
  return roles.map(roleKey).join(', ');
}
