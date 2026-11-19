/**
 * Feature: undo.remove — deletes one operation from the undo history, so that its file no longer takes space.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import { argumentOperation } from './revert';
import { entryById, undoOf } from './state/history';
import { removeText } from './text';
import { appStep, nothingToDo } from './types';

/**
 * Feature: undo.remove — `args.operation` is the operation: `delete the operation "<title>" from the undo history`, at
 * once and without asking. An undone operation has no file: only its row goes.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const id = argumentOperation(answers);
  const entry = id === undefined ? undefined : entryById(undoOf(context.state), id);
  if (entry === undefined) {
    return nothingToDo(removeText.removeTitle(''), removeText.cannotUndoRemove);
  }
  return run({
    title: removeText.removeTitle(entry.title),
    steps: [appStep('undo.remove', { operation: entry.id }, removeText.removeStep(entry.title))],
    danger: noDanger,
    undo: { cannot: removeText.cannotUndoRemove },
    publishes: false,
    after: [],
  });
}
