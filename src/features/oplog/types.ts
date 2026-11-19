/**
 * What the cards of redis-oplog share: the options a MongoDB connection keeps about what it publishes, an event, the
 * linked connection of a connection, and the part of the app's state that remembers the last error of each.
 *
 * The part of the app's state (`OplogState`, its events and its reducer) is written here, pure, until it moves to
 * `src/shared/state/oplog.ts` and joins the lists of `src/shared/state/index.ts`; {@link oplogOf} reads it meanwhile.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { ConnectionId } from '../../shared/ids';
import type { AppState } from '../../shared/state';
import { savedConnection } from '../../shared/state/connections';

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

/** The last error publishing the writes of a connection, for the tool `redis_oplog_status`. */
export interface PublishFailure {
  readonly time: number;
  readonly message: string;
}

/** The part of the app's state about publishing: by MongoDB connection, its last error and its last warning. */
export interface OplogState {
  readonly lastErrors: Readonly<Record<string, PublishFailure>>;
  /** When the warning of `oplog.publish-error` was last shown. */
  readonly warnedAt: Readonly<Record<string, number>>;
}

/** Nothing failed yet. */
export const initialOplogState: OplogState = { lastErrors: {}, warnedAt: {} };

/** The events of this part of the state. */
export type OplogStateEvent =
  | {
      readonly slice: 'oplog';
      readonly type: 'failed';
      readonly connection: ConnectionId;
      readonly failure: PublishFailure;
      /** Whether the warning was shown for this failure. */
      readonly warned: boolean;
    }
  | { readonly slice: 'oplog'; readonly type: 'forgotten'; readonly connection: ConnectionId };

function without<T>(record: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> {
  return Object.fromEntries(Object.entries(record).filter(([each]) => each !== key));
}

/** Changes this part of the state. */
export function reduceOplog(state: OplogState, event: OplogStateEvent): OplogState {
  switch (event.type) {
    case 'failed':
      return {
        lastErrors: { ...state.lastErrors, [event.connection]: event.failure },
        warnedAt: event.warned ? { ...state.warnedAt, [event.connection]: event.failure.time } : state.warnedAt,
      };
    case 'forgotten':
      return {
        lastErrors: without(state.lastErrors, event.connection),
        warnedAt: without(state.warnedAt, event.connection),
      };
  }
}

/** The publishing part of the app's state; none failed while it is not one of the parts of `AppState`. */
export function oplogOf(state: AppState): OplogState {
  return (state as AppState & { readonly oplog?: OplogState }).oplog ?? initialOplogState;
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
