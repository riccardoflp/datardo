/**
 * What the objects of a script share in the process of a run (`playground.runtime`): the way their calls reach the
 * main process, which object of the runtime each one is, and the errors they throw in the script with their line.
 */
import type { Json } from '../../shared/engine-request';
import type { PlaygroundCall } from '../../features/playground/runtime';

/** The objects of the runtime, as printing and results name them. */
export type RuntimeKind =
  | { readonly kind: 'database'; readonly name: string }
  | { readonly kind: 'collection'; readonly database: string; readonly name: string }
  | { readonly kind: 'cursor' }
  | { readonly kind: 'explainable' }
  | { readonly kind: 'mongo' }
  | { readonly kind: 'session'; readonly describe: () => Json };

/** A call as an object of the runtime makes it: the environment adds the script's database and the line. */
export type CallParts = Omit<PlaygroundCall, 'scriptDatabase' | 'line'>;

/** What the objects of one run share. */
export interface ScriptEnvironment {
  /** Sends a call to the main process and gives its reply as a value of the script; must be called synchronously. */
  readonly send: (call: CallParts) => Promise<unknown>;
  /** Which object of the runtime each object is. */
  readonly kinds: WeakMap<object, RuntimeKind>;
  /** A new number for a cursor of the run. */
  readonly nextCursor: () => number;
  /** The script's current database: the one of the last `use("…")`, or the run's. */
  readonly current: () => string;
  /** The line of the script being run now, from 1: that of the call being made. */
  readonly line: () => number | undefined;
  /** A value of the script as Extended JSON; an object of the runtime (`db`, a cursor) throws. */
  readonly json: (value: unknown) => Json;
  /** The objects of the run the others give: the connection (`getMongo()`), and the sessions by their number. */
  readonly objects: {
    readonly mongo: () => object;
    readonly session: (number: number) => object | undefined;
  };
}

/** The arguments of a call as Extended JSON, the `undefined` ones at the end left out, as mongosh leaves them. */
export function jsonArguments(args: readonly unknown[], toJson: (value: unknown) => Json): Json[] {
  let count = args.length;
  while (count > 0 && args[count - 1] === undefined) {
    count -= 1;
  }
  return args.slice(0, count).map((each) => toJson(each));
}

/** The lines of the errors the runtime throws in the script, which the end of the run reports. */
const errorLines = new WeakMap<object, number>();

/** The labels of the errors of the server, which `withTransaction` reads. */
const errorLabels = new WeakMap<object, readonly string[]>();

/** An error thrown in the script by a call, with the line of the call and the server's labels. */
export function scriptError(message: string, line: number | undefined, labels: readonly string[] = []): Error {
  const error = new Error(message);
  if (line !== undefined) {
    errorLines.set(error, line);
  }
  if (labels.length > 0) {
    errorLabels.set(error, labels);
    Object.defineProperty(error, 'errorLabels', { value: [...labels], enumerable: false });
  }
  return error;
}

/** The line a call gave its error, when the runtime threw it. */
export function lineOfError(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null ? errorLines.get(error) : undefined;
}

/** Whether an error carries a label of the server. */
export function hasLabel(error: unknown, label: string): boolean {
  return typeof error === 'object' && error !== null && (errorLabels.get(error) ?? []).includes(label);
}

/** The name of the file the script runs as, which the frames of its stack carry. */
export const scriptFile = 'playground.js';

const framePattern = /playground\.js:(\d+):\d+/u;

/** The line of the script in a stack: that of its first frame in the script, from 1. */
export function stackLine(stack: string | undefined): number | undefined {
  const match = framePattern.exec(stack ?? '');
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** The line of the script that is calling now: the first frame of the script in the stack of here. */
export function callingLine(): number | undefined {
  return stackLine(new Error().stack);
}
