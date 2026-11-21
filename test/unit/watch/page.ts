/**
 * The pages of the unit tests of the Watch changes area: a page in each state, the app's state that holds it, and a
 * context of a feature started on its tab.
 */
import { newPage, type WatchPage } from '../../../src/features/watch/page/state';
import { eventSummary } from '../../../src/features/watch/event-summary';
import type { Watched, WatchEvent } from '../../../src/features/watch/types';
import type { Json } from '../../../src/shared/engine-request';
import type { Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { contextOf } from '../connection/context';
import { local, mongoState } from '../history/recorded';

/** The tab of the page. */
export const tab = tabId('t-watch');

/** The collection shop.orders of Local. */
export const orders: Watched = { connection: local.id, database: 'shop', collection: 'orders' };

/** A page watching `watched`, changed by `overrides`. */
export function pageOf(overrides: Partial<WatchPage> = {}, watched: Watched = orders): WatchPage {
  return { ...newPage(watched), ...overrides };
}

/** A change event of the type, numbered. */
export function changeEvent(number: number, type = 'insert', fields: Readonly<Record<string, Json>> = {}): WatchEvent {
  const change = {
    _id: { _data: `token-${String(number)}` },
    operationType: type,
    ns: { db: 'shop', coll: 'orders' },
    documentKey: { _id: { $numberInt: String(number) } },
    wallTime: { $date: { $numberLong: String(1_763_400_000_000 + number) } },
    ...(type === 'insert' ? { fullDocument: { _id: { $numberInt: String(number) }, status: 'new' } } : {}),
    ...fields,
  };
  return eventSummary(change, number, 0);
}

/** The app's state with the page on its tab. */
export function stateWithPage(page: WatchPage, topology: 'standalone' | 'replica-set' = 'replica-set'): AppState {
  return { ...mongoState(topology), watch: { [tab]: page } };
}

/** A context of a feature started on the page's tab. */
export function onPage(
  feature: string,
  page: WatchPage,
  topology: 'standalone' | 'replica-set' = 'replica-set',
): Context {
  return contextOf(feature, stateWithPage(page, topology), { kind: 'tab', tab });
}
