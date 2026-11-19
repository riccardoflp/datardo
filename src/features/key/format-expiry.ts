/**
 * Feature: key.format-expiry
 *
 * Writes when a key expires as the user reads it: how long is left, and the date in the local time zone.
 */
import { text } from './text';

/** When a key expires, as written: the time left, and the date (empty for a persistent key). */
export interface ExpiryText {
  readonly left: string;
  readonly date: string;
}

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

/** Two units, the second left out when it is zero: `5 min 12 s`, `2 h`. */
function twoUnits(first: number, firstUnit: string, next: number, nextUnit: string): string {
  return next === 0 ? `${String(first)} ${firstUnit}` : `${String(first)} ${firstUnit} ${String(next)} ${nextUnit}`;
}

/** The time left, cut and never rounded: `< 1 s`, `42 s`, `5 min 12 s`, `2 h 5 min`, `3 d 4 h`. */
export function timeLeftText(left: number): string {
  if (left <= 0) {
    return text.expiry.expired;
  }
  if (left < second) {
    return text.expiry.lessThanASecond;
  }
  if (left < minute) {
    return `${String(Math.floor(left / second))} s`;
  }
  if (left < hour) {
    return twoUnits(Math.floor(left / minute), 'min', Math.floor((left % minute) / second), 's');
  }
  if (left < day) {
    return twoUnits(Math.floor(left / hour), 'h', Math.floor((left % hour) / minute), 'min');
  }
  return twoUnits(Math.floor(left / day), 'd', Math.floor((left % day) / hour), 'h');
}

const two = (value: number): string => String(value).padStart(2, '0');

/** A date in the local time zone, to the second: `2026-11-18 14:05:09`. */
export function localDateText(at: number): string {
  const date = new Date(at);
  return `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/**
 * Feature: key.format-expiry — the time left and the date of an expiry in milliseconds since 1970, or **Persistent**
 * and no date for a key without one.
 */
export function expiryText(expiresAt: number | undefined, now: number): ExpiryText {
  if (expiresAt === undefined) {
    return { left: text.expiry.persistent, date: '' };
  }
  return { left: timeLeftText(expiresAt - now), date: localDateText(expiresAt) };
}

/** The expiry as the inspector island joins it: *in 2 h 5 min · 2026-11-18 14:05:09*, or **Persistent**. */
export function joinedExpiryText(expiresAt: number | undefined, now: number): string {
  const written = expiryText(expiresAt, now);
  if (expiresAt === undefined) {
    return written.left;
  }
  return expiresAt <= now ? `${written.left} · ${written.date}` : text.expiry.joined(written.left, written.date);
}

/** The expiry as the table's cell shows it: the time left, or `—` for a persistent key. */
export function expiryCellText(expiresAt: number | undefined, now: number): string {
  return expiresAt === undefined ? text.expiry.none : expiryText(expiresAt, now).left;
}
