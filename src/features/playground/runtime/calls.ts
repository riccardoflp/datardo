/**
 * What passes between the process of a run and the main process (`playground.run`, D40, T6): the script's calls to
 * the database, each answered by the main process, the lines it prints, and how it ends. The process has the names
 * of `playground.runtime` and nothing else of Datardo; every value crosses as canonical Extended JSON, so that a value
 * read keeps its BSON type through the script and back (R5.5).
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import type { RunError, RunValue } from '../types';

/** The object of the runtime a method is called on. */
export type Receiver = 'database' | 'collection' | 'cursor' | 'mongo' | 'session';

/** The step of a cursor's shape: `sort({ total: -1 })`, `limit(5)`. `map` stays in the process. */
export interface CursorShape {
  readonly method: string;
  readonly arguments: readonly Json[];
}

/** A cursor of the script, which sends nothing until it is read. */
export interface CursorCall {
  /** Its number in the run: the main process keeps the driver's cursor by it between reads (`next`, `hasNext`). */
  readonly id: number;
  readonly of: 'find' | 'aggregate';
  readonly database: string;
  /** Absent for `db.aggregate(…)`. */
  readonly collection?: string;
  /** The arguments of `find` or `aggregate`. */
  readonly arguments: readonly Json[];
  readonly shape: readonly CursorShape[];
}

/**
 * A call of the script to the database, as the process sends it. The check of `playground.writes` is made on it in
 * the main process, so a script that redefines `db`, or calls `db["orders"]["deleteMany"]`, reaches the same check.
 */
export interface PlaygroundCall {
  readonly on: Receiver;
  /** The database of the object the method is called on: `db`, `getSiblingDB`, `getMongo().getDB` or a session's. */
  readonly database: string;
  /** For a method of a collection. */
  readonly collection?: string;
  readonly method: string;
  readonly arguments: readonly Json[];
  /** The script's current database at the call, which the step of a drop leaves out. */
  readonly scriptDatabase: string;
  /** The line of the call in the script, from 1, when the process knows it. */
  readonly line?: number;
  /** The number of the session of the run the object belongs to (`session.getDatabase(…)`). */
  readonly session?: number;
  /** For a read of a cursor: the cursor. */
  readonly cursor?: CursorCall;
}

/** The first message of a run, from the main process: what to run. */
export interface RunStart {
  /** The rewritten text (`playground.rewrite`). */
  readonly code: string;
  /** The playground's default database, or the one of the last `use("…")` before a selection or a statement. */
  readonly database: string;
  /** The line of the script on which the text run starts, from 1: errors are reported on the script's lines. */
  readonly firstLine: number;
}

/** What the main process sends to the process of a run. */
export type ToRun =
  | ({ readonly kind: 'start' } & RunStart)
  | { readonly kind: 'reply'; readonly id: number; readonly value: Json }
  | { readonly kind: 'throw'; readonly id: number; readonly error: RunError };

/** What the process of a run sends to the main process. */
export type FromRun =
  | { readonly kind: 'call'; readonly id: number; readonly call: PlaygroundCall }
  | { readonly kind: 'print'; readonly line: string }
  | { readonly kind: 'done'; readonly value: RunValue; readonly database: string }
  | { readonly kind: 'failed'; readonly error: RunError; readonly database: string };

/** How many documents of a cursor are shown as the result, and read (one more tells whether there are others). */
export const resultDocuments = 200;

function firstKey(value: Json | undefined): string | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value)[0] : undefined;
}

/** A command given to `runCommand` or `adminCommand`, as an object: `"dropDatabase"` is `{ dropDatabase: 1 }`. */
export function commandDocument(argument: Json | undefined): Json {
  return typeof argument === 'string' ? { [argument]: { $numberInt: '1' } } : (argument ?? {});
}

/** The name of a command given to `runCommand` or `adminCommand`: its first key, or the name given alone. */
export function commandName(argument: Json | undefined): string {
  return typeof argument === 'string' ? argument : (firstKey(argument) ?? '');
}

function databaseCommand(database: string, command: Json): MongoRequest {
  return { engine: 'mongodb', database, method: 'runCommand', arguments: [command] };
}

/**
 * The request the main process sends for a call of a database or a collection, the method as mongosh names it
 * (engine-request, `MongoRequest.method`). Cursors and sessions are kept by the main process for the run and are not
 * single requests. `count` is `countDocuments`, `insert` one of the two inserts, `adminCommand` a command to `admin`.
 */
export function callRequest(call: PlaygroundCall): MongoRequest {
  const [first] = call.arguments;
  const base = {
    engine: 'mongodb' as const,
    database: call.database,
    ...(call.collection === undefined ? {} : { collection: call.collection }),
  };
  switch (call.method) {
    case 'count':
      return { ...base, method: 'countDocuments', arguments: call.arguments };
    case 'insert':
      return { ...base, method: Array.isArray(first) ? 'insertMany' : 'insertOne', arguments: call.arguments };
    case 'adminCommand':
      return databaseCommand('admin', commandDocument(first));
    case 'runCommand':
      return databaseCommand(call.database, commandDocument(first));
    default:
      return { ...base, method: call.method, arguments: call.arguments };
  }
}

/** The pipeline of a call that runs one: `aggregate` on a collection or on `db`, or the command `aggregate`. */
export function pipelineOf(call: PlaygroundCall): readonly Json[] | undefined {
  const [first] = call.arguments;
  if (call.method === 'aggregate' && (call.on === 'collection' || call.on === 'database')) {
    // mongosh also takes the stages as separate arguments.
    return Array.isArray(first) ? (first as readonly Json[]) : call.arguments;
  }
  if (call.on === 'cursor' && call.cursor?.of === 'aggregate') {
    const [pipeline] = call.cursor.arguments;
    return Array.isArray(pipeline) ? (pipeline as readonly Json[]) : call.cursor.arguments;
  }
  const command = commandDocument(first);
  if ((call.method === 'runCommand' || call.method === 'adminCommand') && commandName(first) === 'aggregate') {
    const pipeline = (command as { readonly pipeline?: Json }).pipeline;
    return Array.isArray(pipeline) ? (pipeline as readonly Json[]) : undefined;
  }
  return undefined;
}
