/**
 * What a collection tab in Aggregate does in place of its query, registered with the reads of the tab once this module
 * is loaded: the run button, the paging and **Refresh** run the pipeline (`aggregate.run`); a header click sorts its
 * output (`aggregate.sort-column`), and the headers show the directions of that sort.
 */
import { sortDirections, sortElement } from '../../../features/aggregate/sort-column';
import { setPipelineHooks, type CollectionRef } from '../../query/collection-reads';
import type { TabId } from '../../../shared/ids';
import { startOnPipeline } from './pipeline-actions';
import { runPipeline } from './pipeline-reads';
import { pipelineOf } from './pipeline-store';

/** A header clicked, or `Enter` on it: the `$sort` at the point the table shows changes, and the pipeline runs. */
function sortColumn(ref: CollectionRef, key: string): void {
  void startOnPipeline(ref, {
    label: key,
    element: sortElement,
    feature: 'aggregate.sort-column',
    args: { field: key },
  });
}

/** The directions of the sort of the output the table shows: that of the pipeline last run. */
function directions(tab: TabId): ReadonlyMap<string, 1 | -1> {
  const kept = pipelineOf(tab);
  return sortDirections(kept.ran ?? kept.draft);
}

setPipelineHooks({ run: runPipeline, sort: sortColumn, directions });
