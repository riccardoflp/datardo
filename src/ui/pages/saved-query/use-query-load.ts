/**
 * `saved-query.run`, in the window: the query the main process put in a collection tab (`saved-query.load`, the
 * `loaded` event of the saved-query slice) is shown and run there, once the connection is connected. A find goes to
 * the query bar, in **Find**, its filter, sort and projection replaced and the other fields kept; a pipeline goes to
 * the pipeline editor, in **Aggregate**, with the whole pipeline shown. It then runs as the run button runs it
 * (`query.run`, `aggregate.run`, which hands a pipeline that writes to `aggregate.write-output`).
 */
import { useEffect } from 'react';
import { switchedMode } from '../../../features/query/mode';
import { restoredQuery, restoredState } from '../../../features/query/restore';
import { readQueryText } from '../../../features/saved-query/types';
import type { Json } from '../../../shared/engine-request';
import type { TabId } from '../../../shared/ids';
import type { QueryLoad } from '../../../shared/state/saved-query';
import { runQuery, type CollectionRef } from '../../query/collection-reads';
import { changeCollection } from '../../query/collection-store';
import { changeDraft } from '../aggregate/pipeline-store';
import type { CollectionPageState } from '../collection/use-collection';

/** The number of the last load each tab showed. */
const applied = new Map<TabId, number>();

/** Shows a query in the tab and runs it; `kept` is what the tab kept, for a tab that was not started yet. */
export function applyLoad(ref: CollectionRef, loaded: Json, kept: string | undefined): void {
  const query = readQueryText(loaded);
  if (query === undefined) {
    return;
  }
  changeCollection(ref.tab, (before) => {
    const base = before.started ? before.query : restoredState(restoredQuery(kept));
    const { error: _gone, ...moved } = switchedMode(base, query.kind === 'find' ? 'find' : 'aggregate');
    const texts =
      query.kind === 'find'
        ? { ...moved.texts, filter: query.filter, sort: query.sort, project: query.projection }
        : moved.texts;
    return { ...before, started: true, query: { ...moved, texts, invalid: [], page: 1 } };
  });
  if (query.kind === 'pipeline') {
    changeDraft(ref.tab, () => ({ stages: query.stages }));
  }
  void runQuery(ref, { texts: 'bar', page: 1, count: true });
}

/** Shows and runs the query loaded into the tab, once, as soon as its connection is connected. */
export function useQueryLoad(ref: CollectionRef, page: CollectionPageState, load: QueryLoad | undefined): void {
  const { connectionState, kept } = page;
  useEffect(() => {
    if (load === undefined || applied.get(ref.tab) === load.number || connectionState !== 'connected') {
      return;
    }
    applied.set(ref.tab, load.number);
    applyLoad(ref, load.query, kept);
  }, [ref, load, connectionState, kept]);
}
