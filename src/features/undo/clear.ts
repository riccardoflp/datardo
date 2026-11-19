/**
 * Feature: undo.clear — deletes every recorded operation and its file.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse, run } from '../../shared/feature';
import { undoOf } from './state/history';
import { removeText } from './text';
import { appStep } from './types';

/**
 * Feature: undo.clear — the confirmation **Clear the undo history?**, then `delete the 12 operations of the undo
 * history`: their files are deleted and the empty list is written. The number counts the operations already undone.
 */
export function plan(context: Context, _answers: Answers): Outcome {
  const count = undoOf(context.state).entries.length;
  if (count === 0) {
    return refuse('undo.clear/empty', removeText.alreadyEmpty);
  }
  return run({
    title: removeText.clearQuestion,
    steps: [appStep('undo.clear', null, removeText.clearStep(count))],
    danger: { kind: 'confirm', text: removeText.clearText(count), button: removeText.clearButton },
    undo: { cannot: removeText.cannotUndoClear },
    publishes: false,
    after: [],
  });
}

/** Whether **Clear history…** is enabled: the history holds an operation. */
export function isClearOffered(entries: number): boolean {
  return entries > 0;
}
