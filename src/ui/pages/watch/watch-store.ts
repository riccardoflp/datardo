/**
 * What a Watch changes page keeps in the window alone, one for each tab: the change event selected, the text of the
 * search and of **Filter** while they are typed, the message under **Filter** when it cannot be read, and the message
 * of **Enable…** when the server refused. Everything else of the page (the stream, the change events, what the tab
 * remembers) is in the app's state, the part `watch`, which the main process changes (`watch.show`).
 */
import { useSyncExternalStore } from 'react';
import type { Json } from '../../../shared/engine-request';
import { featureId, tabId, type Place } from '../../../shared/ids';
import type { IntentResult } from '../../../shared/bridge';

/** What the window keeps of one page. */
export interface WatchTab {
  readonly selected?: number;
  /** The search and the filter as typed, before they are remembered. */
  readonly search?: string;
  readonly filter?: string;
  readonly filterMessage?: string;
  readonly preImagesMessage?: string;
}

const tabs = new Map<string, WatchTab>();
const listeners = new Set<() => void>();
let version = 0;

function told(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Draws again whenever a page changes. */
export function useWatchChanges(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** What the window keeps of a page, drawn again whenever it changes. */
export function useWatchTab(tab: string): WatchTab {
  useWatchChanges();
  return tabs.get(tab) ?? {};
}

/** What the window keeps of a page, as it is now. */
export function watchTabOf(tab: string): WatchTab {
  return tabs.get(tab) ?? {};
}

/** Changes what the window keeps of a page. */
export function changeWatchTab(tab: string, change: (page: WatchTab) => WatchTab): void {
  tabs.set(tab, change(tabs.get(tab) ?? {}));
  told();
}

/** Starts a feature on the page's tab. */
export function startOnPage(tab: string, feature: string, place: Place, args: Json = null): Promise<IntentResult> {
  return window.datardo.start({ feature: featureId(feature), target: { kind: 'tab', tab: tabId(tab) }, place, args });
}
