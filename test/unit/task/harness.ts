/**
 * What the unit tests of the scheduled tasks area start from: the system's time zone set to Europe/Rome (the cards'
 * worked examples are in it), times written as local dates, the saved connections Local (MongoDB) and Cache local
 * (Redis), a task and the app's state that holds it.
 */
import { afterAll } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import { noSecretsSaved } from '../../../src/shared/connection';
import type { Context, Outcome, Step } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';
import { initialConnectionsState } from '../../../src/shared/state/connections';
import type { ScheduledTask, TaskState, TasksState, RunProgress } from '../../../src/features/task/types';
import { initialTasksState, taskId } from '../../../src/features/task/types';

const zone = process.env['TZ'];
process.env['TZ'] = 'Europe/Rome';
afterAll(() => {
  if (zone === undefined) {
    delete process.env['TZ'];
  } else {
    process.env['TZ'] = zone;
  }
});

/** A local time in Europe/Rome: year, month from 1, day, then hours, minutes and seconds when given. */
export function at(...parts: readonly number[]): number {
  const [year = 2026, month = 1, day = 1, hours = 0, minutes = 0, seconds = 0] = parts;
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
}

/** A time as `YYYY-MM-DD HH:MM` in local time, to compare with the cards. */
export function local(time: number | undefined): string {
  if (time === undefined) {
    return 'none';
  }
  const date = new Date(time);
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** A saved connection. */
export function connection(id: string, name: string, more: Partial<ConnectionView> = {}): ConnectionView {
  return {
    id: connectionId(id),
    name,
    engine: 'mongodb',
    hosts: 'db1:27017',
    readOnly: false,
    keepsUndo: true,
    secrets: { ...noSecretsSaved, connectionString: true },
    ...more,
  };
}

export const localConnection = connection('c-local', 'Local', { color: 'blue' });
export const cacheConnection = connection('c-cache', 'Cache local', { engine: 'redis', hosts: 'cache:6379' });

/** A daily backup of `shop` on Local at 02:00 into `D:\backups`, keeping 7, created on 1 January 2026. */
export function task(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: taskId('t-1'),
    name: 'Back up shop',
    engine: 'mongodb',
    kind: 'backup',
    enabled: true,
    connection: localConnection.id,
    database: 'shop',
    format: 'archive',
    folder: 'D:\\backups',
    pattern: '{name}_{date}_{time}',
    schedule: { kind: 'daily', time: '02:00' },
    keep: 7,
    runMissed: false,
    notifySuccess: false,
    since: at(2026, 1, 1),
    ...overrides,
  };
}

/** The tasks part of the state with these tasks, their states and their runs in progress. */
export function tasksWith(
  tasks: readonly ScheduledTask[],
  states: Readonly<Record<string, TaskState>> = {},
  running: Readonly<Record<string, RunProgress>> = {},
): TasksState {
  return { ...initialTasksState, tasks, states, running };
}

/** The app's state with the tasks part and the saved connections. */
export function appStateWith(
  tasks: TasksState,
  connections: readonly ConnectionView[] = [localConnection, cacheConnection],
): AppState {
  return {
    ...initialState,
    connections: { ...initialConnectionsState, loaded: true, saved: connections },
    tasks,
  };
}

/** A context of the feature at `now`. */
export function contextOf(feature: string, state: AppState, now: number): Context {
  return { feature: featureId(feature), now, platform: 'windows', startedBy: 'task', target: { kind: 'app' }, state };
}

/** The steps of a plan, or none when the outcome is not a plan. */
export function stepsOf(outcome: Outcome): readonly Step[] {
  return outcome.kind === 'run' ? outcome.plan.steps : [];
}

/** The texts of the steps of a plan. */
export function stepTexts(outcome: Outcome): readonly string[] {
  return stepsOf(outcome).map((step) => step.text);
}
