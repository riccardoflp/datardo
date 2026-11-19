/**
 * What the unit tests of the Server area build their inputs from: the connections Cache local (allows writes) and
 * Cache production (read-only), a context on one of them, replies recorded from Redis 7.4, and the text of commands.
 */
import type { ConnectionView } from '../../../src/shared/connection';
import type { RedisRequest } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { redisConnection, stateWith } from '../connection/context';
import { recordedBytes, recordedRedis } from '../tree/context';

export { recordedBytes, recordedRedis };

/** Cache local: a Redis connection that allows writes. */
export const cacheLocal: ConnectionView = redisConnection();

/** Cache production: a read-only Redis connection. */
export const cacheProduction: ConnectionView = redisConnection({
  id: connectionId('c-production'),
  name: 'Cache production',
  readOnly: true,
});

/** The app's state with both connections, connected, Cache local current. */
export function serverState(): AppState {
  const state = stateWith([cacheLocal, cacheProduction], {
    [cacheLocal.id]: 'connected',
    [cacheProduction.id]: 'connected',
  });
  return { ...state, nav: { ...state.nav, current: cacheLocal.id } };
}

/** A context of a feature started on a connection, at a fixed time. */
export function contextOn(feature: string, connection: ConnectionView = cacheLocal, state = serverState()): Context {
  return {
    feature: featureId(feature),
    now: 1_763_400_000_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'connection', connection: connection.id },
    state,
  };
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Text as the bytes of a reply. */
export function bytes(value: string): Uint8Array {
  return encoder.encode(value);
}

/** An error reply, as `parse` receives it in place of the reply of a request that failed. */
export function failed(message: string): { kind: 'error'; message: string } {
  return { kind: 'error', message };
}

/** A command as one line of text: `CLIENT KILL ID 42`. */
export function commandText(request: RedisRequest): string {
  return request.command.map((word) => decoder.decode(word)).join(' ');
}

/** The commands a Read sends, as lines of text. */
export function commandsOf(read: ReadRequest | Outcome): readonly string[] {
  if (read.kind !== 'engine') {
    return [];
  }
  return read.requests.map((each) => (each.request.engine === 'redis' ? commandText(each.request) : ''));
}

/** The plan of an outcome, or a failure of the test. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** A time of the day of 19 November 2026, where the tests run. */
export function at(hours: number, minutes: number, seconds: number, day = 19): number {
  return new Date(2026, 10, day, hours, minutes, seconds).getTime();
}
