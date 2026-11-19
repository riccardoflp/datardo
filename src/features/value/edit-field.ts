/**
 * Feature: value.edit-field — changes the value of one field of a hash, from its cell. The value in the database is
 * read first: when it is no longer the one shown, the confirmation asks to overwrite it. A field with an expiry of its
 * own, which `HSET` would remove, gets it back in the same transaction.
 */
import type { Answers, Context, EngineStep, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, nothingToWrite, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { shown } from './format';
import { hashText } from './text';
import {
  bytesOf,
  fieldExpiryVersion,
  isSameBytes,
  keyOf,
  nameText,
  replyBytes,
  replyItems,
  replyNumber,
  serverIsAtLeast,
  writeStep,
  type KeyAt,
  type Word,
} from './types';

/** The milliseconds a field has left from a reply of `HPTTL … FIELDS 1 <field>`; undefined when it has no expiry. */
export function fieldExpiry(reply: unknown): number | undefined {
  const left = replyNumber(replyItems(reply)[0]);
  return left === undefined || left < 0 ? undefined : left;
}

/** The reads of the field before it is written: `HGET`, and `HPTTL` on Redis 7.4 or later. */
export function fieldReads(context: Context, at: KeyAt, field: Uint8Array): readonly (readonly Word[])[] {
  const value: readonly Word[] = ['HGET', at.key, field];
  return serverIsAtLeast(context, at, fieldExpiryVersion) ? [value, ['HPTTL', at.key, 'FIELDS', '1', field]] : [value];
}

/** `HSET`, or, for a field that expires, `MULTI`, `HSET`, `HPEXPIRE <key> <ms> FIELDS 1 <field>`, `EXEC`. */
function setSteps(at: KeyAt, field: Uint8Array, value: Uint8Array, expiry: number | undefined): readonly EngineStep[] {
  const set = writeStep(at, ['HSET', at.key, field, value]);
  if (expiry === undefined) {
    return [set];
  }
  return [
    writeStep(at, ['MULTI']),
    set,
    writeStep(at, ['HPEXPIRE', at.key, String(expiry), 'FIELDS', '1', field]),
    writeStep(at, ['EXEC']),
  ];
}

/**
 * Feature: value.edit-field — `answers.field` is the field's name and `answers.loaded` the value shown, as bytes;
 * `answers.value` what the editor holds. Then `TYPE`, `HGET` (and `HPTTL`), and the plan `HSET <key> <field> <value>`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.edit-field/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const field = bytesOf(answers['field']) ?? new Uint8Array();
  const loaded = bytesOf(answers['loaded']);
  const typed = typedAnswer(answers['value'], loaded);
  if ('problem' in typed) {
    return refuse('value.edit-field/invalid', typed.problem);
  }
  const fieldName = nameText(field);
  if (loaded !== undefined && isSameBytes(typed.bytes, loaded)) {
    return nothingToWrite(hashText.editFieldTitle(fieldName, nameText(keyOf(context).key)));
  }
  const guarded = guard(context, answers, 'hash', {
    readOnly: 'value.edit-field/read-only',
    gone: 'value.edit-field/gone',
    typeChanged: 'value.edit-field/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent(fieldReads(context, at, field));
  }
  if (answers['overwrite'] === false) {
    return refuse('value.edit-field/changed', hashText.notSaved);
  }
  const now = replyBytes(current[0]);
  const question =
    now === undefined
      ? hashText.fieldRemoved(fieldName, name)
      : loaded !== undefined && !isSameBytes(now, loaded)
        ? hashText.fieldChanged(fieldName, name, shown(now, undefined, 'compact').text)
        : undefined;
  return writePlan({
    at,
    name: hashText.editFieldTitle(fieldName, name),
    steps: setSteps(at, field, typed.bytes, fieldExpiry(current[1])),
    done: hashText.savedField(fieldName, name),
    ...(question === undefined ? {} : { confirm: { question, detail: '', button: hashText.overwrite } }),
  });
}
