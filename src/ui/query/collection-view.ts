/**
 * The state the views of a collection tab are drawn from, made of what the window keeps of the tab: the Documents
 * section (`table.show`) and the paging row (`table.paging`), whose texts the status line shows too.
 */
import type { PagingState } from '../../features/table/paging';
import type { ShowState } from '../../features/table/show';
import { naturalLayout, type ColumnLayout, type ColumnNode } from '../../features/table/types';
import { textsRan, type CollectionTab } from './collection-store';

/** What the section needs that the tab's memory does not hold: the collection's kind and its columns. */
export interface ShowContext {
  readonly view: boolean;
  readonly readOnly: boolean;
  readonly columns?: readonly ColumnNode[];
  readonly layout?: ColumnLayout;
  /** In Aggregate, what the table says in place of rows after a pipeline that wrote. */
  readonly note?: string;
}

/** The paging row's state: the page and its size, **Skip** and **Limit** as last run, the documents received. */
export function pagingStateOf(collection: CollectionTab): PagingState {
  const { query } = collection;
  return {
    page: query.page,
    pageSize: query.pageSize,
    skip: collection.ranSkip,
    ...(collection.ranLimit === undefined ? {} : { limit: collection.ranLimit }),
    received: collection.documents.length,
    count: collection.count,
  };
}

/** The Documents section's state. */
export function showStateOf(collection: CollectionTab, context: ShowContext): ShowState {
  const { query } = collection;
  return {
    target: { mode: query.mode, view: context.view, readOnly: context.readOnly },
    phase: collection.phase,
    hasRows: collection.hasRows,
    emptyQuery: textsRan(collection).filter.trim() === '',
    columns: context.columns ?? [],
    layout: context.layout ?? naturalLayout,
    paging: pagingStateOf(collection),
    ...(collection.milliseconds === undefined ? {} : { milliseconds: collection.milliseconds }),
    selected: query.selection.keys.length,
    ...(context.note === undefined || query.mode !== 'aggregate' ? {} : { note: context.note }),
  };
}
