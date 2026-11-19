/**
 * The part of the app's state about the undo history: the operations of `undo/index.json`, newest first, and what the
 * **Undo history** page remembers (its filter, the row expanded with its details, the undos running, its message).
 *
 * It is written here, pure, until it moves to `src/shared/state/undo.ts` and joins the lists of
 * `src/shared/state/index.ts`; {@link undoOf} reads it meanwhile.
 */
import type { AppState } from '../../../shared/state';
import type { OperationId, UndoEntry } from '../types';
import type { DetailsBox } from '../details';

/** The last message of the page: the result of the last undo started from it. */
export interface PageMessage {
  readonly text: string;
  readonly failed: boolean;
}

/** The part of the app's state about the undo history. */
export interface UndoState {
  /** Newest first. */
  readonly entries: readonly UndoEntry[];
  /** False when `undo/index.json` was written by a newer Datardo: changes are not saved (data.md, "Versions"). */
  readonly writable: boolean;
  /** The text of the page's filter, kept while another tab is active. */
  readonly filter: string;
  /** The row whose details are shown. */
  readonly expanded?: OperationId;
  /** What the expanded row shows: loading, the details, or why there are none. */
  readonly details?: DetailsBox;
  /** The operations being undone. */
  readonly undoing: readonly OperationId[];
  readonly message?: PageMessage;
}

/** No operation. */
export const initialUndoState: UndoState = { entries: [], writable: true, filter: '', undoing: [] };

/** The events of this part of the state. */
export type UndoEvent =
  | {
      readonly slice: 'undo';
      readonly type: 'loaded';
      readonly entries: readonly UndoEntry[];
      readonly writable: boolean;
    }
  | { readonly slice: 'undo'; readonly type: 'recorded'; readonly entry: UndoEntry }
  | { readonly slice: 'undo'; readonly type: 'removed'; readonly operations: readonly OperationId[] }
  | { readonly slice: 'undo'; readonly type: 'undone'; readonly operation: OperationId; readonly time: number }
  | { readonly slice: 'undo'; readonly type: 'filtered'; readonly filter: string }
  | { readonly slice: 'undo'; readonly type: 'expanded'; readonly operation?: OperationId }
  | { readonly slice: 'undo'; readonly type: 'details'; readonly operation: OperationId; readonly box: DetailsBox }
  | { readonly slice: 'undo'; readonly type: 'undoing'; readonly operation: OperationId; readonly running: boolean }
  | { readonly slice: 'undo'; readonly type: 'message'; readonly message?: PageMessage };

/** Changes this part of the state. */
export function reduceUndo(state: UndoState, event: UndoEvent): UndoState {
  switch (event.type) {
    case 'loaded':
      return { ...state, entries: event.entries, writable: event.writable };
    case 'recorded':
      return { ...state, entries: [event.entry, ...state.entries.filter((each) => each.id !== event.entry.id)] };
    case 'removed':
      return removed(state, event.operations);
    case 'undone':
      return {
        ...state,
        entries: state.entries.map((each) =>
          each.id === event.operation ? { ...each, undone: event.time, size: 0 } : each,
        ),
      };
    case 'filtered':
      return { ...state, filter: event.filter };
    case 'expanded':
      return expanded(state, event.operation);
    case 'details':
      return state.expanded === event.operation ? { ...state, details: event.box } : state;
    case 'undoing':
      return {
        ...state,
        undoing: event.running
          ? [...state.undoing.filter((each) => each !== event.operation), event.operation]
          : state.undoing.filter((each) => each !== event.operation),
      };
    case 'message':
      return withMessage(state, event.message);
  }
}

function removed(state: UndoState, operations: readonly OperationId[]): UndoState {
  const gone = new Set<string>(operations);
  const entries = state.entries.filter((each) => !gone.has(each.id));
  return state.expanded !== undefined && gone.has(state.expanded)
    ? expanded({ ...state, entries }, undefined)
    : { ...state, entries };
}

function expanded(state: UndoState, operation: OperationId | undefined): UndoState {
  const { expanded: _row, details: _box, ...rest } = state;
  return operation === undefined ? rest : { ...rest, expanded: operation };
}

function withMessage(state: UndoState, message: PageMessage | undefined): UndoState {
  if (message !== undefined) {
    return { ...state, message };
  }
  const { message: _cleared, ...rest } = state;
  return rest;
}

/**
 * The undo history part of the app's state. Until it is one of the parts of `AppState`
 * (`src/shared/state/index.ts`), an app's state without it has no operation.
 */
export function undoOf(state: AppState): UndoState {
  return (state as AppState & { readonly undo?: UndoState }).undo ?? initialUndoState;
}

/** An operation by its id. */
export function entryById(undo: UndoState, id: OperationId): UndoEntry | undefined {
  return undo.entries.find((each) => each.id === id);
}
