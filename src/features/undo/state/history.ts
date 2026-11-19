/**
 * The part of the app's state about the undo history, as the cards of this area read it. The state itself, its events
 * and its reducer are in `src/shared/state/undo.ts`, one of the parts of `AppState`; they are named again here for the
 * features and their tests.
 */
import type { AppState } from '../../../shared/state';
import type { OperationId, UndoEntry, UndoState } from '../../../shared/state/undo';

export { initialUndoState, reduceUndo } from '../../../shared/state/undo';
export type { PageMessage, UndoEvent, UndoState } from '../../../shared/state/undo';

/** The undo history part of the app's state. */
export function undoOf(state: AppState): UndoState {
  return state.undo;
}

/** An operation by its id. */
export function entryById(undo: UndoState, id: OperationId): UndoEntry | undefined {
  return undo.entries.find((each) => each.id === id);
}
