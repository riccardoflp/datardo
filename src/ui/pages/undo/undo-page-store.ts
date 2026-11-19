/**
 * What the **Undo history** page keeps in the window alone (`undo.show`, `undo.details`): the filter, which stays
 * while another tab is active, the row expanded and its details box. The details are read with `undo.details` through
 * the bridge when a row is expanded; a newer expansion wins over an older read.
 */
import { useSyncExternalStore } from 'react';
import { detailsBox, loadingBox } from '../../../features/undo/details';
import type { OperationRead } from '../../../features/undo/reads/operation';
import { featureId } from '../../../shared/ids';
import { appTarget } from '../../../shared/target';
import type { DetailsBox, OperationId, UndoEntry, UndoState } from '../../../shared/state/undo';

/** The fields of the page that only the window sets. */
export interface UndoPageFields {
  readonly filter: string;
  readonly expanded?: OperationId;
  readonly details?: DetailsBox;
}

let fields: UndoPageFields = { filter: '' };
const listeners = new Set<() => void>();

function changed(next: UndoPageFields): void {
  fields = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The fields of the page, drawn again whenever they change. */
export function useUndoPage(): UndoPageFields {
  return useSyncExternalStore(subscribe, () => fields);
}

/** The state of the history with the fields of the page, as `undo.show` draws it. */
export function withPageFields(undo: UndoState, page: UndoPageFields): UndoState {
  const { expanded: _expanded, details: _details, ...rest } = undo;
  return {
    ...rest,
    filter: page.filter,
    ...(page.expanded === undefined ? {} : { expanded: page.expanded }),
    ...(page.details === undefined ? {} : { details: page.details }),
  };
}

/** Types in the filter. */
export function setFilter(filter: string): void {
  changed({ ...fields, filter });
}

function collapsed(): UndoPageFields {
  return { filter: fields.filter };
}

/** Expands a row with what undoing it does, or collapses it when it was expanded. */
export async function toggleRow(entry: UndoEntry): Promise<void> {
  if (fields.expanded === entry.id) {
    changed(collapsed());
    return;
  }
  changed({ filter: fields.filter, expanded: entry.id, details: loadingBox });
  const result = await window.datardo.start({
    feature: featureId('undo.details'),
    target: appTarget,
    place: 'table',
    args: { operation: entry.id },
  });
  if (fields.expanded !== entry.id) {
    return;
  }
  if (result.kind === 'read') {
    changed({ ...fields, details: detailsBox(entry, result.result as OperationRead | undefined) });
  } else if (result.kind === 'failed' || result.kind === 'refused') {
    changed({ ...fields, details: { kind: 'refused', text: result.message } });
  } else {
    changed(collapsed());
  }
}
