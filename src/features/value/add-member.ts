/**
 * Feature: value.add-member — adds a member to a set, after `SISMEMBER` says it is not there: a member that is there
 * is refused under the field, and nothing is written or recorded.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, refuse } from '../../shared/feature';
import { currentReplies, guard, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { memberText } from './text';
import { keyOf, nameText, replyNumber, writeStep } from './types';

/**
 * Feature: value.add-member — `answers.member` as typed (`{ text, format }`), asked by the form **Add a member to
 * tags**. Then `TYPE`, `SISMEMBER <key> <member>`, and the plan `SADD <key> <member>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.add-member/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (answers['member'] === undefined) {
    return ask({
      title: memberText.addForm(nameText(keyOf(context).key)),
      button: 'Add',
      fields: [{ kind: 'text', key: 'member', label: 'Member' }],
    });
  }
  const member = typedAnswer(answers['member']);
  if ('problem' in member) {
    return refuse('value.add-member/invalid', member.problem);
  }
  const guarded = guard(context, answers, 'set', {
    readOnly: 'value.add-member/read-only',
    gone: 'value.add-member/gone',
    typeChanged: 'value.add-member/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['SISMEMBER', at.key, member.bytes]]);
  }
  const memberName = nameText(member.bytes);
  if (replyNumber(current[0]) === 1) {
    return refuse('value.add-member/exists', memberText.exists(memberName, name));
  }
  return writePlan({
    at,
    name: memberText.addTitle(memberName, name),
    steps: [writeStep(at, ['SADD', at.key, member.bytes])],
    done: memberText.added(memberName, name),
  });
}
