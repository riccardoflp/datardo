/**
 * How the Monitor page writes times, durations, sizes and rates: `850 ms`, `12.4 s`, `3m 20s`, `2h 5m`, `3d 4h`;
 * `1.5 MB`, `12 MB`, `840 B`; `3.1`, `41`. The units of time are Mongoster's (`src/webview/monitor.ts › fmtDuration`).
 */
import { groupThousands } from '../../../shared/text-units';

/**
 * A span of seconds with its two largest units: `45 s`, `3m 20s`, `5h 12m`, `3d 4h`, `1d 0h`. Under a minute it is
 * whole seconds; a second unit of 0 is kept (`1h 0m`).
 */
export function spanText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) {
    return `${String(whole)} s`;
  }
  if (whole < 3600) {
    return `${String(Math.floor(whole / 60))}m ${String(whole % 60)}s`;
  }
  if (whole < 86_400) {
    return `${String(Math.floor(whole / 3600))}h ${String(Math.floor((whole % 3600) / 60))}m`;
  }
  return `${groupThousands(Math.floor(whole / 86_400))}d ${String(Math.floor((whole % 86_400) / 3600))}h`;
}

/** A running time in microseconds: `850 ms` under a second, `12.4 s` under a minute, then {@link spanText}. */
export function runningText(microseconds: number): string {
  const milliseconds = microseconds / 1000;
  if (milliseconds < 1000) {
    return `${String(Math.round(milliseconds))} ms`;
  }
  const seconds = milliseconds / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : spanText(seconds);
}

const sizeUnits = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A size in units of 1,024, with one decimal under 10: `1.5 MB`, `12 MB`, `840 B`. */
export function sizeText(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < sizeUnits.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit > 0 && value < 10 ? value.toFixed(1) : groupThousands(Math.round(value));
  return `${shown} ${sizeUnits[unit] ?? 'B'}`;
}

/** A rate: one decimal under 10, whole from 10 (`3.1`, `41`); none at all is `0`, as the tile writes `delete 0`. */
export function rateText(rate: number): string {
  if (rate === 0) {
    return '0';
  }
  return rate < 10 ? rate.toFixed(1) : groupThousands(Math.round(rate));
}

/** A count with a comma every three digits: `1,204`. */
export function countText(value: number): string {
  return groupThousands(value);
}

/** One of two words by a count: `1 operation`, `12 operations`, with the count's separators. */
export function counted(count: number, one: string, many: string): string {
  return `${groupThousands(count)} ${count === 1 ? one : many}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** The time of the day of an instant, where Datardo runs: `14:02:11`. */
export function clockText(milliseconds: number): string {
  const date = new Date(milliseconds);
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}`;
}

/** The date and time of an instant, where Datardo runs: `17/11/2026, 14:02:11`. */
export function dateTimeText(milliseconds: number): string {
  const date = new Date(milliseconds);
  const day = `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${String(date.getFullYear())}`;
  return `${day}, ${clockText(milliseconds)}`;
}

/** The date and time of an instant as the oplog window writes its start: `2026-11-12 08:14:02`. */
export function isoDayTimeText(milliseconds: number): string {
  const date = new Date(milliseconds);
  const day = `${String(date.getFullYear())}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
  return `${day} ${clockText(milliseconds)}`;
}

/** Whether two instants are on the same day, where Datardo runs. */
export function isSameDay(one: number, other: number): boolean {
  const first = new Date(one);
  const second = new Date(other);
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** Whether a text holds another, whatever the case: how the filters of the page look. */
export function holdsWithoutCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
