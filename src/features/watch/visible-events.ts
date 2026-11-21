/**
 * Feature: watch.visible-events
 *
 * Keeps the newest 1,000 change events and counts those dropped ({@link keepNewest}), and says which of them the
 * list shows, newest first, after the type toggles and the search ({@link visibleEvents}). Nothing is asked of the
 * server: what it sends is narrowed by **Filter** (`watch.pipeline`).
 */
import { newestKept, type KeptEvents } from '../../shared/state/watch';
import { showText } from './text';
import { categoryOf, eventCategories, type EventCategory, type WatchEvent } from './types';

export { mostEvents, type KeptEvents } from '../../shared/state/watch';

/**
 * Feature: watch.visible-events — the change events with those added, the newest 1,000, in order of arrival. The
 * pages of the app's state keep their lists with the same rule (`src/shared/state/watch.ts`).
 */
export function keepNewest(events: readonly WatchEvent[], added: readonly WatchEvent[]): KeptEvents {
  return newestKept(events, added);
}

/** What the list shows. */
export interface VisibleEvents {
  /** Those that pass the toggles and the search, newest first. */
  readonly shown: readonly WatchEvent[];
  /** The number of kept change events of each type, hidden or not. */
  readonly counts: Readonly<Record<EventCategory, number>>;
  /** *6 change events*, or *4 of 6 change events*. */
  readonly count: string;
}

/** Whether the text is, without regard to case, in what the search looks at of a change event. */
export function matchesSearch(event: WatchEvent, search: string): boolean {
  const text = search.trim().toLowerCase();
  if (text === '') {
    return true;
  }
  const places = [
    event.type,
    event.namespace,
    event.id,
    event.changes,
    event.after === undefined ? '' : JSON.stringify(event.after),
    event.updated === undefined ? '' : JSON.stringify(event.updated),
  ];
  return places.some((place) => place.toLowerCase().includes(text));
}

/** Feature: watch.visible-events — the change events shown, the counts of the toggles, and the count. */
export function visibleEvents(
  events: readonly WatchEvent[],
  hiddenTypes: readonly EventCategory[],
  search: string,
): VisibleEvents {
  const counts = Object.fromEntries(eventCategories.map((category) => [category, 0])) as Record<EventCategory, number>;
  const shown: WatchEvent[] = [];
  for (const event of events) {
    const category = categoryOf(event.type);
    counts[category] += 1;
    if (!hiddenTypes.includes(category) && matchesSearch(event, search)) {
      shown.push(event);
    }
  }
  shown.reverse();
  return { shown, counts, count: showText.count(shown.length, events.length) };
}
