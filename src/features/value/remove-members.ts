/**
 * Feature: value.remove-members — removes one member of a set, or the selected ones, with `SREM`, 500 members a
 * command, after a confirmation that says when they are all the members of the key.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { currentReplies, guard, readCurrent } from './check';
import { itemsOf, removalPlan } from './remove-fields';
import { replyNumber } from './types';

/**
 * Feature: value.remove-members — `answers.members` are the members, as bytes. Then `TYPE`, `SCARD`, and the plan
 * `SREM <key> <member> …`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const guarded = guard(context, answers, 'set', {
    readOnly: 'value.remove-members/read-only',
    gone: 'value.remove-members/gone',
    typeChanged: 'value.remove-members/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['SCARD', at.key]]);
  }
  const items = itemsOf(answers['members']);
  const count = replyNumber(current[0]) ?? 0;
  return removalPlan({ at, name, command: 'SREM', items, count, words: ['member', 'members'] });
}
