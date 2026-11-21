/**
 * What the cards of the document area share: where the documents are (the collection, its connection and how that
 * connection is now), the arguments a feature is started with, what the undo history keeps of a write, and what a
 * write says once the runner gives it the replies of its steps.
 *
 * A feature of this area is started on a collection: by `args.connection`, `args.database` and `args.collection` when
 * the window sends them, otherwise by the tab named by `args.tab` (or the active tab) when it is a collection tab or a
 * document tab, otherwise by the target. Values cross as canonical Extended JSON (R5.5): an `_id` is
 * `{ "$oid": "…" }`, `{ "$numberInt": "7" }`.
 */
import type { Json } from '../../shared/engine-request';
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { connectionId, tabId, type ConnectionId, type TabId } from '../../shared/ids';
import type { Tab } from '../../shared/state/tabs';
import type { Target } from '../../shared/target';

/** A collection of a saved connection, with how the connection is when the feature is started (D14). */
export interface DocumentPlace {
  readonly connection: ConnectionId;
  /** The name of the connection, or its identifier when it is no longer saved. */
  readonly connectionName: string;
  /** Whether the connection is still saved: a document history page can outlive it (`document.restore-version`). */
  readonly saved: boolean;
  readonly readOnly: boolean;
  /** Whether the connection keeps its undo history (`undo.per-connection`). */
  readonly keepsUndo: boolean;
  readonly database: string;
  readonly collection: string;
  /** Whether the collection is a view. */
  readonly view: boolean;
  /** The tab the feature was started from, when it was a collection tab or a document tab. */
  readonly tab?: TabId;
}

/** A JSON object, as a reader of arguments sees it. */
export type JsonRecord = Readonly<Record<string, Json>>;

/** Whether a value is a JSON object (not an array, not null). */
export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The arguments a feature was started with, as an object; empty when there are none. */
export function startArgs(answers: Answers): JsonRecord {
  const args = answers['args'];
  return isRecord(args) ? args : {};
}

/** A text argument, or `undefined`. */
export function textArg(args: JsonRecord, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

/** The tab named by `args.tab`, or the active tab. */
export function tabOf(context: Context, answers: Answers): Tab | undefined {
  const named = textArg(startArgs(answers), 'tab');
  const id = named === undefined ? context.state.tabs.active : tabId(named);
  return context.state.tabs.tabs.find((tab) => tab.id === id);
}

interface Namespace {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
  readonly tab?: TabId;
}

function namespaceOfArgs(args: JsonRecord): Namespace | undefined {
  const connection = textArg(args, 'connection');
  const database = textArg(args, 'database');
  const collection = textArg(args, 'collection');
  if (connection === undefined || database === undefined || collection === undefined) {
    return undefined;
  }
  return { connection: connectionId(connection), database, collection, view: args['view'] === true };
}

function namespaceOfTab(tab: Tab | undefined, args: JsonRecord): Namespace | undefined {
  const shows = tab?.shows;
  if (tab === undefined || (shows?.kind !== 'collection' && shows?.kind !== 'document')) {
    return undefined;
  }
  const view = shows.view === true || args['view'] === true;
  return { connection: shows.connection, database: shows.database, collection: shows.collection, view, tab: tab.id };
}

function namespaceOfTarget(target: Target, args: JsonRecord): Namespace | undefined {
  return target.kind === 'collection'
    ? {
        connection: target.connection,
        database: target.database,
        collection: target.collection,
        view: args['view'] === true,
      }
    : undefined;
}

/** The collection a feature works on, and how its connection is now; `undefined` when it was started on none. */
export function placeOf(context: Context, answers: Answers): DocumentPlace | undefined {
  const args = startArgs(answers);
  const where =
    namespaceOfArgs(args) ?? namespaceOfTab(tabOf(context, answers), args) ?? namespaceOfTarget(context.target, args);
  if (where === undefined) {
    return undefined;
  }
  const saved = context.state.connections.saved.find((each) => each.id === where.connection);
  return {
    ...where,
    connectionName: saved?.name ?? where.connection,
    saved: saved !== undefined,
    readOnly: saved?.readOnly ?? false,
    keepsUndo: saved?.keepsUndo ?? true,
  };
}

/**
 * The collection a feature works on. Every control that starts a feature of this area names one, so a start without
 * one is a fault of the caller, not something the user can cause.
 */
export function requiredPlace(context: Context, answers: Answers): DocumentPlace {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error(`${context.feature} is started on a collection.`);
  }
  return place;
}

/** A value of the arguments that the feature cannot do without, such as the `_id` of the document it is started on. */
export function requiredArg(context: Context, answers: Answers, name: string): Json {
  const value = startArgs(answers)[name];
  if (value === undefined) {
    throw new Error(`${context.feature} is started with ${name}.`);
  }
  return value;
}

/** The target of the collection of a place. */
export function collectionTarget(place: DocumentPlace): Target {
  return { kind: 'collection', connection: place.connection, database: place.database, collection: place.collection };
}

/** `shop.orders`, as the cards write a namespace. */
export function namespaceText(place: DocumentPlace): string {
  return `${place.database}.${place.collection}`;
}

/**
 * What the undo history keeps before the steps of a write (`undo.record`, "Reads"): the documents matching the filter
 * the steps send, the documents with given `_id`s, or the documents the steps insert, whose `_id`s are those of the
 * replies when the documents have none. `count` is the number the plan announces (`undo.note`).
 */
export type KeptDocuments =
  | {
      readonly kind: 'filter';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      readonly filter: Json;
      /** The filter as the user wrote it, when the steps send a narrower one (D39). */
      readonly written?: Json;
      readonly count: number;
    }
  | {
      readonly kind: 'ids';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      readonly ids: readonly Json[];
      readonly count: number;
    }
  | {
      readonly kind: 'inserted';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      /** The `_id`s of the documents that carry one; the others are taken from the replies of the steps. */
      readonly ids: readonly Json[];
      readonly count: number;
    };

/** The collection of a place, as what the undo history keeps names it. */
export function keptCollection(place: DocumentPlace): {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
} {
  return { connection: place.connection, database: place.database, collection: place.collection };
}

/**
 * What a write says once its steps have run, from their replies: what follows it (a notification with the counts the
 * server gave, reading the pages again), or a refusal when the reply shows that nothing was written for a reason the
 * card names. Each write of this area exports it as `afterReplies(context, answers, replies)`.
 */
export type ReplyOutcome =
  { readonly kind: 'after'; readonly after: readonly After[] } | Extract<Outcome, { readonly kind: 'refuse' }>;

/** Reads the pages of the connection again: the table runs its query again, the tree is refreshed. */
export function refreshAfter(place: DocumentPlace): After {
  return { kind: 'refresh', connection: place.connection };
}
