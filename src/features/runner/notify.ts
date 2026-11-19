/**
 * Feature: runner.notify
 *
 * Short messages at the bottom right of the window that say what just happened and offer what follows, without
 * taking the focus. `view` says which show and how; the runner writes them (`src/runner/notify.ts`).
 */
import type { NotificationAction } from '../../shared/feature';
import type { Notification, NotificationLevel } from '../../shared/state/runner';
import { runnerText } from './text';

/** *info* and *success* go away after 6 seconds (Datardo's choice). */
export const goesAwayAfterMs = 6000;

/** At most 3 notifications show at once (Datardo's choice). */
export const shownAtOnce = 3;

/** Work that ran longer than 30 seconds also notifies the system while the window is not in front (Datardo's choice). */
export const systemNotificationAfterMs = 30_000;

/** One notification as it shows. */
export interface NotificationView {
  readonly id: string;
  readonly level: NotificationLevel;
  readonly text: string;
  /** *×3* when the same message arrived three times within 30 seconds. */
  readonly times?: string;
  readonly details?: string;
  readonly actions: readonly NotificationAction[];
  /** When it goes away by itself; never for *warning* and *error*. */
  readonly goesAwayAfterMs?: number;
  /** A screen reader is told of an *error* at once, of the others politely. */
  readonly announce: 'assertive' | 'polite';
  readonly logLine?: number;
  /** The element it carries, when a feature draws it (`undo.notification@notification`). */
  readonly element?: string;
}

/** What the notifications are drawn from. */
export interface NotifyState {
  readonly notifications: readonly Notification[];
}

/** Feature: runner.notify. The notifications shown, the newest at the bottom. */
export function view(state: NotifyState): readonly NotificationView[] {
  return state.notifications.slice(-shownAtOnce).map((notification) => {
    const goesAway = notification.level === 'info' || notification.level === 'success';
    return {
      id: notification.id,
      level: notification.level,
      text: notification.text,
      actions: notification.actions ?? [],
      announce: notification.level === 'error' ? 'assertive' : 'polite',
      ...(notification.count > 1 ? { times: runnerText.times(notification.count) } : {}),
      ...(notification.details === undefined ? {} : { details: notification.details }),
      ...(goesAway ? { goesAwayAfterMs } : {}),
      ...(notification.logLine === undefined ? {} : { logLine: notification.logLine }),
      ...(notification.element === undefined ? {} : { element: notification.element }),
    };
  });
}

/** Whether the end of some work also shows as a notification of the system. */
export function notifiesTheSystem(work: {
  readonly durationMs: number;
  readonly windowInFront: boolean;
  readonly setting: boolean;
}): boolean {
  return work.setting && !work.windowInFront && work.durationMs > systemNotificationAfterMs;
}
