/**
 * What the unit tests of the tree area build their inputs from: a state with saved connections, one of them current,
 * the tree island of that connection, and replies recorded from real servers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConnectionStateName, ConnectionView } from '../../../src/shared/connection';
import type { Json, RedisReply } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { Pin } from '../../../src/shared/state/nav';
import {
  freshIsland,
  type TreeInput,
  type TreeIsland,
  type TreeItem,
  type TreeNode,
} from '../../../src/features/tree/types';
import { mongoConnection, redisConnection, stateWith } from '../connection/context';

export { mongoConnection, redisConnection };

/** What a test changes of the defaults. */
export interface InputOptions {
  readonly connections?: readonly ConnectionView[];
  readonly current?: ConnectionView;
  readonly state?: ConnectionStateName;
  readonly pins?: readonly Pin[];
  readonly island?: Partial<TreeIsland>;
  readonly now?: number;
  /** The features that are not built; every other one is. */
  readonly missing?: readonly string[];
  readonly settings?: Readonly<Record<string, Json>>;
}

/** The app's state with the connections, the first one current and connected unless said otherwise. */
export function stateOf(options: InputOptions = {}): AppState {
  const connections = options.connections ?? [mongoConnection()];
  const current = options.current ?? connections[0];
  const base = stateWith(connections, current === undefined ? {} : { [current.id]: options.state ?? 'connected' });
  return {
    ...base,
    nav: {
      ...base.nav,
      ...(current === undefined ? {} : { current: current.id }),
      pins: current === undefined || options.pins === undefined ? {} : { [current.id]: options.pins },
    },
    settings: { ...base.settings, stored: options.settings ?? {} },
  };
}

/** The input of the views of the tree. */
export function inputOf(options: InputOptions = {}): TreeInput {
  const missing = new Set(options.missing ?? []);
  return {
    state: stateOf(options),
    island: { ...freshIsland, ...options.island },
    now: options.now ?? 10_000,
    isAvailable: (feature) => !missing.has(feature),
  };
}

/** A context of a feature on the state. */
export function contextOf(feature: string, state: AppState = stateOf()): Context {
  return {
    feature: featureId(feature),
    now: 10_000,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'app' },
    state,
  };
}

/** The nodes among the items. */
export function nodesOf(items: readonly TreeItem[]): readonly TreeNode[] {
  return items.filter((item): item is TreeNode => item.kind === 'node');
}

/** The names of the nodes, or the text of the other lines. */
export function linesOf(items: readonly TreeItem[]): readonly string[] {
  return items.map((item) => (item.kind === 'node' ? item.name : item.text));
}

const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');

/** A recorded reply of JSON: canonical Extended JSON for MongoDB. */
export function recorded(name: string): Json {
  return JSON.parse(readFileSync(join(folder, name), 'utf8')) as Json;
}

/** A recorded text reply of Redis, as its bytes. */
export function recordedBytes(name: string): Uint8Array {
  return Uint8Array.from(readFileSync(join(folder, name)));
}

function redisOf(value: unknown): RedisReply {
  if (Array.isArray(value)) {
    return value.map(redisOf);
  }
  if (typeof value === 'object' && value !== null) {
    const object = value as { $bytes?: string; $map?: unknown[][] };
    if (object.$bytes !== undefined) {
      return Uint8Array.from(Buffer.from(object.$bytes, 'base64'));
    }
    if (object.$map !== undefined) {
      return { kind: 'map', entries: object.$map.map(([key, each]) => [redisOf(key), redisOf(each)] as const) };
    }
  }
  return value as RedisReply;
}

/** A recorded reply of Redis written as JSON (`$bytes`, `$map`), as the engine gives it back. */
export function recordedRedis(name: string): RedisReply {
  return redisOf(recorded(name));
}

/** Text as bytes. */
export function bytes(...names: readonly string[]): readonly Uint8Array[] {
  return names.map((name) => new TextEncoder().encode(name));
}
