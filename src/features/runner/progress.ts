/**
 * Feature: runner.progress
 *
 * What takes long shows on the status line while it runs, and in the list of work: its title, its connection, the
 * time since it started, its progress, and **Cancel**, or why it cannot be cancelled.
 */
import type { Work } from '../../shared/state/runner';
import { runnerText } from './text';

/** One item of the list of work. */
export interface WorkView {
  readonly id: string;
  readonly title: string;
  readonly connection?: string;
  /** The time since it started: *12 s*, *2 min 5 s*. */
  readonly elapsed: string;
  /** *4,000 of 52,310 documents*, when the total is known. */
  readonly progress?: string;
  /** From 0 to 1 when the total is known; a moving bar otherwise. */
  readonly fraction?: number;
  /** **Cancel** shows; otherwise the reason it cannot be cancelled, in its place. */
  readonly cancellable: boolean;
  readonly cannotCancel?: string;
  /** *Cancelled*, while it stops. */
  readonly cancelled: boolean;
  /** The error of an item that failed, shown until dismissed. */
  readonly error?: string;
}

/** What the status line and the list show. */
export interface ProgressView {
  /** *1 task running*, *3 tasks running*; nothing when there is none. */
  readonly status?: string;
  readonly items: readonly WorkView[];
}

/** What the view is drawn from: the work in progress, the names of the connections, and the time now. */
export interface ProgressState {
  readonly work: readonly Work[];
  readonly now: number;
  readonly connectionName?: (connection: string) => string;
}

/** Feature: runner.progress. The status line's count and the list of work. */
export function view(state: ProgressState): ProgressView {
  const running = state.work.filter((work) => work.error === undefined).length;
  return {
    ...(running === 0 ? {} : { status: runnerText.tasksRunning(running) }),
    items: state.work.map((work) => item(work, state)),
  };
}

function item(work: Work, state: ProgressState): WorkView {
  const known = work.total !== undefined && work.done !== undefined && work.total > 0;
  return {
    id: work.id,
    title: work.title,
    elapsed: elapsedText(state.now - work.started),
    cancellable: work.cannotCancel === undefined && work.error === undefined && work.cancelled !== true,
    cancelled: work.cancelled === true,
    ...(work.connection === undefined
      ? {}
      : { connection: state.connectionName?.(work.connection) ?? work.connection }),
    ...(known ? { progress: runnerText.progress(work.done ?? 0, work.total ?? 0, work.unit ?? 'items') } : {}),
    ...(known ? { fraction: Math.min(1, (work.done ?? 0) / (work.total ?? 1)) } : {}),
    ...(work.cannotCancel === undefined ? {} : { cannotCancel: work.cannotCancel }),
    ...(work.error === undefined ? {} : { error: work.error }),
  };
}

/** A duration as the list writes it: *0 s*, *12 s*, *2 min 5 s*, *1 h 3 min*. */
export function elapsedText(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) {
    return `${String(seconds)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${String(minutes)} min ${String(seconds % 60)} s`;
  }
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}
