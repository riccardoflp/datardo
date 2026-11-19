/**
 * Feature: value.save-string — replaces the value of a string with what the editor holds, keeping the key's expiry
 * with `SET … KEEPTTL`. When the value in the database is no longer the one loaded, the confirmation asks to
 * overwrite it; when the key is gone, to create it again, without an expiry.
 */
import type { Answers, Context, Outcome } from '../../shared/feature';
import { refuse } from '../../shared/feature';
import { currentReplies, guard, nothingToWrite, readCurrent, readOnlyRefusal, typedAnswer, writePlan } from './check';
import { hashText } from './text';
import { bytesOf, isSameBytes, keyOf, nameText, replyBytes, serverIsAtLeast, writeStep } from './types';

/** `KEEPTTL` is in `SET` since Redis 6.0. */
const keepTtlVersion: readonly number[] = [6, 0];

/**
 * Feature: value.save-string — `answers.value` is what the editor holds (`{ text, format }`), `answers.loaded` the
 * bytes it was loaded with. Then `TYPE` and `GET` are read, and the plan is `SET <key> <value> KEEPTTL`.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const readOnly = readOnlyRefusal(context, 'value.save-string/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const loaded = bytesOf(answers['loaded']);
  const typed = typedAnswer(answers['value'], loaded);
  if ('problem' in typed) {
    return refuse('value.save-string/invalid', typed.problem);
  }
  if (loaded !== undefined && isSameBytes(typed.bytes, loaded)) {
    return nothingToWrite(hashText.saveTitle(nameText(keyOf(context).key)));
  }
  const guarded = guard(context, answers, 'string', {
    readOnly: 'value.save-string/read-only',
    typeChanged: 'value.save-string/type-changed',
  });
  if (guarded.kind === 'stop') {
    return guarded.outcome;
  }
  const { at, name } = guarded;
  const write = { at, name: hashText.saveTitle(name), done: hashText.saved(name) };
  if (!guarded.exists) {
    return writePlan({
      ...write,
      steps: [writeStep(at, ['SET', at.key, typed.bytes])],
      confirm: {
        question: hashText.createAgain(name),
        detail: hashText.createAgainDetail,
        button: hashText.createAgainButton,
      },
    });
  }
  if (!serverIsAtLeast(context, at, keepTtlVersion)) {
    return refuse('value.save-string/unsupported', hashText.noKeepTtl);
  }
  const current = currentReplies(answers);
  if (current === undefined) {
    return readCurrent([['GET', at.key]]);
  }
  if (answers['overwrite'] === false) {
    return refuse('value.save-string/changed', hashText.notSaved);
  }
  const now = replyBytes(current[0]);
  const changed = loaded !== undefined && (now === undefined || !isSameBytes(now, loaded));
  return writePlan({
    ...write,
    steps: [writeStep(at, ['SET', at.key, typed.bytes, 'KEEPTTL'])],
    ...(changed
      ? { confirm: { question: hashText.overwriteString(name), detail: '', button: hashText.overwrite } }
      : {}),
  });
}
