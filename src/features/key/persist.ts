/**
 * Feature: key.persist
 *
 * Removes the expiry of a key, so that the server no longer deletes it: `PERSIST orders:42`. The undo gives the key
 * the time it had left when it was made persistent.
 */
import type { RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, refuse, run } from '../../shared/feature';
import { text } from './text';
import type { KeyName, ReplyOutcome } from './types';
import {
  keysUndo,
  nameText,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  refusedReply,
  writeStep,
} from './types';

/** Feature: key.persist — `PERSIST orders:42`, recorded as `Make orders:42 persistent`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.key === undefined) {
    throw new Error('key.persist needs a key of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.persist/read-only', readOnlyMessage(place));
  }
  const name = nameText(place.key);
  return run({
    title: text.persist.title(name),
    steps: [writeStep(place, ['PERSIST', place.key])],
    danger: noDanger,
    undo: keysUndo(context, place, [place.key]),
    publishes: false,
    after: [notifySuccess(text.persist.done(name)), refreshAfter(place)],
  });
}

/**
 * What the reply of `PERSIST` means. 0 makes the key read again (`PTTL <key>`): `-2` is the key that is gone
 * (`/gone`); otherwise it was already persistent, which is said.
 */
export function afterReply(reply: RedisReply, name: KeyName, timeLeftAfter?: number): ReplyOutcome {
  if (reply !== 0) {
    return { kind: 'done' };
  }
  return timeLeftAfter === -2
    ? refusedReply('key.persist/gone', text.gone(nameText(name)))
    : { kind: 'notify', level: 'info', text: text.persist.already(nameText(name)) };
}
