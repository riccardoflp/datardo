/**
 * What the unit tests of the keys area build their contexts from: the connection Cache local, connected to a Redis
 * 7.4, its targets, the words of a step, and the replies recorded from the test Redis
 * (`test/fixtures/replies/redis-7.4-keys.json`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionView } from '../../../src/shared/connection';
import type { RedisReply } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan, Step } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Tab, TabShows } from '../../../src/shared/state/tabs';
import type { Target } from '../../../src/shared/target';
import { contextOf, redisConnection, stateWith } from '../connection/context';

/** Cache local, writable, keeping its undo history. */
export const cache = redisConnection();

/** Cache local, read-only. */
export const cacheReadOnly = redisConnection({ readOnly: true });

/** The bytes of a name typed as text. */
export const name = (text: string): Uint8Array => new TextEncoder().encode(text);

/** The app's state with the connection connected to a Redis of this version, with these tabs open. */
export function connected(
  connection: ConnectionView = cache,
  redisVersion = '7.4.1',
  tabs: readonly TabShows[] = [],
): AppState {
  const state = stateWith([connection], { [connection.id]: 'connected' });
  const live = state.connections.live[connection.id];
  return {
    ...state,
    connections: {
      ...state.connections,
      live: {
        [connection.id]: {
          ...live,
          state: 'connected',
          server: { engine: 'redis', product: 'Redis', version: redisVersion, redisVersion },
        },
      },
    },
    tabs: {
      ...state.tabs,
      tabs: tabs.map((shows, index): Tab => ({
        id: tabId(`t${String(index + 1)}`),
        shows,
        lastActive: 0,
        loaded: true,
      })),
    },
  };
}

/** The target of a key of db0. */
export function onKey(key: string | Uint8Array, connection: ConnectionView = cache, database = 0): Target {
  return { kind: 'key', connection: connection.id, database, key: typeof key === 'string' ? name(key) : key };
}

/** The target of a database. */
export function onDatabase(database = 0, connection: ConnectionView = cache): Target {
  return { kind: 'redis-database', connection: connection.id, database };
}

/** A context of a feature of the keys area on a target, in a state (Cache local connected by default). */
export function keyContext(feature: string, target: Target, state: AppState = connected()): Context {
  return contextOf(feature, state, target);
}

/** The plan of an outcome that runs, or a failure that says what it was instead. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The words of an engine step, as text. */
export function wordsOf(step: Step | undefined): string[] {
  if (step?.kind !== 'engine' || step.request.engine !== 'redis') {
    return [];
  }
  return step.request.command.map((word) => new TextDecoder().decode(word));
}

/** The commands of the engine steps of a plan, each as one line of words. */
export function commandsOf(outcome: Outcome): string[] {
  return planOf(outcome).steps.map((step) => wordsOf(step).join(' '));
}

/** The words of a request of a read, as text. */
export function requestWords(request: { readonly request: { readonly engine: string } }): string {
  const redis = request.request as { readonly command?: readonly Uint8Array[] };
  return (redis.command ?? []).map((word) => new TextDecoder().decode(word)).join(' ');
}

type Recorded = Readonly<Record<string, readonly unknown[]>>;

let recorded: Recorded | undefined;

function decoded(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decoded);
  }
  if (typeof value === 'object' && value !== null) {
    const tagged = value as { bytes?: string; error?: string; number?: string; map?: unknown[][] };
    if (tagged.bytes !== undefined) {
      return Uint8Array.from(Buffer.from(tagged.bytes, 'base64'));
    }
    if (tagged.error !== undefined) {
      return { kind: 'error', message: tagged.error };
    }
    if (tagged.number !== undefined) {
      return Number(tagged.number);
    }
    return { kind: 'map', entries: (tagged.map ?? []).map(([key, each]) => [decoded(key), decoded(each)]) };
  }
  return value;
}

/** The replies recorded for one exchange of `redis-7.4-keys.json`, as the engine gives them. */
export function recordedReplies(exchange: string): readonly RedisReply[] {
  recorded ??= JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'fixtures', 'replies', 'redis-7.4-keys.json'), 'utf8'),
  ) as Recorded;
  const replies = recorded[exchange];
  if (replies === undefined) {
    throw new Error(`No recorded exchange ${exchange}.`);
  }
  return replies.map(decoded) as readonly RedisReply[];
}
