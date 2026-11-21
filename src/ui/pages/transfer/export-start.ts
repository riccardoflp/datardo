/**
 * How the table starts `transfer.export` (`@toolbar`, `@row-menu`, `@selection-bar`): with what the tab shows as the
 * export's source (`ExportSource`): the query as last run, or the pipeline up to the stage shown in Aggregate, the page
 * shown and the count when it is known, the columns as drawn for CSV, and the `_id`s of the rows of a selection.
 */
import { stageName, upToIndex, type PipelineEditor } from '../../../features/aggregate/types';
import { arrangedColumns } from '../../../features/table/layout';
import type { Document } from '../../../features/table/types';
import type { Json } from '../../../shared/engine-request';
import type { CollectionRef } from '../../query/collection-reads';
import { textsRan, type CollectionTab } from '../../query/collection-store';
import type { TableColumns } from '../../table/table-columns';
import { startOnCollection } from '../../table/table-start';
import { idsOf } from '../document/document-actions';
import { pipelineOf } from '../aggregate/pipeline-store';

/** The stages of a pipeline sent up to the stage shown, enabled ones only, each as one mongosh text. */
export function exportedStages(editor: PipelineEditor): string[] {
  return editor.stages
    .slice(0, upToIndex(editor) + 1)
    .filter((stage) => stage.enabled)
    .map((stage) => `{ ${stageName(stage)}: ${stage.body.trim() === '' ? '{}' : stage.body.trim()} }`);
}

/** The source of an export of what a tab shows, from the toolbar: the query or pipeline, its page, count and columns. */
export function exportSourceOf(
  ref: CollectionRef,
  collection: CollectionTab,
  columns: TableColumns,
): { readonly [key: string]: Json } {
  const query = collection.query;
  const first = collection.ranSkip + (query.page - 1) * query.pageSize + 1;
  const shown = collection.documents.length;
  const count = collection.count.kind === 'counted' ? { count: collection.count.count } : {};
  const drawn = arrangedColumns(columns.columns, columns.layout).columns as unknown as Json;
  const page = shown === 0 ? {} : { page: { first, last: first + shown - 1 } };
  if (query.mode === 'aggregate') {
    const kept = pipelineOf(ref.tab);
    return { pipeline: exportedStages(kept.ran ?? kept.draft), ...page, ...count, columns: drawn };
  }
  const texts = textsRan(collection);
  return {
    filter: texts.filter,
    projection: texts.project,
    sort: texts.sort,
    ...page,
    ...count,
    columns: drawn,
  };
}

/** **Export…** of the toolbar: the results of the query or pipeline the tab shows. */
export function exportShown(
  ref: CollectionRef,
  collection: CollectionTab,
  columns: TableColumns,
  element: string,
): void {
  void startOnCollection(ref, element, exportSourceOf(ref, collection, columns));
}

/** **Export…** of a selection or of a row: those documents by their `_id`, with the columns as drawn. */
export function exportDocuments(
  ref: CollectionRef,
  columns: TableColumns,
  documents: readonly Document[],
  element: string,
): void {
  const drawn = arrangedColumns(columns.columns, columns.layout).columns as unknown as Json;
  void startOnCollection(ref, element, { ids: idsOf(documents), columns: drawn });
}
