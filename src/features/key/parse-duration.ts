/**
 * Feature: key.parse-duration
 *
 * Reads the duration typed in **Set expiry** and in **New key** as a whole number of seconds.
 */
import { text } from './text';

/** A duration read: a whole number of seconds, 1 or more; or the error to show under the field. */
export type Duration =
  { readonly kind: 'seconds'; readonly seconds: number } | { readonly kind: 'error'; readonly message: string };

const units: Readonly<Record<string, number>> = { s: 1, m: 60, min: 60, h: 3600, d: 86_400, w: 604_800 };

const error: Duration = { kind: 'error', message: text.duration.error };

/**
 * Feature: key.parse-duration — a whole number alone is seconds; otherwise parts of a whole number and a unit (`s`,
 * `m` or `min`, `h`, `d`, `w`), added. Spaces are ignored, letters read in either case; anything else is the error.
 */
export function seconds(typed: string): Duration {
  const compact = typed.replace(/\s+/gu, '').toLowerCase();
  if (/^\d+$/u.test(compact)) {
    const total = Number(compact);
    return total >= 1 && Number.isSafeInteger(total) ? { kind: 'seconds', seconds: total } : error;
  }
  if (!/^(\d+(min|s|m|h|d|w))+$/u.test(compact)) {
    return error;
  }
  let total = 0;
  for (const part of compact.matchAll(/(\d+)(min|s|m|h|d|w)/gu)) {
    total += Number(part[1]) * (units[part[2] ?? ''] ?? 0);
  }
  return total >= 1 && Number.isSafeInteger(total) ? { kind: 'seconds', seconds: total } : error;
}
