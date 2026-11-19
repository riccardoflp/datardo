/**
 * The requests the tools send to MongoDB, each with the time limit of `mcp.output-limits`, and how their replies are
 * read: documents and values as mongosh syntax, numbers of every BSON type as numbers, objects as records.
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import type { ConnectionRequest } from '../../../shared/engine-request';
import { numberOf } from '../../query/mongosh/ejson';
import { formattedValue } from '../../query/format';
import { MAX_TIME_MS } from '../output-limits';

/** What a request is sent on: the connection, the database, and the collection when the method is a collection's. */
export interface MongoPlace {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection?: string;
}

/** A call of a method, with `maxTimeMS` 30,000 (`timeLimitMs`, which the engine gives the server as `maxTimeMS`). */
export function mongoCall(place: MongoPlace, method: string, args: readonly Json[], limit?: number): ConnectionRequest {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: place.database,
    ...(place.collection === undefined ? {} : { collection: place.collection }),
    method,
    arguments: args,
    timeLimitMs: MAX_TIME_MS,
    ...(limit === undefined ? {} : { limit }),
  };
  return { connection: place.connection, request };
}

/** `db.runCommand(command)` on a database, the command carrying `maxTimeMS: 30000` where the server accepts it. */
export function mongoCommand(place: MongoPlace, command: { readonly [key: string]: Json }): ConnectionRequest {
  return mongoCall({ connection: place.connection, database: place.database }, 'runCommand', [
    { ...command, maxTimeMS: MAX_TIME_MS },
  ]);
}

/** A record of a reply, or an empty one. */
export function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The items of a reply that is a list, or none. */
export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** A number of a reply, whatever its BSON type (`{ $numberLong: "5" }`, `{ $numberInt: "5" }`, `5`). */
export function numberIn(value: unknown): number | undefined {
  return typeof value === 'number' ? value : numberOf(value as Json);
}

/** A text of a reply, or `undefined`. */
export function textIn(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A value of a reply in mongosh syntax, on one line: `ObjectId("…")`, `ISODate("…")`, `NumberLong(5)`. */
export function shellText(value: unknown): string {
  return formattedValue(value as Json, 'one-line');
}

/** A document in mongosh syntax, indented, as `find_documents` and `aggregate` give them. */
export function documentText(value: unknown): string {
  return formattedValue(value as Json, 'pretty');
}

/** Documents in mongosh syntax inside `[ ]`; `[]` when there are none. */
export function documentsText(documents: readonly unknown[]): string {
  return documents.length === 0 ? '[]' : `[\n${documents.map(documentText).join(',\n')}\n]`;
}

/** The milliseconds of a date of a reply (`{ $date: { $numberLong } }`, `{ $date: "…" }`), when it is one. */
export function dateIn(value: unknown): number | undefined {
  const date = recordOf(value)['$date'];
  if (typeof date === 'string') {
    const parsed = Date.parse(date);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return numberIn(date);
}

/** A time in UTC to the second: `2026-11-17T10:20:30Z`. */
export function utcText(milliseconds: number): string {
  return new Date(milliseconds).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}
