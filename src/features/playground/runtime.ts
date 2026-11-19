/**
 * Feature: playground.runtime
 *
 * The names a script has: `db`, collections with the methods of mongosh, cursors, the BSON types, and printing, and
 * nothing else of Datardo or of the system. {@link runtime} describes them for the process of a run, which builds the
 * objects: each method that reaches the database becomes a {@link PlaygroundCall} sent to the main process, which
 * checks it (`playground.writes`) and answers it. Ported from Mongoster's `src/playground/shell.ts` (`Shell`,
 * `ShellCursor`, `ShellMongo`, `helpers`).
 */
import type { Json } from '../../shared/engine-request';
import { resolveName } from '../../shared/playground/rewrite';
import type { CursorCall, PlaygroundCall } from './runtime/calls';
import {
  collectionMethods,
  cursorReads,
  cursorShapes,
  databaseMethods,
  missingOnAggregation,
  mongoWords,
  sessionWords,
} from './runtime/methods';
import { printers } from './runtime/printing';
import { text } from './text';
import { jsonObject } from './types';

export type { CursorCall, FromRun, PlaygroundCall, Receiver, RunStart, ToRun } from './runtime/calls';
export { callRequest, resultDocuments } from './runtime/calls';
export { printedLine, type Printed, type PrintLayout } from './runtime/printing';

/** What a run starts with: its database, the default one or that of the last `use("…")` before what it runs. */
export interface RuntimeRun {
  readonly database: string;
}

/** The names of a script and what the process gives each. */
export interface Runtime {
  /** `db` at the start of the run. */
  readonly database: string;
  /** The names the process defines, besides those of the language (`Date`, `Math`, `JSON`, `Promise`, `Map`…). */
  readonly names: readonly string[];
  /** Names the process removes or never defines, so that a script that uses them gets a `ReferenceError`. */
  readonly absent: readonly string[];
  /** The BSON types, as functions. */
  readonly types: readonly string[];
  readonly methods: {
    readonly database: readonly string[];
    readonly collection: readonly string[];
    readonly cursorShapes: readonly string[];
    readonly cursorReads: readonly string[];
    readonly mongo: readonly string[];
    readonly session: readonly string[];
  };
}

/** The BSON types a script has. */
export const bsonTypes: readonly string[] = [
  'ObjectId',
  'ISODate',
  'NumberLong',
  'NumberInt',
  'Int32',
  'Double',
  'NumberDecimal',
  'Decimal128',
  'UUID',
  'BinData',
  'Timestamp',
  'MinKey',
  'MaxKey',
  'Code',
  'EJSON',
];

/** What a script never has: no module system, no process, no timers, no files and no network. */
export const absentNames: readonly string[] = [
  'require',
  'module',
  'exports',
  'process',
  'global',
  'Buffer',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
  'importScripts',
];

/**
 * Feature: playground.runtime — the names a script has for a run on `run.database`: `db` (the current database, which
 * `use("name")` changes), `use`, the functions of printing and `console`, `sleep`, the BSON types and the function the
 * rewriting awaits through; no `require`, `import`, `process`, timers, files or network.
 */
export function runtime(run: RuntimeRun): Runtime {
  return {
    database: run.database,
    names: ['db', 'use', 'print', 'printjson', 'console', 'sleep', ...bsonTypes, resolveName],
    absent: absentNames,
    types: bsonTypes,
    methods: {
      database: databaseMethods,
      collection: collectionMethods,
      cursorShapes,
      cursorReads,
      mongo: mongoWords.map(([name]) => name),
      session: sessionWords.map(([name]) => name),
    },
  };
}

/** The names of printing, as the process defines them (`print`, `printjson`, `console.log`…). */
export const printingNames: readonly string[] = Object.keys(printers);

/** What `use(name)` answers: the new database and `switched to db <name>`, or the script's error. */
export type UseAnswer =
  | { readonly kind: 'switched'; readonly database: string; readonly reply: string }
  | { readonly kind: 'error'; readonly message: string };

/** `use("shop")` → `switched to db shop`; `use()` with anything but a name → *use(): the database name is a string*. */
export function useDatabase(name: unknown): UseAnswer {
  return typeof name === 'string' && name !== ''
    ? { kind: 'switched', database: name, reply: text.runtime.switched(name) }
    : { kind: 'error', message: text.runtime.useName };
}

/**
 * Whether a cursor has a method: those of shaping and reading; an aggregation's cursor lacks some, and the call
 * throws *cursor.hint() is not available on this cursor*.
 */
export function cursorMethodProblem(cursor: Pick<CursorCall, 'of'>, method: string): string | undefined {
  const known = cursorShapes.includes(method) || cursorReads.includes(method);
  const missing = cursor.of === 'aggregate' && missingOnAggregation.has(method);
  return known && !missing ? undefined : text.runtime.notOnCursor(method);
}

/** Whether a name of `db` is one of its methods; any other is the collection of that name (`db.orders`). */
export function isDatabaseMethod(name: string, inSession: boolean): boolean {
  return databaseMethods.includes(name) || (inSession && name === 'getSession');
}

/** Whether a name of a collection is one of its methods; any other is a collection with a dotted name. */
export function isCollectionMethod(name: string): boolean {
  return collectionMethods.includes(name);
}

/** The name of a collection reached through another: `db.logs.archive`, `db.system.views`. */
export function dottedCollection(collection: string, name: string): string {
  return `${collection}.${name}`;
}

/**
 * The call a cursor's read sends: the cursor with its shape, and the reading method. `size` is `count`; the result of
 * a run reads `toArray` with a limit of 201 (`resultDocuments` and one more, to know whether there are others).
 */
export function cursorRead(cursor: CursorCall, method: string, scriptDatabase: string): PlaygroundCall {
  return {
    on: 'cursor',
    database: cursor.database,
    ...(cursor.collection === undefined ? {} : { collection: cursor.collection }),
    method: method === 'size' ? 'count' : method,
    arguments: [],
    scriptDatabase,
    cursor,
  };
}

/** The value `getCollectionNames` answers: the names of `listCollections`, sorted. */
export function collectionNames(collections: readonly Json[]): readonly string[] {
  return collections
    .map((each) => jsonObject(each)?.['name'])
    .filter((name): name is string => typeof name === 'string')
    .sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
}
