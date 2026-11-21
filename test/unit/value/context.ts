/**
 * What the unit tests of the value area build their contexts from: the Redis connection Cache local, a key on it, the
 * server's version, and the answers of the reads a write asks for.
 */
import * as check from '../../../src/features/value/check';
import type { Format } from '../../../src/features/value/format';
import type { ConnectionView, RedisServerInfo } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Answers, Context, EngineStep, Outcome, Plan, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';

export const cacheId = connectionId('c-cache');

/** The saved Redis connection Cache local. */
export function cacheConnection(readOnly = false): ConnectionView {
  return {
    id: cacheId,
    name: 'Cache local',
    engine: 'redis',
    hosts: 'cache:6379',
    readOnly,
    keepsUndo: true,
    address: 'redis://cache',
    secrets: { ...noSecretsSaved, connectionString: true },
  };
}

/** The UTF-8 bytes of a text. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** The bytes written as pairs of hexadecimal digits: `00 ff`. */
export function bytes(pairs: string): Uint8Array {
  return Uint8Array.from(
    pairs.split(/\s+/u).filter((pair) => pair !== ''),
    (pair) => Number.parseInt(pair, 16),
  );
}

/** What a context is built with: the key, whether the connection is read-only, the server's version. */
export interface KeyContext {
  readonly key?: string | Uint8Array;
  readonly readOnly?: boolean;
  readonly version?: string;
}

/** A context of the feature on a key of Cache local, connected to a Redis of the version given (7.4 by default). */
export function keyContext(feature: string, options: KeyContext = {}): Context {
  const key = options.key ?? 'user:7';
  const server: RedisServerInfo = {
    engine: 'redis',
    product: 'Redis',
    version: options.version ?? '7.4.1',
    redisVersion: options.version ?? '7.4.1',
  };
  return {
    feature: featureId(feature),
    now: 1_763_400_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'key', connection: cacheId, database: 0, key: typeof key === 'string' ? utf8(key) : key },
    state: {
      ...initialState,
      connections: {
        ...initialConnectionsState,
        loaded: true,
        saved: [cacheConnection(options.readOnly ?? false)],
        live: { [cacheId]: { state: 'connected', server } },
      },
    },
  };
}

/** What is typed in an editor or a form: `{ text, format }`. */
export function typed(text: string, format: Format = 'text'): { readonly text: string; readonly format: Format } {
  return { text, format };
}

/** The answers of a write once its reads are there: the key's type, then the replies of what it compares. */
export function readAnswers(type: string, current?: readonly unknown[]): Answers {
  return current === undefined ? { check: { type } } : { check: { type }, current: { replies: current } };
}

/** The plan of an outcome, or a failure that says what the outcome was. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The question of a plan's confirmation: the first line of its text; none for a plan that is not confirmed. */
export function questionOf(plan: Plan): string | undefined {
  return plan.danger.kind === 'none' ? undefined : plan.danger.text.split('\n')[0];
}

/** What a plan's confirmation says under its question; empty when nothing. */
export function detailOf(plan: Plan): string | undefined {
  return plan.danger.kind === 'none' ? undefined : plan.danger.text.split('\n').slice(1).join('\n');
}

/** The texts of the steps of a plan, as the confirmation and the Log show them. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return planOf(outcome).steps.map((step) => (step as EngineStep).text);
}

/** The words of each step of a plan, as the engine is sent them. */
export function sentCommands(outcome: Outcome): readonly (readonly Uint8Array[])[] {
  return planOf(outcome).steps.map((step) => {
    const request = (step as EngineStep).request;
    return request.engine === 'redis' ? request.command : [];
  });
}

/** The commands a Read sends, each as its words in UTF-8 joined by spaces: `HSCAN user:7 0 COUNT 200`. */
export function readCommands(read: ReadRequest | Outcome): readonly string[] {
  if (read.kind !== 'engine') {
    throw new Error(`Expected a read of the engine, got ${read.kind}: ${JSON.stringify(read)}`);
  }
  const decoder = new TextDecoder();
  return read.requests.map((each) =>
    each.request.engine === 'redis' ? each.request.command.map((word) => decoder.decode(word)).join(' ') : '',
  );
}

/** The commands `value.check` sends for the read an outcome asks for, as {@link readCommands} writes them. */
export function neededCommands(outcome: Outcome, context: Context): readonly string[] {
  if (outcome.kind !== 'read' || outcome.need.read !== 'value.check') {
    throw new Error(`Expected a read of value.check, got ${JSON.stringify(outcome)}`);
  }
  return readCommands(check.request(context, outcome.need.args));
}

/** The code and message of a refusal, or the kind of the outcome instead. */
export function refusalOf(outcome: Outcome): { readonly code: string; readonly message: string } | string {
  return outcome.kind === 'refuse' ? { code: outcome.code, message: outcome.message } : outcome.kind;
}

/** The read an outcome asks for: its key, its Read and its arguments, or the kind of the outcome instead. */
export function needOf(
  outcome: Outcome,
): { readonly key: string; readonly read: string; readonly args: unknown } | string {
  return outcome.kind === 'read'
    ? { key: outcome.need.key, read: outcome.need.read, args: outcome.need.args }
    : outcome.kind;
}
