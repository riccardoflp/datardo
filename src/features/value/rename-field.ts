/**
 * Feature: value.rename-field — gives a field of a hash another name, keeping its value and its expiry. Redis has no
 * command for it: the field is set under the new name and removed under the old one, in one transaction, with the
 * bytes of the value as they were read.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, nothingToWrite, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { fieldExpiry } from './edit-field';
import { hashText } from './text';
import {
  bytesOf,
  fieldExpiryVersion,
  isSameBytes,
  keyOf,
  nameText,
  replyBytes,
  replyNumber,
  serverIsAtLeast,
  writeStep,
  type Word,
} from './types';

/**
 * Feature: value.rename-field — `answers.field` is the old name as bytes, `answers.name` the new one as typed. Then
 * `TYPE`, `HGET` of the old name, `HEXISTS` of the new one (and `HPTTL`), and the plan `MULTI`, `HSET`, `HDEL`, `EXEC`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.rename-field/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const old = bytesOf(answers['field']) ?? new Uint8Array();
  const typed = typedAnswer(answers['name'], old);
  if ('problem' in typed) {
    return refuse('value.rename-field/invalid', typed.problem);
  }
  const from = nameText(old);
  const to = nameText(typed.bytes);
  if (isSameBytes(typed.bytes, old)) {
    return nothingToWrite(hashText.renameTitle(from, to, nameText(keyOf(context).key)));
  }
  const guarded = guard(context, answers, 'hash', {
    readOnly: 'value.rename-field/read-only',
    gone: 'value.rename-field/gone',
    typeChanged: 'value.rename-field/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const expires = serverIsAtLeast(context, at, fieldExpiryVersion);
  const current = currentReplies(answers);
  if (current === undefined) {
    const reads: (readonly Word[])[] = [
      ['HGET', at.key, old],
      ['HEXISTS', at.key, typed.bytes],
    ];
    return readCurrent(expires ? [...reads, ['HPTTL', at.key, 'FIELDS', '1', old]] : reads);
  }
  const value = replyBytes(current[0]);
  if (value === undefined) {
    return refuse('value.rename-field/gone-item', hashText.fieldGone(from, name));
  }
  if (replyNumber(current[1]) === 1) {
    return refuse('value.rename-field/exists', hashText.nameExists(name, to));
  }
  const expiry = fieldExpiry(current[2]);
  const keep =
    expiry === undefined ? [] : [writeStep(at, ['HPEXPIRE', at.key, String(expiry), 'FIELDS', '1', typed.bytes])];
  return writePlan({
    at,
    name: hashText.renameTitle(from, to, name),
    steps: [
      writeStep(at, ['MULTI']),
      writeStep(at, ['HSET', at.key, typed.bytes, value]),
      ...keep,
      writeStep(at, ['HDEL', at.key, old]),
      writeStep(at, ['EXEC']),
    ],
    done: hashText.renamed(from, to),
  });
}
