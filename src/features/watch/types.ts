/**
 * The types of the Watch changes area: what is watched, a change event as the list holds it (`watch.event-summary`),
 * and the five types of the toggles (`watch.visible-events`). The state of the pages is in `page/state.ts`.
 */
import type { Json } from '../../shared/engine-request';
import type { JsonObject } from '../history/types';

/** What a page watches: a collection, a database, or the whole deployment of a connection. */
export interface Watched {
  readonly connection: string;
  readonly database?: string;
  readonly collection?: string;
}

/** A truncated array of an update: its field path and its new size. */
export interface TruncatedArray {
  readonly field: string;
  readonly size: number;
}

/** A change event as the list holds it: what its line shows and what the inspector reads (`watch.event-summary`). */
export interface WatchEvent {
  /** Its number in the page, from 1. */
  readonly number: number;
  /** In milliseconds since 1970. */
  readonly time: number;
  /** Its `operationType`. */
  readonly type: string;
  /** `<database>.<collection>`, or only the database. */
  readonly namespace: string;
  /** The `_id` of the document in mongosh syntax; empty when the change event is not about a document. */
  readonly id: string;
  /** The text of **changes**. */
  readonly changes: string;
  /** For an update: the fields it set with their values, those it removed, the arrays it truncated. */
  readonly updated?: JsonObject;
  readonly removed?: readonly string[];
  readonly truncated?: readonly TruncatedArray[];
  /** The document after (`fullDocument`) and the document before (`fullDocumentBeforeChange`). */
  readonly after?: JsonObject;
  readonly before?: JsonObject;
  /** The resume token: the `_id` of the change event. */
  readonly token?: Json;
  /** The change event as the server sent it, as canonical Extended JSON. */
  readonly event: JsonObject;
}

/** The five types of the toggles. */
export type EventCategory = 'insert' | 'update' | 'replace' | 'delete' | 'other';

/** The types of the toggles, in the order of the page. */
export const eventCategories: readonly EventCategory[] = ['insert', 'update', 'replace', 'delete', 'other'];

/** The type of the toggles a change event is of: its own for the four writes, **other** for every other. */
export function categoryOf(type: string): EventCategory {
  return type === 'insert' || type === 'update' || type === 'replace' || type === 'delete' ? type : 'other';
}

/** What is watched as the toolbar writes it: `shop.orders`, `shop`, or `undefined` for all databases. */
export function watchedPlace(watched: Watched): string | undefined {
  if (watched.database === undefined) {
    return undefined;
  }
  return watched.collection === undefined ? watched.database : `${watched.database}.${watched.collection}`;
}
