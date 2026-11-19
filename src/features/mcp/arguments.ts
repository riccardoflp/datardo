/**
 * Feature: mcp.arguments
 *
 * How every tool reads its arguments: the connection by id or by name, for its engine, connected as opening it would;
 * the database and the collection, which must exist; a Redis database and a key; strings, whole numbers, switches,
 * times, resume tokens, lists and names of a fixed set, each with the sentence the model sees when it is wrong.
 */
import type { ConnectionView } from '../../shared/connection';
import type { EngineName } from '../../shared/engine-request';
import { connectionState } from '../../shared/state/connections';
import { parsedValue } from '../query/parse';
import { isJsonObject } from '../query/mongosh/ejson';
import { mongoCall, recordOf } from './tool/mongo';
import { ToolProblem, type ToolSession } from './tool/program';
import { keyBytes } from './tool/redis';
import { mcpActions, type ToolArguments } from './types';

/**
 * Feature: mcp.arguments — the connection `connection` names: by id first, else by name in any case. A name used
 * twice is refused with the ids to choose from; an unknown one with the names there are.
 */
export function toolTarget(args: ToolArguments, connections: readonly ConnectionView[]): ConnectionView {
  const key = stringArg(args, 'connection') ?? '';
  const byId = connections.find((each) => each.id === key);
  if (byId !== undefined) {
    return byId;
  }
  const byName = connections.filter((each) => each.name.toLowerCase() === key.toLowerCase());
  const [only] = byName;
  if (byName.length === 1 && only !== undefined) {
    return only;
  }
  if (byName.length > 1) {
    throw new ToolProblem(
      `More than one connection is named "${key}": use the id (${byName.map((each) => each.id).join(', ')}).`,
    );
  }
  const names = connections.map((each) => each.name).join(', ');
  throw new ToolProblem(`No connection "${key}". Connections: ${names === '' ? 'none' : names}.`);
}

/** The sentence for a tool of one engine given a connection of the other. */
export function otherEngineSentence(connection: ConnectionView): string {
  return connection.engine === 'redis'
    ? `${connection.name} is a Redis connection: use the redis_ tools (redis_scan_keys, redis_key_details).`
    : `${connection.name} is a MongoDB connection: use list_databases, list_collections and the other tools without redis_.`;
}

/**
 * The connection of a tool for one engine, connected: one of the other engine is refused before anything is sent;
 * one that is not connected is connected as opening it in the window would, without a dialog, and refused when only
 * the user can connect it.
 */
export function toolConnection(session: ToolSession, engine: EngineName): ConnectionView {
  const connection = toolTarget(session.args, session.context.state.connections.saved);
  if (connection.engine !== engine) {
    throw new ToolProblem(otherEngineSentence(connection));
  }
  connectIfNeeded(session, connection);
  return connection;
}

/** Connects the connection when it is not connected; refused when only the user can connect it. */
export function connectIfNeeded(session: ToolSession, connection: ConnectionView): void {
  if (connectionState(session.context.state.connections, connection.id) === 'connected') {
    return;
  }
  const reply = session.app(mcpActions.connect, { connection: connection.id });
  if (reply !== 'connected') {
    throw new ToolProblem(`${connection.name} is not connected and needs the user to connect it in Datardo.`);
  }
}

/** A required string argument (the protocol has refused it when absent): trimmed. */
export function requiredArg(args: ToolArguments, key: string): string {
  const value = stringArg(args, key);
  if (value === undefined) {
    throw new ToolProblem(`Missing argument: ${key}.`);
  }
  return value;
}

/** A MongoDB collection named by `database` and `collection`, checked to exist with `listCollections`. */
export interface CollectionArgs {
  readonly connection: ConnectionView;
  readonly database: string;
  readonly collection: string;
  /** Its entry of `listCollections`: its type (`collection`, `view`, `timeseries`) and its options. */
  readonly entry: Readonly<Record<string, unknown>>;
}

/** The collection of a MongoDB tool, which must exist: `<database>.<collection> doesn't exist on <connection>: …`. */
export function collectionArgs(session: ToolSession): CollectionArgs {
  const connection = toolConnection(session, 'mongodb');
  const database = requiredArg(session.args, 'database');
  const collection = requiredArg(session.args, 'collection');
  const [reply] = session.send([
    mongoCall({ connection: connection.id, database }, 'listCollections', [{ name: collection }, {}]),
  ]);
  const [entry] = Array.isArray(reply) ? (reply as readonly unknown[]) : [];
  if (entry === undefined) {
    throw new ToolProblem(`${database}.${collection} doesn't exist on ${connection.name}: use list_collections.`);
  }
  return { connection, database, collection, entry: recordOf(entry) };
}

/** `collection` without `database` is refused. */
export function databaseAndCollection(args: ToolArguments): { database?: string; collection?: string } {
  const database = stringArg(args, 'database');
  const collection = stringArg(args, 'collection');
  if (collection !== undefined && database === undefined) {
    throw new ToolProblem('collection needs database.');
  }
  return { ...(database === undefined ? {} : { database }), ...(collection === undefined ? {} : { collection }) };
}

/** The database of a Redis connection's string (`redis://cache/2` → 2), else 0. */
export function connectionDatabase(connection: ConnectionView): number {
  const path = /^rediss?:\/\/[^/]*\/(\d+)/u.exec(connection.address ?? '')?.[1];
  return path === undefined ? 0 : Number(path);
}

/** The Redis database `database` names, a whole number; left out, the connection string's, else 0. */
export function redisDatabaseArg(args: ToolArguments, connection: ConnectionView): number {
  return intArg(args, 'database', [connectionDatabase(connection), 0, Number.MAX_SAFE_INTEGER]);
}

/** The key `key` names, `\x` and two hexadecimal digits for each byte that is not UTF-8, `\\` for a backslash. */
export function keyArg(args: ToolArguments): Uint8Array {
  return keyBytes(requiredArg(args, 'key'));
}

/** A string argument, trimmed; `undefined` when absent or empty; anything else is refused. */
export function stringArg(args: ToolArguments, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ToolProblem(`${key} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** The default of a whole number, and its bounds: `[20, 1, 100]`. */
export type IntBounds = readonly [otherwise: number, lowest: number, highest: number];

/** A whole number, as a number or digits, between the bounds; the default when absent. */
export function intArg(args: ToolArguments, key: string, [otherwise, lowest, highest]: IntBounds): number {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    return otherwise;
  }
  const number = typeof value === 'string' && /^\s*-?\d+\s*$/u.test(value) ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number)) {
    throw new ToolProblem(`${key} must be a whole number.`);
  }
  if (number < lowest || number > highest) {
    throw new ToolProblem(`${key} must be between ${String(lowest)} and ${String(highest)}.`);
  }
  return number;
}

/** A switch: `true` or `false`; the default when absent. */
export function boolArg(args: ToolArguments, key: string, otherwise: boolean): boolean {
  const value = args[key];
  if (value === undefined || value === null) {
    return otherwise;
  }
  if (typeof value !== 'boolean') {
    throw new ToolProblem(`${key} must be true or false.`);
  }
  return value;
}

const units: Readonly<Record<string, number>> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** A time, `since` or `until`: an ISO date, or a time ago (`90s`, `15m`, `2h`, `1d`, `1w`) before `now`. */
export function timeArg(value: string, key: string, now: number): number {
  const ago = /^(\d+(?:\.\d+)?)\s*([smhdw])$/iu.exec(value.trim());
  if (ago?.[1] !== undefined && ago[2] !== undefined) {
    return now - Number(ago[1]) * (units[ago[2].toLowerCase()] ?? 0);
  }
  const at = /^\d{4}-\d{2}-\d{2}/u.test(value.trim()) ? Date.parse(value.trim()) : Number.NaN;
  if (Number.isNaN(at)) {
    throw new ToolProblem(
      `${key} must be an ISO date (e.g. 2024-05-01T10:00:00Z) or a time ago like "15m", "2h", "1d".`,
    );
  }
  return at;
}

const tokenSentence =
  'resumeAfter must be the resume token returned by watch_changes: its _data string (hex), or { _data: "…" }.';

/** A resume token: its hex `_data`, `{ _data: "…" }` as text, or that object; `undefined` when absent. */
export function resumeToken(value: unknown): { readonly _data: string } | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const data = tokenData(value);
  if (typeof data !== 'string' || !/^[0-9a-f]+$/iu.test(data)) {
    throw new ToolProblem(tokenSentence);
  }
  return { _data: data };
}

function tokenData(value: unknown): unknown {
  if (typeof value !== 'string') {
    return recordOf(value)['_data'];
  }
  const text = value.trim();
  if (!text.startsWith('{')) {
    return text;
  }
  const parsed = parsedValue(text, 0, () => '0'.repeat(24));
  return parsed.ok && isJsonObject(parsed.value) ? parsed.value['_data'] : undefined;
}

/** A list of names: an array or a comma-separated string, each one of `allowed`; empty when absent. */
export function listArg(args: ToolArguments, key: string, allowed: readonly string[]): readonly string[] {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    return [];
  }
  const listed: readonly unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];
  const items = listed.map((each) => (typeof each === 'string' ? each : JSON.stringify(each)));
  const names = items.map((each) => each.trim()).filter((each) => each !== '');
  const wrong = names.filter((each) => !allowed.includes(each));
  if (wrong.length > 0) {
    throw new ToolProblem(`${key}: unknown ${wrong.join(', ')}. Use ${allowed.join(', ')}.`);
  }
  return names;
}

/** One of a fixed set of names (`type`, `section`, `source`); `undefined` when absent. */
export function oneOfArg<Name extends string>(
  args: ToolArguments,
  key: string,
  names: readonly Name[],
): Name | undefined {
  const value = stringArg(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!(names as readonly string[]).includes(value)) {
    throw new ToolProblem(`${key} must be one of ${names.join(', ')}.`);
  }
  return value as Name;
}
