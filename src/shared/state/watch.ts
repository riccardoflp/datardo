/**
 * The part of the app's state about the Watch changes pages (watch.md), one for each tab: what is watched, the stream,
 * the change events kept and held, the resume token, and what the tab remembers (the text of **Filter**, **Current
 * document on update**, the types hidden and the search). The main process changes it from the stream
 * (`watch.stream`) and from the app steps of `watch.pause`, `watch.stop`, `watch.clear` and `watch.visible-events`;
 * the window draws the pages from it. Nothing of it is saved but what the tab remembers, which the tab keeps.
 *
 * The list never grows without bound: a page keeps the newest 1,000 change events, and holds at most as many while
 * it is paused (`watch.visible-events`, `watch.pause`).
 */
import type { Json } from '../engine-request';

/** A document as canonical Extended JSON. */
export type JsonFields = { readonly [key: string]: Json };

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
  readonly updated?: JsonFields;
  readonly removed?: readonly string[];
  readonly truncated?: readonly TruncatedArray[];
  /** The document after (`fullDocument`) and the document before (`fullDocumentBeforeChange`). */
  readonly after?: JsonFields;
  readonly before?: JsonFields;
  /** The resume token: the `_id` of the change event. */
  readonly token?: Json;
  /** The change event as the server sent it, as canonical Extended JSON. */
  readonly event: JsonFields;
}

/** The five types of the toggles. */
export type EventCategory = 'insert' | 'update' | 'replace' | 'delete' | 'other';

/** The change events a page keeps, and holds while paused. */
export const mostEvents = 1000;

/** The change events kept, in order of arrival, and how many of the oldest were dropped. */
export interface KeptEvents {
  readonly events: readonly WatchEvent[];
  readonly dropped: number;
}

/** The change events with those added: the newest {@link mostEvents}, in order of arrival. */
export function newestKept(events: readonly WatchEvent[], added: readonly WatchEvent[]): KeptEvents {
  const all = [...events, ...added];
  const dropped = Math.max(0, all.length - mostEvents);
  return { events: all.slice(dropped), dropped };
}

/** Where the stream of a page is. */
export type StreamStatus = 'starting' | 'watching' | 'stopped' | 'error';

/** What the page says above the list. */
export type PageMessage =
  | { readonly kind: 'standalone'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string }
  | { readonly kind: 'invalidated' };

/** What a tab remembers of its page, also across a restart (`tab.restore`). */
export interface WatchMemory {
  readonly filter: string;
  readonly fullDocument: boolean;
  readonly hiddenTypes: readonly EventCategory[];
  readonly search: string;
}

/** The page of one tab. */
export interface WatchPage extends WatchMemory {
  readonly watched: Watched;
  readonly status: StreamStatus;
  readonly message?: PageMessage;
  /** The change events of the list, in order of arrival. */
  readonly events: readonly WatchEvent[];
  /** Whether the list is paused, and the change events it holds meanwhile. */
  readonly paused: boolean;
  readonly held: readonly WatchEvent[];
  /** The oldest change events dropped by the cap, while kept or held. */
  readonly dropped: number;
  /** The number of the next change event. */
  readonly nextNumber: number;
  /** The last resume token the stream gave, and whether it is that of an `invalidate` (`startAfter`). */
  readonly resumeToken?: Json;
  readonly afterInvalidate?: boolean;
  /** Whether the watched collection records pre-images; unknown until read, and for a database or the deployment. */
  readonly preImages?: boolean;
  /** The version of the server, once the stream asked it (pre-images exist from MongoDB 6.0). */
  readonly serverVersion?: string;
  /** The number of the change event the inspector shows. */
  readonly selected?: number;
}

/** The pages, by the identifier of their tab. */
export type WatchPages = Readonly<Record<string, WatchPage>>;

/** What a tab remembers when nothing was changed: **Current document on update** on, nothing hidden. */
export const defaultMemory: WatchMemory = { filter: '', fullDocument: true, hiddenTypes: [], search: '' };

/** What changes a page. */
export type WatchPageEvent =
  | { readonly kind: 'opened'; readonly tab: string; readonly watched: Watched; readonly memory?: WatchMemory }
  | { readonly kind: 'starting'; readonly tab: string }
  | {
      readonly kind: 'received';
      readonly tab: string;
      readonly events: readonly WatchEvent[];
      readonly resumeToken?: Json;
      readonly invalidated: boolean;
    }
  | { readonly kind: 'failed'; readonly tab: string; readonly message: PageMessage }
  | { readonly kind: 'stopped'; readonly tab: string }
  | { readonly kind: 'paused'; readonly tab: string; readonly paused: boolean }
  | { readonly kind: 'cleared'; readonly tab: string }
  | { readonly kind: 'remembered'; readonly tab: string; readonly memory: Partial<WatchMemory> }
  | { readonly kind: 'pre-images'; readonly tab: string; readonly recorded: boolean }
  | { readonly kind: 'server-version'; readonly tab: string; readonly version: string }
  | { readonly kind: 'selected'; readonly tab: string; readonly number?: number }
  | { readonly kind: 'closed'; readonly tab: string };

/** The events of this part of the state. */
export type WatchStateEvent = WatchPageEvent & { readonly slice: 'watch' };

/** No page open. */
export const initialWatchState: WatchPages = {};

/** A page just opened, or restored: stopped, with an empty list, and with what its tab remembers. */
export function newPage(watched: Watched, memory: WatchMemory = defaultMemory): WatchPage {
  return { ...memory, watched, status: 'stopped', events: [], paused: false, held: [], dropped: 0, nextNumber: 1 };
}

/** The page with what it held added to the list, under the cap, and its pause ended. */
export function endPause(page: WatchPage): WatchPage {
  if (!page.paused && page.held.length === 0) {
    return page;
  }
  const kept = newestKept(page.events, page.held);
  return { ...page, paused: false, held: [], events: kept.events, dropped: page.dropped + kept.dropped };
}

/** The page once the selected change event is gone from the list: nothing selected. */
function keptSelection(page: WatchPage): WatchPage {
  if (page.selected === undefined || page.events.some((event) => event.number === page.selected)) {
    return page;
  }
  const { selected: _gone, ...rest } = page;
  return rest;
}

function received(page: WatchPage, event: Extract<WatchPageEvent, { kind: 'received' }>): WatchPage {
  const last = event.events.at(-1);
  const token = event.resumeToken ?? last?.token;
  const numbered = last === undefined ? page : { ...page, nextNumber: Math.max(page.nextNumber, last.number + 1) };
  const tokened: WatchPage =
    token === undefined ? numbered : { ...numbered, resumeToken: token, afterInvalidate: event.invalidated };
  const watching: WatchPage = { ...tokened, status: page.status === 'starting' ? 'watching' : page.status };
  const added = page.paused ? newestKept(page.held, event.events) : newestKept(page.events, event.events);
  const listed: WatchPage = page.paused
    ? { ...watching, held: added.events, dropped: page.dropped + added.dropped }
    : { ...watching, events: added.events, dropped: page.dropped + added.dropped };
  if (!event.invalidated) {
    return keptSelection(listed);
  }
  return keptSelection({ ...endPause(listed), status: 'stopped', message: { kind: 'invalidated' } });
}

function withoutMessage(page: WatchPage): WatchPage {
  const { message: _message, ...rest } = page;
  return rest;
}

function selectedOf(page: WatchPage, number: number | undefined): WatchPage {
  const { selected: _selected, ...rest } = page;
  return number === undefined ? rest : { ...rest, selected: number };
}

/** The page after an event; `undefined` once its tab is closed. */
export function reducePage(page: WatchPage, event: WatchPageEvent): WatchPage | undefined {
  switch (event.kind) {
    case 'opened':
      return page;
    case 'starting':
      return { ...withoutMessage(endPause(page)), status: 'starting' };
    case 'received':
      return received(page, event);
    case 'failed':
      return keptSelection({ ...endPause(page), status: 'error', message: event.message });
    case 'stopped':
      return keptSelection({ ...endPause(page), status: 'stopped' });
    case 'paused':
      return event.paused ? { ...page, paused: true } : keptSelection(endPause(page));
    case 'cleared':
      return { ...selectedOf(page, undefined), events: [], held: [], dropped: 0 };
    case 'remembered':
      return { ...page, ...event.memory };
    case 'pre-images':
      return { ...page, preImages: event.recorded };
    case 'server-version':
      return { ...page, serverVersion: event.version };
    case 'selected':
      return selectedOf(page, event.number);
    case 'closed':
      return undefined;
  }
}

/** The pages after an event. */
export function reduceWatchPages(pages: WatchPages, event: WatchPageEvent): WatchPages {
  const page = pages[event.tab];
  if (event.kind === 'opened') {
    return page === undefined ? { ...pages, [event.tab]: newPage(event.watched, event.memory) } : pages;
  }
  if (page === undefined) {
    return pages;
  }
  const next = reducePage(page, event);
  if (next === undefined) {
    const { [event.tab]: _closed, ...rest } = pages;
    return rest;
  }
  return { ...pages, [event.tab]: next };
}

/** Changes this part of the state. */
export function reduceWatch(pages: WatchPages, event: WatchStateEvent): WatchPages {
  const { slice: _slice, ...pageEvent } = event;
  return reduceWatchPages(pages, pageEvent);
}
