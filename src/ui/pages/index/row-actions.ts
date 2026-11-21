/**
 * What the actions of a row of the Indexes section start, from its menu (`@row-menu`), its keys (`@table`: `Enter`
 * edits, `Delete` drops) and the inspector (`@inspector`): the edit and the copy open their dialog
 * (`index.edit`, `index.duplicate` through `index.create`, `index.edit-search`); hiding and dropping start their
 * feature, whose confirmation the runner shows.
 */
import { copiedDefinition } from '../../../features/index/duplicate';
import type { IndexInfo, SearchIndexInfo } from '../../../features/index/types';
import type { Json } from '../../../shared/engine-request';
import type { Place } from '../../../shared/ids';
import { change, type IndexPlace } from './index-actions';
import { runWithDialog } from './dialog-memory';

/** The row an action is started on. */
export type ActedRow =
  { readonly kind: 'index'; readonly index: IndexInfo } | { readonly kind: 'search'; readonly index: SearchIndexInfo };

function placeOf(element: string): Place {
  return element.slice(element.indexOf('@') + 1) as Place;
}

/** Starts the action a control names (`index.drop@row-menu`) on a row. */
export function startRowAction(place: IndexPlace, element: string, row: ActedRow): void {
  const from = placeOf(element);
  const feature = element.slice(0, element.indexOf('@'));
  const name = row.index.name;
  if (row.kind === 'search') {
    const args: Json =
      feature === 'index.edit-search'
        ? { index: name, type: row.index.type, definition: row.index.definition }
        : { index: name };
    void (feature === 'index.edit-search'
      ? runWithDialog(place, feature, args, from)
      : change(place, feature, args, from));
    return;
  }
  switch (feature) {
    case 'index.edit':
      void runWithDialog(place, feature, { index: name }, from);
      return;
    case 'index.duplicate': {
      const copy = copiedDefinition(row.index);
      void runWithDialog(place, 'index.create', { keys: copy.keys, options: copy.options }, from);
      return;
    }
    case 'index.hide':
      void change(place, feature, { index: name, hidden: row.index.options['hidden'] !== true }, from);
      return;
    default:
      void change(place, feature, { index: name }, from);
  }
}

/** **Create index…** of the toolbar, of Go to, or with keys suggested elsewhere (`{ kind: 1, createdAt: -1 }`). */
export function createIndex(place: IndexPlace, from?: Place, keys?: Json): void {
  void runWithDialog(place, 'index.create', keys === undefined ? {} : { keys }, from);
}

/** **Create search index…** of the toolbar, or of Go to. */
export function createSearchIndex(place: IndexPlace, from?: Place): void {
  void runWithDialog(place, 'index.create-search', {}, from);
}
