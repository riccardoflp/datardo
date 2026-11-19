/**
 * Feature: undo.last — undoes the newest operation that isn't undone yet, without opening the page.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { plan as revert } from './revert';
import { undoOf, type UndoState } from './state/history';
import { revertText } from './text';
import type { UndoEntry } from './types';

/** The newest operation of any connection and engine that isn't undone, which may be an `Undo: …` (a redo). */
export function lastOperation(undo: UndoState): UndoEntry | undefined {
  return undo.entries.find((each) => each.undone === undefined);
}

/**
 * Feature: undo.last — the plan, questions and refusals of `undo.revert` for that operation; with none left,
 * *Nothing to undo: the undo history is empty.*
 */
export function plan(context: Context, answers: Answers): Outcome {
  const last = lastOperation(undoOf(context.state));
  if (last === undefined) {
    return refuse('undo.last/empty', revertText.empty);
  }
  return revert(context, { ...answers, args: { operation: last.id } });
}
