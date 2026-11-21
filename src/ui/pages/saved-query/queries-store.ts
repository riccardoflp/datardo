/**
 * The window's side of the saved-query area: which collection tab has its queries list open (`saved-query.show`), the
 * queries a run adds to the recent queries (`saved-query.recent`), and what the window sends as the query of a tab to
 * save (`saved-query.save`).
 */
import { useSyncExternalStore } from 'react';
import { editorJson } from '../../../features/aggregate/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place, type TabId } from '../../../shared/ids';
import type { CollectionRef } from '../../query/collection-reads';
import { collectionOf } from '../../query/collection-store';
import { pipelineOf } from '../aggregate/pipeline-store';

let openList: TabId | undefined;
const listeners = new Set<() => void>();

function told(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Opens the queries list of a tab, or closes the one open (`undefined`). */
export function setOpenList(tab: TabId | undefined): void {
  if (openList !== tab) {
    openList = tab;
    told();
  }
}

/** The tab whose queries list is open. */
export function useOpenList(): TabId | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => openList,
  );
}

/** Starts a feature of the saved-query area on the collection of a tab. */
export function startOnCollection(
  ref: CollectionRef,
  feature: string,
  args: Json,
  place?: Place,
): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: { kind: 'collection', connection: ref.connection, database: ref.database, collection: ref.collection },
    ...(place === undefined ? {} : { place }),
    args,
  });
}

/** The collection of a tab, as the features of the area take it. */
export function whereOf(ref: CollectionRef): { readonly [key: string]: Json } {
  return { connection: ref.connection, database: ref.database, collection: ref.collection, tab: ref.tab };
}

/**
 * What the tab holds now, as `saved-query.save` takes it: the filter, the sort and the projection of the bar in Find,
 * the pipeline editor as typed in Aggregate.
 */
export function queryOfTab(ref: CollectionRef): { readonly [key: string]: Json } {
  const { query } = collectionOf(ref.tab);
  if (query.mode === 'aggregate') {
    return { pipeline: editorJson(pipelineOf(ref.tab).draft) };
  }
  return {
    query: { kind: 'find', filter: query.texts.filter, sort: query.texts.sort, projection: query.texts.project },
  };
}

/** A find or a pipeline that ran without an error is added to the recent queries of its collection. */
export function recordRecent(ref: CollectionRef, query: Json): void {
  void startOnCollection(ref, 'saved-query.recent', { ...whereOf(ref), query });
}
