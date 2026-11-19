/**
 * The run of a script in the process of a run (`playground.run`, `playground.runtime`, T6): the script, already
 * rewritten (`playground.rewrite`), runs in a context of its own (`node:vm`) that has the names of the runtime and
 * those of the language, and nothing else: no `require`, `process`, timers, files or network. Each call to the database
 * becomes a message to the main process, which answers it; the script ends with its value, or its error and line.
 *
 * The context is not what keeps the script from the system: the process is, which is given nothing but these
 * messages (`process-entry.ts`).
 */
import { createContext, runInContext } from 'node:vm';
import type { Json } from '../../shared/engine-request';
import { resolveName } from '../../shared/playground/rewrite';
import { errorMessage, scriptLine } from '../../features/playground/results/ending';
import { resultValue } from '../../features/playground/results/value';
import {
  bsonTypes,
  printedLine,
  useDatabase,
  type FromRun,
  type Printed,
  type PrintLayout,
  type RunStart,
  type ToRun,
} from '../../features/playground/runtime';
import type { RunError, RunValue } from '../../features/playground/types';
import {
  callingLine,
  lineOfError,
  scriptError,
  scriptFile,
  stackLine,
  type CallParts,
  type RuntimeKind,
  type ScriptEnvironment,
} from './environment';
import { cursorReader } from './script-cursor';
import { scriptDatabase } from './script-database';
import { scriptMongo } from './script-session';
import { bsonTypeValue, extendedJson, NotBson, scriptValue, toJson } from './values';

/** Where the messages of the run go: to the main process. */
export type Post = (message: FromRun) => void;

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly line: number | undefined;
}

function runtimeNameOf(kinds: WeakMap<object, RuntimeKind>): (value: object) => string | undefined {
  return (value) => {
    const kind = kinds.get(value);
    if (kind === undefined) {
      return undefined;
    }
    switch (kind.kind) {
      case 'database':
        return `The database ${kind.name}`;
      case 'collection':
        return `The collection ${kind.database}.${kind.name}`;
      case 'cursor':
      case 'explainable':
      case 'mongo':
      case 'session':
        return `A ${kind.kind}`;
    }
  };
}

/** One run of a script: the state its objects share, and the calls waiting for the main process. */
class ScriptRun {
  readonly pending = new Map<number, Pending>();
  readonly kinds = new WeakMap<object, RuntimeKind>();
  readonly sessions = new Map<number, object>();
  readonly runtimeName = runtimeNameOf(this.kinds);
  current: string;
  lastLine: number | undefined;
  calls = 0;
  cursors = 0;
  database: object;
  mongo: object;
  environment: ScriptEnvironment;

  constructor(
    readonly start: RunStart,
    readonly post: Post,
  ) {
    this.current = start.database;
    this.environment = {
      send: (call) => this.send(call),
      kinds: this.kinds,
      nextCursor: () => (this.cursors += 1),
      current: () => this.current,
      line: () => this.line(),
      json: (value) => toJson(value, this.runtimeName),
      objects: { mongo: () => this.mongo, session: (number) => this.sessions.get(number) },
    };
    this.mongo = scriptMongo(this.environment, this.sessions);
    this.database = scriptDatabase(this.environment, { database: this.current });
  }

  /** The line of the script calling now, or the last one known. */
  line(): number | undefined {
    const line = scriptLine(callingLine(), this.start.firstLine);
    this.lastLine = line ?? this.lastLine;
    return this.lastLine;
  }

  send(parts: CallParts): Promise<unknown> {
    const line = this.line();
    this.calls += 1;
    const id = this.calls;
    const call = { ...parts, scriptDatabase: this.current, ...(line === undefined ? {} : { line }) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, line });
      this.post({ kind: 'call', id, call });
    });
  }

  receive(message: Exclude<ToRun, { readonly kind: 'start' }>): void {
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    if (message.kind === 'reply') {
      pending.resolve(scriptValue(message.value));
    } else {
      pending.reject(scriptError(message.error.message, message.error.line ?? pending.line, message.labels ?? []));
    }
  }

  use(name: unknown): string {
    const answer = useDatabase(name);
    if (answer.kind === 'error') {
      throw scriptError(answer.message, this.line());
    }
    this.current = answer.database;
    this.database = scriptDatabase(this.environment, { database: this.current });
    return answer.reply;
  }

  printed(value: unknown): Printed {
    if (typeof value === 'string') {
      return { kind: 'string', text: value };
    }
    if (typeof value === 'function') {
      return { kind: 'function', name: value.name };
    }
    const kind = typeof value === 'object' && value !== null ? this.kinds.get(value) : undefined;
    switch (kind?.kind) {
      case 'cursor':
        return { kind: 'cursor' };
      case 'mongo':
        return { kind: 'mongo' };
      case 'session':
        return { kind: 'value', value: kind.describe() };
      case 'database':
      case 'collection':
      case 'explainable':
        return { kind: 'string', text: String(value) };
      case undefined:
        break;
    }
    try {
      return { kind: 'value', value: toJson(value, this.runtimeName) };
    } catch (error) {
      if (error instanceof NotBson) {
        return { kind: 'text', text: String(value) };
      }
      throw error;
    }
  }

  print(layout: PrintLayout): (...values: unknown[]) => void {
    return (...values) => {
      this.post({
        kind: 'print',
        line: printedLine(
          values.map((value) => this.printed(value)),
          layout,
        ),
      });
    };
  }

  async lastValue(value: unknown): Promise<RunValue> {
    if (value === undefined) {
      return { kind: 'none' };
    }
    if (typeof value === 'string') {
      return { kind: 'text', text: value };
    }
    const reader = cursorReader(value);
    if (reader !== undefined) {
      return resultValue({
        kind: 'cursor',
        documents: (await reader.resultDocuments()).map((each) => this.json(each)),
      });
    }
    const printed = this.printed(value);
    switch (printed.kind) {
      case 'value':
        return resultValue({ kind: 'value', value: printed.value });
      case 'string':
      case 'text':
        return { kind: 'text', text: printed.text };
      case 'cursor':
      case 'mongo':
      case 'function':
        return { kind: 'text', text: printedLine([printed], 'line') };
    }
  }

  json(value: unknown): Json {
    return toJson(value, this.runtimeName);
  }

  error(thrown: unknown): RunError {
    const isError = typeof thrown === 'object' && thrown !== null && 'message' in thrown;
    const name = isError && 'name' in thrown && typeof thrown.name === 'string' ? thrown.name : '';
    const message = isError ? String(thrown.message) : String(thrown);
    const stack = isError && 'stack' in thrown && typeof thrown.stack === 'string' ? thrown.stack : undefined;
    const line = lineOfError(thrown) ?? scriptLine(stackLine(stack), this.start.firstLine);
    return { message: errorMessage(name, message), ...(line === undefined ? {} : { line }) };
  }
}

function sleep(milliseconds: unknown): Promise<void> {
  const wait = Math.max(0, Number(milliseconds) || 0);
  return new Promise((resolve) => {
    setTimeout(resolve, wait);
  });
}

/** The names of the runtime, as the context of the script has them. */
function contextOf(run: ScriptRun): object {
  const bson = Object.fromEntries(
    bsonTypes
      .filter((name) => name !== 'EJSON')
      .map((name) => [
        name,
        function bsonType(...args: unknown[]): unknown {
          return bsonTypeValue(name, args);
        },
      ]),
  );
  const context: Record<string, unknown> = {
    use: (name: unknown) => run.use(name),
    print: run.print('line'),
    printjson: run.print('pretty'),
    console: {
      log: run.print('line'),
      info: run.print('line'),
      warn: run.print('line'),
      error: run.print('line'),
      dir: run.print('pretty'),
    },
    sleep,
    ...bson,
    EJSON: extendedJson(run.runtimeName),
    [resolveName]: (value: unknown) => value,
  };
  let replaced: { value: unknown } | undefined;
  Object.defineProperty(context, 'db', {
    get: () => (replaced === undefined ? run.database : replaced.value),
    set: (value: unknown) => {
      replaced = { value };
    },
    enumerable: true,
  });
  return createContext(context, { codeGeneration: { strings: true, wasm: false } });
}

/**
 * Runs a script: from the message `start`, until its last message (`done` or `failed`). Gives what receives the
 * main process's answers to its calls.
 */
export function runScript(start: RunStart, post: Post): (message: ToRun) => void {
  const run = new ScriptRun(start, post);
  void (async () => {
    try {
      const value: unknown = await (runInContext(start.code, contextOf(run), {
        filename: scriptFile,
      }) as Promise<unknown>);
      post({ kind: 'done', value: await run.lastValue(value), database: run.current });
    } catch (thrown) {
      post({ kind: 'failed', error: run.error(thrown), database: run.current });
    }
  })();
  return (message) => {
    if (message.kind !== 'start') {
      run.receive(message);
    }
  };
}
