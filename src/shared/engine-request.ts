/**
 * What is sent to an engine: by a Read feature's `request` and by a step of a plan. A request is data, built by a pure
 * function and carried out by `src/engines`; it crosses the bridge and is written in the Log by `runner.step-text`.
 */
import type { ConnectionId } from './ids';

/** A JSON value. MongoDB values inside a request are canonical Extended JSON (architecture, "Values"). */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** The engines Datardo knows. */
export type EngineName = 'mongodb' | 'redis';

/**
 * A call to MongoDB, as the driver makes it: on a database, on a collection of it or on the admin database. The
 * arguments are canonical Extended JSON, so that the types of values survive (R5.5).
 */
export interface MongoRequest {
  readonly engine: 'mongodb';
  readonly database: string;
  /** The collection the method is called on; absent for a method of the database (`runCommand`, `createCollection`). */
  readonly collection?: string;
  /** The name of the method as mongosh writes it: `find`, `deleteOne`, `aggregate`, `runCommand`. */
  readonly method: string;
  readonly arguments: readonly Json[];
  /** For a method that returns many documents, how many to return at most (R9.2). */
  readonly limit?: number;
  /** How long the server may work on it, in milliseconds (R9.2). */
  readonly timeLimitMs?: number;
  /**
   * The session the method runs in, as the engine method `startSession` named it (`playground.sessions`); absent
   * outside a session.
   */
  readonly session?: string;
}

/** A command to Redis: its name and arguments as bytes, in the database the request names (R5.5). */
export interface RedisRequest {
  readonly engine: 'redis';
  readonly database: number;
  readonly command: readonly Uint8Array[];
  readonly timeLimitMs?: number;
}

/** A request to one of the engines. */
export type EngineRequest = MongoRequest | RedisRequest;

/** A request to an engine on one connection. */
export interface ConnectionRequest {
  readonly connection: ConnectionId;
  readonly request: EngineRequest;
}

/**
 * A reply of Redis as the engine gives it back: every string as bytes (R5.5), numbers as numbers, arrays and sets as
 * arrays, maps as their entries in order, and an error inside a reply as its message.
 */
export type RedisReply =
  | null
  | boolean
  | number
  | Uint8Array
  | readonly RedisReply[]
  | { readonly kind: 'map'; readonly entries: readonly (readonly [RedisReply, RedisReply])[] }
  | { readonly kind: 'error'; readonly message: string };

/**
 * A reply of MongoDB as the engine gives it back: the reply document, or the documents of a cursor, as canonical
 * Extended JSON, so that `Int32` and `Double`, `Long` and `Decimal128` stay apart (architecture, "Values").
 */
export type MongoReply = Json;

/** Text as the bytes Redis receives, in UTF-8. */
export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** A Redis command from words of text: `redisCommand(0, 'DEL', 'orders:42')`. */
export function redisCommand(database: number, ...words: readonly (string | Uint8Array)[]): RedisRequest {
  return {
    engine: 'redis',
    database,
    command: words.map((word) => (typeof word === 'string' ? utf8Bytes(word) : word)),
  };
}
