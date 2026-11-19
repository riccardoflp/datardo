/**
 * A cursor of a script (`playground.runtime`): `find` and `aggregate` give one, which sends nothing until it is read.
 * It is shaped with `sort`, `limit`, `skip`â€¦ (kept as its shape, which the main process gives the driver's cursor), and
 * read with `toArray`, `forEach`, `hasNext`, `next`, `count`, `itcount`, `size`, `explain` or `for await`. `map` stays in
 * the process: it is applied to each document read.
 */
import type { Json } from '../../shared/engine-request';
import { cursorMethodProblem, resultDocuments, type CursorCall } from '../../features/playground/runtime';
import { cursorShapes } from '../../features/playground/runtime/methods';
import { jsonArguments, scriptError, type ScriptEnvironment } from './environment';

/** How many documents `next`, `hasNext` and `forEach` read at a time. */
const batch = 100;

/** What a cursor is opened on. */
export interface CursorOrigin {
  readonly of: 'find' | 'aggregate';
  readonly database: string;
  readonly collection?: string;
  readonly arguments: readonly Json[];
  readonly session?: number;
}

/** What a cursor of the script reads, as a value of the script. */
interface Read {
  readonly documents: readonly unknown[];
  readonly exhausted: boolean;
}

/** The documents of a cursor read for the result of a run: at most 201, one more than are shown. */
export interface CursorReader {
  readonly resultDocuments: () => Promise<readonly unknown[]>;
}

const readers = new WeakMap<object, CursorReader>();

/** The reader of a cursor of the script, when a value is one. */
export function cursorReader(value: unknown): CursorReader | undefined {
  return typeof value === 'object' && value !== null ? readers.get(value) : undefined;
}

type Mapper = (document: unknown) => unknown;

class CursorState {
  readonly shape: { method: string; arguments: Json[] }[] = [];
  readonly maps: Mapper[] = [];
  readonly buffer: unknown[] = [];
  exhausted = false;

  constructor(
    readonly environment: ScriptEnvironment,
    readonly origin: CursorOrigin,
    readonly id: number,
  ) {}

  call(): CursorCall {
    const { of, database, collection } = this.origin;
    return {
      id: this.id,
      of,
      database,
      ...(collection === undefined ? {} : { collection }),
      arguments: this.origin.arguments,
      shape: this.shape,
    };
  }

  send(method: string, args: readonly Json[]): Promise<unknown> {
    const { database, collection, session } = this.origin;
    return this.environment.send({
      on: 'cursor',
      database,
      ...(collection === undefined ? {} : { collection }),
      method,
      arguments: args,
      ...(session === undefined ? {} : { session }),
      cursor: this.call(),
    });
  }

  async mapped(documents: readonly unknown[]): Promise<unknown[]> {
    const out: unknown[] = [];
    for (const document of documents) {
      let value = document;
      for (const map of this.maps) {
        value = await map(value);
      }
      out.push(value);
    }
    return out;
  }

  async fill(): Promise<void> {
    if (this.buffer.length > 0 || this.exhausted) {
      return;
    }
    const read = (await this.send('next', [batch])) as Read;
    this.buffer.push(...(await this.mapped(read.documents)));
    this.exhausted = read.exhausted;
  }
}

function shaping(state: CursorState, cursor: object, method: string): (...args: unknown[]) => object {
  return (...args: unknown[]) => {
    const problem = cursorMethodProblem({ of: state.origin.of }, method);
    if (problem !== undefined) {
      throw scriptError(problem, state.environment.line());
    }
    if (method === 'map') {
      const [map] = args;
      if (typeof map !== 'function') {
        throw scriptError('cursor.map() takes a function', state.environment.line());
      }
      state.maps.push(map as Mapper);
    } else if (method !== 'pretty') {
      state.shape.push({ method, arguments: jsonArguments(args, state.environment.json) });
    }
    return cursor;
  };
}

async function all(state: CursorState): Promise<unknown[]> {
  if (state.buffer.length === 0 && !state.exhausted) {
    const documents = (await state.send('toArray', [])) as readonly unknown[];
    state.exhausted = true;
    return state.mapped(documents);
  }
  const documents: unknown[] = [];
  for (;;) {
    await state.fill();
    if (state.buffer.length === 0) {
      return documents;
    }
    documents.push(...state.buffer.splice(0));
  }
}

async function next(state: CursorState): Promise<unknown> {
  await state.fill();
  return state.buffer.shift() ?? null;
}

async function hasNext(state: CursorState): Promise<boolean> {
  await state.fill();
  return state.buffer.length > 0;
}

async function forEach(state: CursorState, each: unknown): Promise<void> {
  if (typeof each !== 'function') {
    throw scriptError('cursor.forEach() takes a function', state.environment.line());
  }
  while (await hasNext(state)) {
    await (each as Mapper)(state.buffer.shift());
  }
}

function reads(state: CursorState): Readonly<Record<string, (...args: unknown[]) => unknown>> {
  return {
    toArray: () => all(state),
    next: () => next(state),
    hasNext: () => hasNext(state),
    forEach: (each: unknown) => forEach(state, each),
    count: () => state.send('count', []),
    size: () => state.send('count', []),
    itcount: () => state.send('itcount', []),
    explain: (verbosity: unknown) =>
      state.send('explain', [typeof verbosity === 'string' ? verbosity : 'queryPlanner']),
  };
}

/** The explain of a `find` or an `aggregate` with `executionStats`: `db.orders.explain().find(â€¦)`. */
export function explained(environment: ScriptEnvironment, origin: CursorOrigin): Promise<unknown> {
  return new CursorState(environment, origin, environment.nextCursor()).send('explain', ['executionStats']);
}

/** A new cursor of the script on what `find` or `aggregate` was called with. */
export function scriptCursor(environment: ScriptEnvironment, origin: CursorOrigin): object {
  const state = new CursorState(environment, origin, environment.nextCursor());
  const cursor: Record<string | symbol, unknown> = {};
  for (const method of cursorShapes) {
    cursor[method] = shaping(state, cursor, method);
  }
  Object.assign(cursor, reads(state));
  cursor[Symbol.asyncIterator] = async function* iterate(): AsyncGenerator {
    while (await hasNext(state)) {
      yield state.buffer.shift();
    }
  };
  environment.kinds.set(cursor, { kind: 'cursor' });
  readers.set(cursor, {
    resultDocuments: async () => {
      const documents = (await state.send('toArray', [resultDocuments + 1])) as readonly unknown[];
      return state.mapped(documents);
    },
  });
  return cursor;
}
