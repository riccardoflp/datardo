/**
 * Feature: undo.notification — the notification that reports a recorded write has an **Undo** button, for undoing it
 * at once. The notification itself is drawn by `runner.notify`.
 */
import type { NotificationAction } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { revertText } from './text';
import type { UndoEntry } from './types';
import { entryTarget } from './types';

/** What the notification of a write is drawn from: its result, and the operation it recorded, when it did. */
export interface NotificationState {
  readonly text: string;
  readonly level: 'info' | 'success' | 'warning' | 'error';
  /** The operation the write recorded; none when it recorded nothing. */
  readonly recorded?: UndoEntry;
  /** A restore of several collections, which records one operation per collection. */
  readonly severalOperations?: boolean;
}

/** The notification of a write. */
export interface NotificationView {
  readonly level: NotificationState['level'];
  readonly text: string;
  readonly actions: readonly NotificationAction[];
  /** The element of the notification when it has **Undo**. */
  readonly element?: string;
}

/** **Undo** in the notification of a write: `undo.revert` on that operation. */
export function undoAction(entry: UndoEntry): NotificationAction {
  return {
    label: revertText.undo,
    element: 'undo.revert@notification',
    feature: featureId('undo.revert'),
    target: entryTarget(entry),
    args: { operation: entry.id },
  };
}

/** Feature: undo.notification. The result with **Undo** when the write recorded an operation, without it otherwise. */
export function view(state: NotificationState): NotificationView {
  if (state.severalOperations === true) {
    return { level: state.level, text: `${state.text} ${revertText.severalCollections}`, actions: [] };
  }
  if (state.recorded === undefined) {
    return { level: state.level, text: state.text, actions: [] };
  }
  return {
    level: state.level,
    text: state.text,
    actions: [undoAction(state.recorded)],
    element: 'undo.notification@notification',
  };
}
