/**
 * The scheduler of the main process (`task.run`, `task.missed`): it checks the tasks 3 seconds after Datardo starts and
 * then every 15 seconds, and starts a run for each task that is due (`task.due`), or what is done with a run that was
 * missed. One scheduler runs, so a task never runs twice for the same time. Its clock and its timers are given, so that
 * a test drives it with its own.
 */
import { dueTasks } from '../features/task/due';
import type { RunTrigger } from '../shared/state/tasks';
import type { AppState } from '../shared/state';

/** The first check after start, in milliseconds (`task.run`). */
export const firstCheckMs = 3_000;

/** The time between two checks, in milliseconds (`task.run`). */
export const checkEveryMs = 15_000;

/** The time and the timers the scheduler uses. */
export interface SchedulerClock {
  readonly now: () => number;
  readonly setTimer: (run: () => void, milliseconds: number) => unknown;
  readonly clearTimer: (timer: unknown) => void;
}

/** The system's clock and timers. */
export const systemClock: SchedulerClock = {
  now: () => Date.now(),
  setTimer: (run, milliseconds) => setTimeout(run, milliseconds),
  clearTimer: (timer) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  },
};

/** What the scheduler reads and starts. */
export interface SchedulerPorts {
  readonly state: () => AppState;
  /** Whether a run of the task is being started: it is left alone until it runs. */
  readonly isStarting: (task: string) => boolean;
  readonly run: (task: string, trigger: RunTrigger) => Promise<unknown>;
}

/** Checks the tasks at its times and starts what is due. */
export class Scheduler {
  private timer: unknown;
  private stopped = true;

  constructor(
    private readonly ports: SchedulerPorts,
    private readonly clock: SchedulerClock = systemClock,
  ) {}

  /** Starts the checks: the first after 3 seconds. */
  start(): void {
    this.stopped = false;
    this.schedule(firstCheckMs);
  }

  /** Stops the checks; the runs in progress go on. */
  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) {
      this.clock.clearTimer(this.timer);
      this.timer = undefined;
    }
  }

  /** One check: starts a run for each task due now; the runs, for whoever waits for them (the tests). */
  check(): Promise<unknown[]> {
    const due = dueTasks(this.ports.state().tasks, this.clock.now()).filter(
      (each) => !this.ports.isStarting(each.task),
    );
    return Promise.all(
      due.map((each) =>
        this.ports.run(each.task, each.feature === 'task.missed' ? 'missed' : 'schedule').catch(() => undefined),
      ),
    );
  }

  private schedule(milliseconds: number): void {
    this.timer = this.clock.setTimer(() => {
      this.timer = undefined;
      if (this.stopped) {
        return;
      }
      void this.check();
      this.schedule(checkEveryMs);
    }, milliseconds);
  }
}
