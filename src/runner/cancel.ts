/**
 * `runner.cancel`: stops work in progress. The work's signal is raised; a plan stops before its next step (or after
 * the batch in progress), a read stops being waited for at once. A plan of one step that has been sent cannot be
 * cancelled, and its item says why.
 */
import type { WorkId } from '../shared/ids';
import type { RunnerPorts } from './ports';
import { runtimeOf } from './runtime';

/** Cancels the work with this identifier; false when it has ended or cannot be cancelled. */
export function cancel(ports: RunnerPorts, workId: WorkId): boolean {
  return runtimeOf(ports).work.get(workId)?.cancel() ?? false;
}

/** Cancels the work started last: the command `runner.cancel` of Go to. */
export function cancelLatest(ports: RunnerPorts): boolean {
  return runtimeOf(ports).work.latest()?.cancel() ?? false;
}

/** The error a cancelled wait ends with, which the runner tells from a failure. */
export class Cancelled extends Error {
  /**
   * Made when the signal of the work is raised. A step whose card says what a cancel of it says (*Download
   * cancelled.*) gives it as `said`, which the notification shows in place of how far the plan went.
   */
  constructor(readonly said?: string) {
    super('Cancelled.');
    this.name = 'Cancelled';
  }
}

/** Waits for `promise`, or stops waiting at once when `signal` is raised. */
export async function unlessCancelled<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new Cancelled();
  }
  let stop: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    stop = () => {
      reject(new Cancelled());
    };
    signal.addEventListener('abort', stop, { once: true });
  });
  try {
    return await Promise.race([promise, cancelled]);
  } finally {
    if (stop !== undefined) {
      signal.removeEventListener('abort', stop);
    }
  }
}
