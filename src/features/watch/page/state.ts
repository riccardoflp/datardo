/**
 * The state of the Watch changes pages, one for each tab: what is watched, the stream, the change events kept and
 * held, the resume token, and what the tab remembers (the text of **Filter**, **Current document on update**, the
 * types hidden and the search). It will be a slice of the app's state, `watch`, in `src/shared/state/index.ts`;
 * {@link watchPagesOf} reads it meanwhile. {@link reduceWatchPages} is how the main process changes it, from the
 * stream (`watch.stream`) and from the app steps of `watch.pause`, `watch.stop` and `watch.clear`.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context } from '../../../shared/feature';
import type { TabId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import { keepNewest } from '../visible-events';
import type { EventCategory, Watched, WatchEvent } from '../types';

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
  | { readonly kind: 'selected'; readonly tab: string; readonly number?: number }
  | { readonly kind: 'closed'; readonly tab: string };

/** A page just opened, or restored: stopped, with an empty list, and with what its tab remembers. */
export function newPage(watched: Watched, memory: WatchMemory = defaultMemory): WatchPage {
  return { ...memory, watched, status: 'stopped', events: [], paused: false, held: [], dropped: 0, nextNumber: 1 };
}

/** The page with what it held added to the list, under the cap, and its pause ended. */
export function endPause(page: WatchPage): WatchPage {
  if (!page.paused && page.held.length === 0) {
    return page;
  }
  const kept = keepNewest(page.events, page.held);
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
  const added = page.paused ? keepNewest(page.held, event.events) : keepNewest(page.events, event.events);
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

/** The page after an event. */
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
    case 'cleared': {
      const { selected: _selected, ...rest } = page;
      return { ...rest, events: [], held: [], dropped: 0 };
    }
    case 'remembered':
      return { ...page, ...event.memory };
    case 'pre-images':
      return { ...page, preImages: event.recorded };
    case 'selected': {
      const { selected: _selected, ...rest } = page;
      return event.number === undefined ? rest : { ...rest, selected: event.number };
    }
    case 'closed':
      return undefined;
  }
}

/** Feature state of the Watch changes pages: the pages after an event. */
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

/** The pages, as the app's state will hold them. */
export function watchPagesOf(state: AppState): WatchPages {
  return (state as AppState & { readonly watch?: WatchPages }).watch ?? {};
}

/** The page of a tab, when the tab is a Watch changes page. */
export function watchPageOf(state: AppState, tab: string): WatchPage | undefined {
  return watchPagesOf(state)[tab];
}

/** The page a feature was started on, with its tab: its target is the tab of a Watch changes page. */
export function contextPage(context: Context): { readonly tab: TabId; readonly page: WatchPage } | undefined {
  if (context.target.kind !== 'tab') {
    return undefined;
  }
  const tab = context.target.tab;
  const page = watchPageOf(context.state, tab);
  return page === undefined ? undefined : { tab, page };
}
