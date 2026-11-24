/**
 * What the inspector of a collection tab is drawn from (`document.inspect`): the selection of the table as one
 * document, several or none, with the tab's mode, how its connection is now and how the tree is folded; and what the
 * inspector island says of it (`nav.inspector`). `Enter` and **Inspect document** show the island and give it the
 * focus.
 */
import { headerId, type InspectSelection, type InspectState } from '../../../features/document/inspect';
import { text } from '../../../features/document/text';
import type { Inspection } from '../../../features/nav/types';
import { rowKeyOf } from '../../../features/table/types';
import type { AppState } from '../../../shared/state';
import type { CollectionRef } from '../../query/collection-reads';
import type { CollectionTab } from '../../query/collection-store';
import { startFeature } from '../../shell/intent';
import { currentAppState } from '../../state/store';
import { changeSelection } from '../../table/table-actions';
import { changeInspect, type InspectMemory } from './inspect-store';

/** The selected rows of the page, by their place in it. */
export function selectedRows(collection: CollectionTab): readonly number[] {
  const keys = new Set(collection.query.selection.keys);
  return collection.documents.flatMap((document, index) => (keys.has(rowKeyOf(document, index)) ? [index] : []));
}

/** The selection of the table, as the inspector shows it. */
export function inspectSelection(collection: CollectionTab): InspectSelection {
  const rows = selectedRows(collection);
  const [row] = rows;
  if (rows.length > 1) {
    return { kind: 'several', count: rows.length };
  }
  const document = row === undefined ? undefined : collection.documents[row];
  if (row === undefined || document === undefined) {
    return { kind: 'none' };
  }
  return {
    kind: 'one',
    document,
    page: collection.query.page,
    pageSize: collection.query.pageSize,
    row,
    first: row === 0,
    last: row === collection.documents.length - 1,
  };
}

/** Whether the connection of a collection is read-only now. */
export function isReadOnly(state: AppState, ref: CollectionRef): boolean {
  return state.connections.saved.find((each) => each.id === ref.connection)?.readOnly ?? false;
}

/** The state of the inspector of a tab. */
export function inspectStateOf(
  state: AppState,
  ref: CollectionRef,
  collection: CollectionTab,
  memory: InspectMemory,
): InspectState {
  return {
    selection: inspectSelection(collection),
    collection: ref.collection,
    source: collection.query.mode === 'aggregate' ? 'aggregate' : 'find',
    readOnly: isReadOnly(state, ref),
    view: ref.kind === 'view',
    mode: memory.mode,
    folding: memory.folding,
    toggled: memory.toggled,
    // **Go from here** follows the references of the document (`relation.follow`), which says when there are none.
    references: true,
  };
}

/** What the inspector island says of the selection of a collection tab. */
export function inspectionOf(ref: CollectionRef, collection: CollectionTab): Inspection {
  const selection = inspectSelection(collection);
  switch (selection.kind) {
    case 'none':
      return { selected: 0, emptyLine: text.inspect.nothing };
    case 'several':
      return { selected: selection.count, emptyLine: text.inspect.several(selection.count) };
    case 'one': {
      const id = selection.document['_id'];
      const title = id === undefined ? ref.collection : `${ref.collection} · ${headerId(id)}`;
      return { selected: 1, title, emptyLine: text.inspect.nothing };
    }
  }
}

/**
 * Shows the document of a row in the inspector: the row selected alone, the island shown when it was hidden, on its
 * Selection view, and the focus moved into it (`Enter`, **Inspect document**).
 */
export function showInInspector(ref: CollectionRef, row: number | undefined): void {
  if (row !== undefined) {
    changeSelection(ref, { kind: 'only', index: row });
  }
  const { nav } = currentAppState();
  if (nav.inspectorView === 'formatting') {
    // The Formatting view gives way to the selection asked for (`nav.inspector`).
    startFeature('nav.toggle-inspector', { place: 'table', args: { view: 'selection' } });
  } else if (nav.inspectorHidden) {
    startFeature('nav.toggle-inspector', { place: 'table', args: { hidden: false } });
  }
  changeInspect(ref.tab, (before) => ({ ...before, focus: before.focus + 1 }));
}
