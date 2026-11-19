/**
 * Feature: value.add-scored-member — adds a member with its score to a sorted set, never changing the score of a
 * member that is there: `ZSCORE` is read first, and `ZADD … NX` sends the score as it was typed.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { scoreText } from './read-sorted-set';
import { memberText } from './text';
import { keyOf, nameText, textOf, writeStep } from './types';

const number = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

/** A score as typed and as sent: a number, `inf`, `+inf` or `-inf`; undefined for anything else (`nan`, `high`). */
export function typedScore(typed: string): string | undefined {
  const text = typed.trim();
  return number.test(text) || /^[+-]?inf$/iu.test(text) ? text : undefined;
}

/** The score a score means, to compare two of them: `1.50` is `1.5`. */
export function scoreValue(score: string): number {
  const text = score.trim().toLowerCase();
  if (text === 'inf' || text === '+inf') {
    return Number.POSITIVE_INFINITY;
  }
  return text === '-inf' ? Number.NEGATIVE_INFINITY : Number(text);
}

/**
 * Feature: value.add-scored-member — `answers.member` as typed and `answers.score` (default `0`), asked by the form
 * **Add a member to board**. Then `TYPE`, `ZSCORE <key> <member>`, and the plan `ZADD <key> NX <score> <member>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.add-scored-member/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['member'] === undefined) {
    return ask({
      title: memberText.addForm(nameText(keyOf(context).key)),
      button: 'Add',
      fields: [
        { kind: 'text', key: 'member', label: 'Member' },
        { kind: 'text', key: 'score', label: 'Score', default: '0' },
      ],
    });
  }
  const member = typedAnswer(answers['member']);
  if ('problem' in member) {
    return refuse('value.add-scored-member/invalid', member.problem);
  }
  const score = typedScore(textOf(answers['score'], '0'));
  if (score === undefined) {
    return refuse('value.add-scored-member/invalid', memberText.score);
  }
  const guarded = guard(context, answers, 'zset', {
    readOnly: 'value.add-scored-member/read-only',
    gone: 'value.add-scored-member/gone',
    typeChanged: 'value.add-scored-member/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['ZSCORE', at.key, member.bytes]]);
  }
  const memberName = nameText(member.bytes);
  if (current[0] !== null && current[0] !== undefined) {
    return refuse('value.add-scored-member/exists', memberText.scoredExists(memberName, name, scoreText(current[0])));
  }
  return writePlan({
    at,
    name: memberText.addTitle(memberName, name),
    steps: [writeStep(at, ['ZADD', at.key, 'NX', score, member.bytes])],
    done: memberText.added(memberName, name),
  });
}
