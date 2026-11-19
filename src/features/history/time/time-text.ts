/**
 * Times as the document history and the Watch changes page write them: a date and time in the user's time zone, given
 * as minutes east of UTC so that the text depends on nothing but its arguments, a time of day to the millisecond, an
 * ISO time for a tooltip, and a duration in the unit that reads best.
 */

const two = (value: number): string => String(value).padStart(2, '0');

/** The date shifted into the time zone, read with the UTC getters. */
function shifted(milliseconds: number, offsetMinutes: number): Date {
  return new Date(milliseconds + offsetMinutes * 60_000);
}

/** A date and time in the time zone `offsetMinutes` east of UTC, to the second: `2026-11-18 14:05:09`. */
export function localDateTime(milliseconds: number, offsetMinutes: number): string {
  const date = shifted(milliseconds, offsetMinutes);
  const day = `${String(date.getUTCFullYear())}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`;
  return `${day} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`;
}

/** A time of day in the time zone `offsetMinutes` east of UTC, to the millisecond: `14:05:09.042`. */
export function localClock(milliseconds: number, offsetMinutes: number): string {
  const date = shifted(milliseconds, offsetMinutes);
  const milli = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}.${milli}`;
}

/** The time in ISO 8601, in UTC: `2026-11-18T13:05:09.042Z`. */
export function isoTime(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

/** A duration in seconds: `45 s` under two minutes, `45 min` under an hour, `3.2 h` under three days, `12.0 days`. */
export function durationText(seconds: number): string {
  const whole = Math.max(0, seconds);
  if (whole < 120) {
    return `${String(Math.round(whole))} s`;
  }
  if (whole < 3600) {
    return `${String(Math.round(whole / 60))} min`;
  }
  if (whole < 3 * 86_400) {
    return `${(whole / 3600).toFixed(1)} h`;
  }
  return `${(whole / 86_400).toFixed(1)} days`;
}
