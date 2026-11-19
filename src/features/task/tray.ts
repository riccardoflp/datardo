/**
 * Feature: task.tray — whether closing the window leaves Datardo running in the tray, so that the tasks keep running.
 */
import type { SettingsState } from '../../shared/state/settings';
import { setting } from '../settings/read';
import type { ScheduledTask } from './types';

/**
 * Feature: task.tray — true when `datardo.task.keepRunningInTray` is on and at least one task is enabled, whatever
 * its schedule. Worked out again each time the window is closed.
 */
export function keepsRunning(settings: SettingsState, tasks: readonly ScheduledTask[]): boolean {
  return setting(settings, 'datardo.task.keepRunningInTray') && tasks.some((task) => task.enabled);
}
