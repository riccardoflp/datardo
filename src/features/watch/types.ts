/**
 * The types of the Watch changes area: what is watched, a change event as the list holds it (`watch.event-summary`),
 * and the five types of the toggles (`watch.visible-events`). They are those of the part `watch` of the app's state
 * (`src/shared/state/watch.ts`), where the pages are kept.
 */
import type { EventCategory, Watched } from '../../shared/state/watch';

export type { EventCategory, TruncatedArray, Watched, WatchEvent } from '../../shared/state/watch';

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
