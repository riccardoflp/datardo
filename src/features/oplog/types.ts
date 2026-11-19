/**
 * What the cards of redis-oplog share: the options a MongoDB connection keeps about what it publishes, an event, the
 * linked connection of a connection, and the part of the app's state that remembers the last error of each, which is
 * in `src/shared/state/oplog.ts`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';
import type { OplogState } from '../../shared/state/oplog';

/**
 * The redis-oplog options of a MongoDB connection, as `SavedConnection.oplog` keeps them (Mongoster's names): the
 * **Channel prefix**, the **Namespaces** and the **Databases and collections**, one pattern each.
 */
export interface OplogSettings {
  readonly prefix: string;
  readonly namespaces: readonly string[];
  readonly scope: readonly string[];
}

/** No prefix, no namespace, every database and collection. */
export const defaultOplogSettings: OplogSettings = { prefix: '', namespaces: [], scope: [] };

/** A list of names: an array of texts, or one text of several lines or separated by commas; trimmed, none empty. */
function namesOf(value: unknown): readonly string[] {
  const items = Array.isArray(value)
    ? (value as readonly unknown[]).filter((each): each is string => typeof each === 'string')
    : typeof value === 'string'
      ? value.split(/[\n,]/u)
      : [];
  return items.map((each) => each.trim()).filter((each) => each !== '');
}

/** The options of a connection from what it keeps; the defaults for what is missing. */
export function oplogSettingsOf(value: Json | undefined): OplogSettings {
  const fields = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
  const prefix = (fields as { readonly prefix?: unknown }).prefix;
  return {
    prefix: typeof prefix === 'string' ? prefix : '',
    namespaces: namesOf((fields as { readonly namespaces?: unknown }).namespaces),
    scope: namesOf((fields as { readonly scope?: unknown }).scope),
  };
}

/** The event of one document: inserted, removed, or updated in some fields. `id` is the `_id` as canonical EJSON. */
export type OplogEvent =
  | { readonly e: 'i' | 'r'; readonly id: Json }
  | { readonly e: 'u'; readonly id: Json; readonly fields: readonly string[] };

/** Where the events of a MongoDB connection go: nowhere, a linked connection that was removed, or a Redis connection. */
export type Publishing =
  | { readonly kind: 'none' }
  | { readonly kind: 'missing-link' }
  | { readonly kind: 'publishes'; readonly linked: ConnectionView; readonly settings: OplogSettings };

/** Where the writes through a MongoDB connection are published. */
export function publishingOf(state: AppState, connection: ConnectionId): Publishing {
  const mongo = savedConnection(state.connections, connection);
  if (mongo?.engine !== 'mongodb' || mongo.publishesTo === undefined) {
    return { kind: 'none' };
  }
  const linked = savedConnection(state.connections, mongo.publishesTo);
  return linked?.engine === 'redis'
    ? { kind: 'publishes', linked, settings: oplogSettingsOf(mongo.oplog) }
    : { kind: 'missing-link' };
}

export { initialOplogState, reduceOplog } from '../../shared/state/oplog';
export type { OplogState, OplogStateEvent, PublishFailure } from '../../shared/state/oplog';

/** The publishing part of the app's state. */
export function oplogOf(state: AppState): OplogState {
  return state.oplog;
}

/** A number of a reply as canonical or relaxed EJSON: `3`, `{ $numberInt: "3" }`, `{ $numberLong: "3" }`. */
export function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const fields = value as Readonly<Record<string, unknown>>;
  const text = fields['$numberInt'] ?? fields['$numberLong'] ?? fields['$numberDouble'];
  return typeof text === 'string' ? Number(text) : undefined;
}

/** The text that names a value whatever its type: to compare `_id`s and values with their type. */
export function sameValueKey(value: unknown): string {
  return JSON.stringify(value);
}
