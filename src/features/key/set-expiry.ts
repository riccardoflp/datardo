/**
 * Feature: key.set-expiry
 *
 * Makes a key expire after a time (`EXPIRE orders:42 3600`), or at a date (`PEXPIREAT orders:42 1796083200000`).
 */
import type { RedisReply } from '../../shared/engine-request';
import type { Answers, Context, Outcome } from '../../shared/feature';
import { ask, noDanger, refuse, run } from '../../shared/feature';
import { joinedExpiryText, localDateText, timeLeftText } from './format-expiry';
import { seconds } from './parse-duration';
import { text } from './text';
import type { KeyName, KeysPlace, ReplyOutcome } from './types';
import {
  argsOf,
  keysUndo,
  nameText,
  notifySuccess,
  placeOf,
  readOnlyMessage,
  refreshAfter,
  refusedReply,
  writeStep,
} from './types';

/** The date offered by **On** for a persistent key: one hour from now. */
export const oneHour = 3_600_000;

/**
 * A date and time typed in the local time zone, `2026-12-01 09:30` or `2026-12-01 09:30:15`, or in UTC with a `Z` at
 * the end; in milliseconds since 1970, or `undefined` when it is not one.
 */
export function dateOfText(typed: string): number | undefined {
  const found = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(Z)?$/u.exec(typed.trim());
  if (found === null) {
    return undefined;
  }
  const part = (index: number): number => Number(found[index] ?? 0);
  const [year, month, day, hour, minute, second] = [part(1), part(2), part(3), part(4), part(5), part(6)];
  const utc = found[7] === 'Z';
  const at = utc
    ? Date.UTC(year, month - 1, day, hour, minute, second)
    : new Date(year, month - 1, day, hour, minute, second).getTime();
  const date = new Date(at);
  const sameDay = utc
    ? date.getUTCDate() === day && date.getUTCMonth() === month - 1
    : date.getDate() === day && date.getMonth() === month - 1;
  return Number.isNaN(at) || !sameDay ? undefined : at;
}

/** The present expiry the form says: *Now: in 2 h 5 min · 2026-11-18 14:05:09*, or *Now: persistent*. */
export function presentExpiry(expiresAt: number | undefined, now: number): string {
  return expiresAt === undefined ? text.setExpiry.nowPersistent : text.setExpiry.now(joinedExpiryText(expiresAt, now));
}

function expiryForm(name: KeyName, expiresAt: number | undefined, now: number): Outcome {
  return ask({
    title: text.setExpiry.form(nameText(name)),
    text: presentExpiry(expiresAt, now),
    button: text.setExpiry.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'when',
        label: text.setExpiry.title(nameText(name)),
        choices: [
          { value: 'in', label: text.setExpiry.in },
          { value: 'on', label: text.setExpiry.on },
        ],
        default: 'in',
      },
      { kind: 'text', key: 'duration', label: text.setExpiry.duration, default: '' },
      { kind: 'text', key: 'date', label: text.setExpiry.date, default: localDateText(expiresAt ?? now + oneHour) },
    ],
  });
}

/** The command and the time left it gives, or the refusal of what was typed. */
function command(
  place: KeysPlace,
  name: KeyName,
  answers: Answers,
  now: number,
): Outcome | { words: readonly (string | Uint8Array)[]; left: number } {
  if (answers['when'] === 'on') {
    const at = dateOfText(typeof answers['date'] === 'string' ? answers['date'] : '');
    if (at === undefined) {
      return refuse('key.set-expiry/invalid', text.setExpiry.badDate);
    }
    return at <= now
      ? refuse('key.set-expiry/invalid', text.setExpiry.pastDate)
      : { words: ['PEXPIREAT', name, String(at)], left: at - now };
  }
  const duration = seconds(typeof answers['duration'] === 'string' ? answers['duration'] : '');
  return duration.kind === 'error'
    ? refuse('key.set-expiry/invalid', duration.message)
    : { words: ['EXPIRE', name, String(duration.seconds)], left: duration.seconds * 1000 };
}

/**
 * Feature: key.set-expiry — the form **Set expiry of orders:42**, then `EXPIRE orders:42 3600` for **In** or
 * `PEXPIREAT orders:42 1796083200000` for **On**; recorded as `Set expiry of orders:42`. `args.expiresAt` is the
 * present date of expiry as `key.inspect` read it, absent for a persistent key.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place?.key === undefined) {
    throw new Error('key.set-expiry needs a key of a Redis connection.');
  }
  if (place.connection.readOnly) {
    return refuse('key.set-expiry/read-only', readOnlyMessage(place));
  }
  const present = argsOf(answers)['expiresAt'];
  if (answers['when'] === undefined) {
    return expiryForm(place.key, typeof present === 'number' ? present : undefined, context.now);
  }
  const chosen = command(place, place.key, answers, context.now);
  if ('kind' in chosen) {
    return chosen;
  }
  const name = nameText(place.key);
  return run({
    title: text.setExpiry.title(name),
    steps: [writeStep(place, chosen.words)],
    danger: noDanger,
    undo: keysUndo(context, place, [place.key]),
    publishes: false,
    after: [notifySuccess(text.setExpiry.done(name, timeLeftText(chosen.left))), refreshAfter(place)],
  });
}

/** What the reply means: 0 is a key that expired or was deleted meanwhile (`/gone`). */
export function afterReply(reply: RedisReply, name: KeyName): ReplyOutcome {
  return reply === 0 ? refusedReply('key.set-expiry/gone', text.gone(nameText(name))) : { kind: 'done' };
}
