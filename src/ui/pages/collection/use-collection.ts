/**
 * What the collection page is drawn from: the collection of its tab as the app's state says it (its connection's
 * state, whether it is read-only), and the start of the tab, which restores the query the tab kept and runs it once
 * the connection is connected (`query.restore`, `query.run`).
 */
import { useEffect, useMemo, useRef } from 'react';
import { restoredQuery, restoredState } from '../../../features/query/restore';
import type { ConnectionStateName } from '../../../shared/connection';
import type { TabId } from '../../../shared/ids';
import type { AppState } from '../../../shared/state';
import type { RunnerState } from '../../../shared/state/runner';
import type { TabShows } from '../../../shared/state/tabs';
import { registerCollection, runQuery, type CollectionRef } from '../../query/collection-reads';
import { changeCollection, collectionOf } from '../../query/collection-store';

/** What a collection tab shows. */
export type CollectionShows = Extract<TabShows, { readonly kind: 'collection' }>;

/** The collection of a tab, with what the page needs of the app's state. */
export interface CollectionPageState {
  readonly ref: CollectionRef;
  readonly connectionState: ConnectionStateName;
  /** The connection is read-only: nothing is written through it. */
  readonly readOnly: boolean;
  readonly view: boolean;
  /** What the tab kept of its query, as `TabMemory.query` holds it. */
  readonly kept: string | undefined;
}

/** The collection of a tab as the app's state says it. */
export function collectionPageState(state: AppState, tab: TabId, shows: CollectionShows): CollectionPageState {
  const saved = state.connections.saved.find((each) => each.id === shows.connection);
  const live = state.connections.live[shows.connection];
  return {
    ref: {
      tab,
      connection: shows.connection,
      database: shows.database,
      collection: shows.collection,
      kind: shows.view === true ? 'view' : 'collection',
    },
    connectionState: live?.state ?? 'not-connected',
    readOnly: saved?.readOnly ?? false,
    view: shows.view === true,
    kept: state.tabs.tabs.find((each) => each.id === tab)?.memory?.query,
  };
}

/** The reference of the page's collection, kept the same while the collection is the same. */
export function useCollectionRef(page: CollectionPageState): CollectionRef {
  const { tab, connection, database, collection, kind } = page.ref;
  return useMemo(() => {
    const ref = { tab, connection, database, collection, kind };
    registerCollection(ref);
    return ref;
  }, [tab, connection, database, collection, kind]);
}

/**
 * Starts the tab once: the query it kept is restored and run as soon as the connection is connected; a connection that
 * is not connected and does not connect shows the message with **Reconnect**.
 */
export function useCollectionStart(ref: CollectionRef, page: CollectionPageState): void {
  const { connectionState, kept } = page;
  useEffect(() => {
    if (collectionOf(ref.tab).started) {
      return;
    }
    if (connectionState === 'connected') {
      changeCollection(ref.tab, (before) => ({ ...before, started: true, query: restoredState(restoredQuery(kept)) }));
      void runQuery(ref, { texts: 'bar', count: true });
      return;
    }
    const notConnected = connectionState === 'failed' || connectionState === 'not-connected';
    changeCollection(ref.tab, (before) => ({
      ...before,
      phase: notConnected ? { kind: 'failed', notConnected: true } : { kind: 'loading' },
    }));
  }, [ref, connectionState, kept]);
}

/**
 * After a plan wrote through the tab's connection (`runner/refresh-asked`), the page reads its query again, keeping
 * the selection of the documents still there (`table.refresh`).
 */
export function useRefreshAfterWrites(ref: CollectionRef, refreshed: RunnerState['refreshed']): void {
  const seen = useRef(refreshed.times);
  useEffect(() => {
    if (seen.current === refreshed.times) {
      return;
    }
    seen.current = refreshed.times;
    const ours = refreshed.connection === undefined || refreshed.connection === ref.connection;
    if (ours && collectionOf(ref.tab).started) {
      void runQuery(ref, { texts: 'ran', refresh: true, count: true });
    }
  }, [ref, refreshed]);
}
