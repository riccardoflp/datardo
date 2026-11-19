/**
 * Feature: task.next-runs — the times a schedule gives, in local time, also on the days daylight saving starts and
 * ends.
 *
 * Local time is the system's time zone, through the local fields of `Date` built from a given time: no clock is read
 * (R3.1). On the day daylight saving starts, a time that does not exist is the time the clock reaches in the new time
 * (02:30 is 03:30), as `Date` resolves it; on the day it ends, a time that happens twice is its first.
 */
import { scheduleText } from './text';
import type { Schedule } from './types';

/** The hours a schedule of every N hours may have. */
export const hourChoices: readonly number[] = [1, 2, 3, 4, 6, 8, 12];

/** How many days `nextRun` and `previousRun` look through. */
const daysLooked = 10;

const dayMs = 86_400_000;

/** A time of the day. */
export interface TimeOfDay {
  readonly hours: number;
  readonly minutes: number;
}

/** `HH:MM` (also `H:MM`) as a time of the day, or undefined when it is not one. */
export function parseTime(text: string): TimeOfDay | undefined {
  const match = /^\s*(\d{1,2}):(\d{2})\s*$/u.exec(text);
  if (match === null) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : undefined;
}

/** Two digits: `07`. */
export function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** `HH:MM`. */
export function clockText(time: TimeOfDay): string {
  return `${twoDigits(time.hours)}:${twoDigits(time.minutes)}`;
}

/** The times of the day a schedule runs at, in order: every N hours from `time`'s hour modulo N. */
export function timesOfDay(schedule: Schedule): readonly TimeOfDay[] {
  const time = parseTime(schedule.time);
  if (time === undefined) {
    return [];
  }
  if (schedule.kind !== 'hours') {
    return [time];
  }
  const every = Math.max(1, Math.min(24, Math.floor(schedule.every)));
  const times: TimeOfDay[] = [];
  for (let hours = time.hours % every; hours < 24; hours += every) {
    times.push({ hours, minutes: time.minutes });
  }
  return times;
}

/** A local calendar day. */
interface Day {
  readonly year: number;
  readonly month: number;
  readonly date: number;
}

/** The runs on one local day, in order, a time that two local times resolve to counted once. */
function runsOnDay(schedule: Schedule, day: Day): readonly number[] {
  const weekday = new Date(day.year, day.month, day.date, 12).getDay();
  if (schedule.kind === 'weekly' && !schedule.days.includes(weekday)) {
    return [];
  }
  const times = timesOfDay(schedule).map((time) =>
    new Date(day.year, day.month, day.date, time.hours, time.minutes).getTime(),
  );
  return [...new Set(times)].sort((first, second) => first - second);
}

/** The local days from the one of `from`, one at a time forward or backward. */
function days(from: number, direction: 1 | -1): readonly Day[] {
  const start = new Date(from);
  return Array.from({ length: daysLooked }, (_, index) => {
    // At noon, which no change of daylight saving moves to another day.
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index * direction, 12);
    return { year: day.getFullYear(), month: day.getMonth(), date: day.getDate() };
  });
}

/** The first run strictly after `after` (milliseconds since 1970), looking from the day before for 10 days. */
export function nextRun(schedule: Schedule, after: number): number | undefined {
  for (const day of days(after - dayMs, 1)) {
    const found = runsOnDay(schedule, day).find((time) => time > after);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** The last run at or before `at`, looking back 10 days. */
export function previousRun(schedule: Schedule, at: number): number | undefined {
  for (const day of days(at + dayMs, -1)) {
    const found = runsOnDay(schedule, day)
      .filter((time) => time <= at)
      .at(-1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** The next `count` runs after `after`, each strictly after the one before. */
export function nextRuns(schedule: Schedule, after: number, count: number): readonly number[] {
  const runs: number[] = [];
  let from = after;
  while (runs.length < count) {
    const next = nextRun(schedule, from);
    if (next === undefined) {
      break;
    }
    runs.push(next);
    from = next;
  }
  return runs;
}

/** The days of a weekly schedule in words, from Monday: `Mon, Thu`, `Weekdays`, `Every day`. */
function daysText(chosen: readonly number[]): string {
  const ordered = [1, 2, 3, 4, 5, 6, 0].filter((day) => chosen.includes(day));
  if (ordered.length === 7) {
    return scheduleText.everyDay;
  }
  if (ordered.length === 5 && !ordered.includes(0) && !ordered.includes(6)) {
    return scheduleText.weekdays;
  }
  return ordered.map((day) => scheduleText.weekdayNames[day] ?? '').join(', ');
}

/**
 * A schedule in words: `Every 6 hours (02:30, 08:30, 14:30, 20:30)`, `Every hour at :30`, `Daily at 02:00`, `Mon,
 * Thu at 23:30`; `No days chosen`; `Invalid time`.
 */
export function describeSchedule(schedule: Schedule): string {
  const times = timesOfDay(schedule).map(clockText);
  const first = times[0];
  if (first === undefined) {
    return scheduleText.invalidTime;
  }
  switch (schedule.kind) {
    case 'daily':
      return scheduleText.daily(first);
    case 'weekly':
      return schedule.days.some((day) => day >= 0 && day <= 6)
        ? scheduleText.weekly(daysText(schedule.days), first)
        : scheduleText.noDays;
    case 'hours':
      return schedule.every === 1
        ? scheduleText.hourly(first.slice(3))
        : scheduleText.everyHours(schedule.every, times.join(', '));
  }
}

function sameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

/** The local day `offset` days from the one of `now`, at noon. */
function dayFrom(now: number, offset: number): Date {
  const today = new Date(now);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, 12);
}

/** A time as the page says it, from `now`: `today 02:00`, `tomorrow 02:00`, `yesterday 23:30`, `Fri 13 Nov 02:00`. */
export function whenText(at: number, now: number): string {
  const date = new Date(at);
  const time = clockText({ hours: date.getHours(), minutes: date.getMinutes() });
  if (sameDay(date, dayFrom(now, 0))) {
    return scheduleText.today(time);
  }
  if (sameDay(date, dayFrom(now, 1))) {
    return scheduleText.tomorrow(time);
  }
  if (sameDay(date, dayFrom(now, -1))) {
    return scheduleText.yesterday(time);
  }
  const weekday = scheduleText.weekdayNames[date.getDay()] ?? '';
  const month = scheduleText.monthNames[date.getMonth()] ?? '';
  return `${weekday} ${String(date.getDate())} ${month} ${time}`;
}

/** The local time of the day of a moment, `HH:MM`. */
export function timeText(at: number): string {
  const date = new Date(at);
  return clockText({ hours: date.getHours(), minutes: date.getMinutes() });
}
