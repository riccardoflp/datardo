/**
 * What the parts of the Documents section around the grid are drawn from: the toolbar, the selection bar and the
 * context menus of the table all take the tab, its memory, its columns and what it shows.
 */
import type { TableTarget } from '../../features/table/types';
import type { CollectionRef } from '../query/collection-reads';
import type { CollectionTab } from '../query/collection-store';
import type { TableColumns } from './table-columns';

/** The props of a part of the section. */
export interface TablePartProps {
  readonly collectionRef: CollectionRef;
  readonly collection: CollectionTab;
  readonly columns: TableColumns;
  readonly target: TableTarget;
}
