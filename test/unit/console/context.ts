/**
 * What the unit tests of the console area build their inputs from: the connections Cache local (allows writes) and
 * Cache production (read-only), a console's state, the app's state with consoles, and commands from words.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConsoleSession, ConsoleState, Reply } from '../../../src/features/console/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { connectionId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { contextOf, redisConnection, stateWith } from '../connection/context';

/** Cache local, which allows writes, on db0. */
export const cacheLocal: ConnectionView = redisConnection();

/** Cache production, which is read-only. */
export const cacheProduction: ConnectionView = redisConnection({
  id: connectionId('c-production'),
  name: 'Cache production',
  readOnly: true,
});

/** The arguments of a command, from words of text. */
export function words(...parts: readonly string[]): readonly Uint8Array[] {
  return parts.map((part) => new TextEncoder().encode(part));
}

/** The bytes of a list of byte values. */
export function bytes(...values: readonly number[]): Uint8Array {
  return Uint8Array.from(values);
}

/** A session on db0, RESP3, with no transaction. */
export function session(overrides: Partial<ConsoleSession> = {}): ConsoleSession {
  return { database: 0, watching: false, protocol: 3, ...overrides };
}

/** The console of a connection, ready, on db0. */
export function consoleOn(connection: ConnectionView, overrides: Partial<ConsoleState> = {}): ConsoleState {
  return {
    connection: connection.id,
    status: 'ready',
    session: session(),
    opened: 1,
    entries: [],
    history: [],
    ...overrides,
  };
}

/** The app's state with Cache local and Cache production connected to Redis `version`, and these consoles. */
export function consoleState(
  consoles: readonly ConsoleState[] = [],
  version = '7.2.4',
  remembered: Readonly<Record<string, Json>> = {},
): AppState {
  const base = stateWith([cacheLocal, cacheProduction]);
  const server = { engine: 'redis', product: 'Redis', version, redisVersion: version } as const;
  const live = {
    [cacheLocal.id]: { state: 'connected' as const, server },
    [cacheProduction.id]: { state: 'connected' as const, server },
  };
  return {
    ...base,
    connections: { ...base.connections, live },
    runner: { ...base.runner, remembered },
    consoles: Object.fromEntries(consoles.map((each) => [each.connection, each])),
  };
}

/** A context of a console feature started on a connection. */
export function consoleContext(feature: string, state: AppState, connection: ConnectionView = cacheLocal): Context {
  return contextOf(feature, state, { kind: 'connection', connection: connection.id });
}

const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

function fromJson(value: unknown): RedisReply {
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  if (Array.isArray(value)) {
    return value.map(fromJson);
  }
  if (value !== null && typeof value === 'object') {
    const fields = value as Record<string, unknown>;
    if ('$hex' in fields) {
      return Uint8Array.from(Buffer.from(String(fields['$hex']), 'hex'));
    }
    if ('$error' in fields) {
      return { kind: 'error', message: String(fields['$error']) };
    }
    const entries = fields['$map'] as readonly (readonly [unknown, unknown])[];
    return { kind: 'map', entries: entries.map(([key, each]) => [fromJson(key), fromJson(each)] as const) };
  }
  return value as RedisReply;
}

/** A reply recorded from the test Redis (`test/integration/console/record-replies.test.ts`), as the engine gives it. */
export function recordedReply(name: string, part?: string): RedisReply {
  const json = JSON.parse(readFileSync(join(folder, `${name}.json`), 'utf8')) as Record<string, unknown>;
  return fromJson(part === undefined ? json : json[part]);
}

/** A bulk string reply of text. */
export function bulk(text: string): Reply {
  return { kind: 'bulk', bytes: new TextEncoder().encode(text) };
}

/** A simple string reply. */
export function simple(text: string): Reply {
  return { kind: 'simple', text };
}
