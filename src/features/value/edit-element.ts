/**
 * Feature: value.edit-element — changes the element at one index of a list with `LSET`. The element at that index is
 * read first: an index names a place, not an element, so when another element is there now nothing is written.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, nothingToWrite, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { listText } from './text';
import { bytesOf, isSameBytes, keyOf, nameText, replyBytes, writeStep } from './types';

/** The index of an answer: a whole number. */
export function indexAnswer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('The window sends the index of an element as a whole number.');
  }
  return value;
}

/**
 * Feature: value.edit-element — `answers.index`, `answers.loaded` (the element shown, as bytes) and `answers.value`
 * (what the editor holds). Then `TYPE`, `LINDEX <key> <index>`, and the plan `LSET <key> <index> <element>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.edit-element/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const index = indexAnswer(answers['index']);
  const loaded = bytesOf(answers['loaded']) ?? new Uint8Array();
  const typed = typedAnswer(answers['value'], loaded);
  if ('problem' in typed) {
    return refuse('value.edit-element/invalid', typed.problem);
  }
  if (isSameBytes(typed.bytes, loaded)) {
    return nothingToWrite(listText.editTitle(index, nameText(keyOf(context).key)));
  }
  const guarded = guard(context, answers, 'list', {
    readOnly: 'value.edit-element/read-only',
    gone: 'value.edit-element/gone',
    typeChanged: 'value.edit-element/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['LINDEX', at.key, String(index)]]);
  }
  const now = replyBytes(current[0]);
  if (now === undefined || !isSameBytes(now, loaded)) {
    return refuse('value.edit-element/changed', listText.changed(index, name));
  }
  return writePlan({
    at,
    name: listText.editTitle(index, name),
    steps: [writeStep(at, ['LSET', at.key, String(index), typed.bytes])],
    done: listText.saved(index, name),
  });
}
