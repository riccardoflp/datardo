/**
 * Feature: value.remove-scored-members — removes one member of a sorted set, or the selected ones, with `ZREM`, 500
 * members a command, after a confirmation that says when they are all the members of the key.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { currentReplies, guard, readCurrent } from './check';
import { itemsOf, removalPlan } from './remove-fields';
import { replyNumber } from './types';

/**
 * Feature: value.remove-scored-members — `answers.members` are the members, as bytes. Then `TYPE`, `ZCARD`, and the
 * plan `ZREM <key> <member> …`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const guarded = guard(context, answers, 'zset', {
    readOnly: 'value.remove-scored-members/read-only',
    gone: 'value.remove-scored-members/gone',
    typeChanged: 'value.remove-scored-members/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['ZCARD', at.key]]);
  }
  const items = itemsOf(answers['members']);
  const count = replyNumber(current[0]) ?? 0;
  return removalPlan({ at, name, command: 'ZREM', items, count, words: ['member', 'members'] });
}
