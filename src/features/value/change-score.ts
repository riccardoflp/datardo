/**
 * Feature: value.change-score — changes the score of one member of a sorted set, from its cell, with `ZADD … XX`, so
 * that a member removed meanwhile is never added again. When the score in the database is no longer the one shown,
 * the confirmation asks to overwrite it.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, nothingToWrite, readCurrent, readOnlyRefusal, writePlan } from './check';
import { scoreValue, typedScore } from './add-scored-member';
import { scoreText } from './read-sorted-set';
import { hashText, memberText } from './text';
import { bytesOf, keyOf, nameText, textOf, writeStep } from './types';

/**
 * Feature: value.change-score — `answers.member` is the member as bytes, `answers.loaded` the score shown and
 * `answers.score` the score typed. Then `TYPE`, `ZSCORE <key> <member>`, and the plan `ZADD <key> XX <score> <member>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.change-score/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const member = bytesOf(answers['member']) ?? new Uint8Array();
  const loaded = textOf(answers['loaded']);
  const score = typedScore(textOf(answers['score']));
  if (score === undefined) {
    return refuse('value.change-score/invalid', memberText.score);
  }
  const memberName = nameText(member);
  if (scoreValue(score) === scoreValue(loaded)) {
    return nothingToWrite(memberText.scoreTitle(memberName, nameText(keyOf(context).key)));
  }
  const guarded = guard(context, answers, 'zset', {
    readOnly: 'value.change-score/read-only',
    gone: 'value.change-score/gone',
    typeChanged: 'value.change-score/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['ZSCORE', at.key, member]]);
  }
  if (current[0] === null || current[0] === undefined) {
    return refuse('value.change-score/gone-item', memberText.memberGone(memberName, name));
  }
  if (answers['overwrite'] === false) {
    return refuse('value.change-score/changed', memberText.notSavedScore);
  }
  const now = scoreText(current[0]);
  const changed = scoreValue(now) !== scoreValue(loaded);
  return writePlan({
    at,
    name: memberText.scoreTitle(memberName, name),
    steps: [writeStep(at, ['ZADD', at.key, 'XX', score, member])],
    done: memberText.savedScore(memberName, name),
    ...(changed
      ? {
          confirm: { question: memberText.scoreChanged(memberName, name, now), detail: '', button: hashText.overwrite },
        }
      : {}),
  });
}
