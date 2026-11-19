/**
 * What is dragged into the query bar (`query.drag`): a cell or a column header of the table, carried on the
 * `DataTransfer` of the drag as JSON under its own type. The browser hides the data of a drag until the drop, so what
 * started the drag is also kept here, for the zones to be drawn while it goes on.
 */
import { useSyncExternalStore } from 'react';
import type { Dragged } from '../../features/query/drag';
import type { Json } from '../../shared/engine-request';

/** The type of the data of a drag from the table. */
export const draggedMime = 'application/x-datardo-drag';

let current: Dragged | undefined;
const listeners = new Set<() => void>();

function changed(next: Dragged | undefined): void {
  if (next === current) {
    return;
  }
  current = next;
  for (const listener of listeners) {
    listener();
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** What a JSON text carried by a drag stands for, or nothing when it is not a cell or a header. */
export function draggedOfText(written: string): Dragged | undefined {
  let value: unknown;
  try {
    value = JSON.parse(written) as unknown;
  } catch {
    // Data of another program, or none: nothing of the table is dragged.
    return undefined;
  }
  if (!isObject(value) || typeof value['field'] !== 'string' || value['field'] === '') {
    return undefined;
  }
  const within = typeof value['within'] === 'string' ? { within: value['within'] } : {};
  if (value['kind'] === 'header') {
    return { kind: 'header', field: value['field'], ...within };
  }
  if (value['kind'] === 'cell' && 'value' in value) {
    return { kind: 'cell', field: value['field'], value: value['value'] as Json, ...within };
  }
  return undefined;
}

/** Starts a drag of a cell or a header: its data on the transfer, and the zones of the bar drawn. */
export function startDrag(transfer: DataTransfer, dragged: Dragged): void {
  transfer.setData(draggedMime, JSON.stringify(dragged));
  transfer.effectAllowed = 'copyMove';
  changed(dragged);
}

/** What a drag carries, when it comes from the table: its data, or what started it while the data is hidden. */
export function readDragged(transfer: DataTransfer | null): Dragged | undefined {
  if (transfer === null || !transfer.types.includes(draggedMime)) {
    return undefined;
  }
  const written = transfer.getData(draggedMime);
  return written === '' ? current : (draggedOfText(written) ?? current);
}

/** Notes a drag from the table that came over the bar, for one whose start was not seen. */
export function draggedOver(transfer: DataTransfer | null): void {
  const dragged = readDragged(transfer);
  if (dragged !== undefined) {
    changed(dragged);
  }
}

/** Ends the drag: dropped, let go outside a zone, or stopped with `Esc`. */
export function endDrag(): void {
  changed(undefined);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What is being dragged from the table, drawn again when a drag starts or ends. */
export function useDragged(): Dragged | undefined {
  return useSyncExternalStore(subscribe, () => current);
}
