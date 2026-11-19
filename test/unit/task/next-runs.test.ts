import { at, local } from './harness';
import { describe, expect, it } from 'vitest';
import { describeSchedule, nextRun, nextRuns, previousRun } from '../../../src/features/task/next-runs';
import type { Schedule } from '../../../src/features/task/types';

const daily0230: Schedule = { kind: 'daily', time: '02:30' };

describe('task.next-runs', () => {
  it('runs a daily schedule at its time, the next day after it, and across the new year', () => {
    expect(local(nextRun(daily0230, at(2026, 11, 11, 1)))).toBe('2026-11-11 02:30');
    expect(local(nextRun(daily0230, at(2026, 11, 11, 2, 30)))).toBe('2026-11-12 02:30');
    expect(local(nextRun(daily0230, at(2026, 12, 31, 23)))).toBe('2027-01-01 02:30');
  });

  it('runs every 6 hours at 08:15 from 02:15', () => {
    const runs = nextRuns({ kind: 'hours', every: 6, time: '08:15' }, at(2026, 11, 11), 5).map(local);
    expect(runs).toEqual([
      '2026-11-11 02:15',
      '2026-11-11 08:15',
      '2026-11-11 14:15',
      '2026-11-11 20:15',
      '2026-11-12 02:15',
    ]);
  });

  it('runs weekly on Mon and Thu at 23:30', () => {
    const runs = nextRuns({ kind: 'weekly', days: [1, 4], time: '23:30' }, at(2026, 11, 11, 12), 3).map(local);
    expect(runs).toEqual(['2026-11-12 23:30', '2026-11-16 23:30', '2026-11-19 23:30']);
  });

  it('runs a time that does not exist when daylight saving starts in the new time', () => {
    expect(nextRuns(daily0230, at(2026, 3, 27, 12), 3).map(local)).toEqual([
      '2026-03-28 02:30',
      '2026-03-29 03:30',
      '2026-03-30 02:30',
    ]);
  });

  it('runs a time that happens twice when daylight saving ends once, 25 hours before the next', () => {
    const runs = nextRuns(daily0230, at(2026, 10, 24, 12), 2);
    expect(runs.map(local)).toEqual(['2026-10-25 02:30', '2026-10-26 02:30']);
    expect((runs[1] ?? 0) - (runs[0] ?? 0)).toBe(25 * 3_600_000);
  });

  it('runs every hour at :30 once in the hour that daylight saving skips', () => {
    expect(nextRuns({ kind: 'hours', every: 1, time: '00:30' }, at(2026, 3, 29, 0, 45), 3).map(local)).toEqual([
      '2026-03-29 01:30',
      '2026-03-29 03:30',
      '2026-03-29 04:30',
    ]);
  });

  it('skips no day and runs no day twice across the start of daylight saving', () => {
    const runs = nextRuns(daily0230, at(2026, 3, 25), 9).map((time) => local(time).slice(0, 10));
    expect(runs).toEqual([
      '2026-03-25',
      '2026-03-26',
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ]);
  });

  it('has no next run for a weekly schedule without days, nor for a time that does not parse', () => {
    expect(nextRun({ kind: 'weekly', days: [], time: '07:00' }, at(2026, 11, 11))).toBeUndefined();
    expect(nextRun({ kind: 'daily', time: '25:00' }, at(2026, 11, 11))).toBeUndefined();
    expect(nextRun({ kind: 'daily', time: 'soon' }, at(2026, 11, 11))).toBeUndefined();
  });

  it('gives as the previous run of a daily schedule the run at the very time asked', () => {
    expect(local(previousRun(daily0230, at(2026, 11, 11, 2, 30, 0)))).toBe('2026-11-11 02:30');
    expect(local(previousRun(daily0230, at(2026, 11, 11, 2, 29, 59)))).toBe('2026-11-10 02:30');
  });

  it('accepts H:MM', () => {
    expect(local(nextRun({ kind: 'daily', time: '7:05' }, at(2026, 11, 11)))).toBe('2026-11-11 07:05');
  });

  it('describes schedules in words', () => {
    expect(describeSchedule({ kind: 'hours', every: 6, time: '02:30' })).toBe(
      'Every 6 hours (02:30, 08:30, 14:30, 20:30)',
    );
    expect(describeSchedule({ kind: 'hours', every: 1, time: '00:30' })).toBe('Every hour at :30');
    expect(describeSchedule({ kind: 'daily', time: '02:00' })).toBe('Daily at 02:00');
    expect(describeSchedule({ kind: 'weekly', days: [4, 1], time: '23:30' })).toBe('Mon, Thu at 23:30');
    expect(describeSchedule({ kind: 'weekly', days: [1, 2, 3, 4, 5], time: '07:00' })).toBe('Weekdays at 07:00');
    expect(describeSchedule({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '07:00' })).toBe('Every day at 07:00');
    expect(describeSchedule({ kind: 'weekly', days: [], time: '07:00' })).toBe('No days chosen');
    expect(describeSchedule({ kind: 'daily', time: '25:00' })).toBe('Invalid time');
  });
});
