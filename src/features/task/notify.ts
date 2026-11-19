/**
 * Feature: task.notify — the notification of a run: failed and skipped runs are told at once, successful ones only
 * when the task asks for it, cancelled and missed ones never.
 */
import { sizeText } from './show';
import { notifyText } from './text';
import type { ScheduledTask, TaskRun } from './types';
import { groupThousands } from '../../shared/text-units';

/** A button of the notification: open the page, or show the output in the system's file manager. */
export type NotifyButton =
  | { readonly kind: 'show'; readonly label: string; readonly element: 'task.show@notification' }
  | { readonly kind: 'reveal'; readonly label: string; readonly path: string };

/** The notification of a run, as the window (or the system, while the window is hidden) shows it. */
export interface RunNotification {
  readonly level: 'success' | 'warning' | 'error';
  readonly text: string;
  readonly buttons: readonly NotifyButton[];
  /** A notification of the system rather than of the window: the window is hidden in the tray. */
  readonly system: boolean;
}

/** What the notification is made from. */
export interface NotifyState {
  readonly task: ScheduledTask;
  readonly run: TaskRun;
  /** Whether the window is hidden in the tray (`window.tray`). */
  readonly hidden: boolean;
}

const plural = (count: number, what: string): string => `${groupThousands(count)} ${what}${count === 1 ? '' : 's'}`;

const show: NotifyButton = { kind: 'show', label: notifyText.show, element: 'task.show@notification' };

/** The seconds of a run, with one decimal: `12.4`. */
export function secondsText(run: TaskRun): string {
  return ((run.end - run.start) / 1000).toFixed(1);
}

function doneText(task: ScheduledTask, run: TaskRun): string {
  const what = [
    ...(task.kind === 'backup' && run.collections !== undefined ? [plural(run.collections, 'collection')] : []),
    plural(run.documents ?? 0, 'document'),
    sizeText(run.size ?? 0),
  ].join(', ');
  const file = (run.output ?? '').split(/[\\/]/u).at(-1) ?? '';
  return notifyText.done(task.name, what, secondsText(run), file);
}

/**
 * Feature: task.notify — the notification of a run, or undefined when it shows none. While the window is hidden in
 * the tray, a failed or a skipped run is a notification of the system, whose click shows the window.
 */
export function view(state: NotifyState): RunNotification | undefined {
  const { task, run, hidden } = state;
  switch (run.status) {
    case 'failed':
      return { level: 'error', text: notifyText.failed(task.name, run.error ?? ''), buttons: [show], system: hidden };
    case 'skipped':
      return {
        level: 'warning',
        text: notifyText.skipped(task.name, run.error ?? ''),
        buttons: [show],
        system: hidden,
      };
    case 'done':
      if (!task.notifySuccess) {
        return undefined;
      }
      return {
        level: 'success',
        text: doneText(task, run),
        buttons: [{ kind: 'reveal', label: notifyText.reveal, path: run.output ?? '' }, show],
        system: false,
      };
    case 'cancelled':
    case 'missed':
      return undefined;
  }
}
