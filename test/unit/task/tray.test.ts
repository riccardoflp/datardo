import { task } from './harness';
import { describe, expect, it } from 'vitest';
import { keepsRunning } from '../../../src/features/task/tray';
import { initialSettingsState, type SettingsState } from '../../../src/shared/state/settings';
import { taskId } from '../../../src/features/task/types';

const on: SettingsState = { ...initialSettingsState, stored: { 'datardo.task.keepRunningInTray': true } };
const off = initialSettingsState;
const enabled = task();
const disabled = task({ id: taskId('t-2'), enabled: false });

describe('task.tray', () => {
  it('keeps running with the setting on and one task enabled', () => {
    expect(keepsRunning(on, [enabled, disabled])).toBe(true);
  });

  it('quits with the setting on and every task disabled, or no task', () => {
    expect(keepsRunning(on, [disabled, { ...disabled, id: taskId('t-3') }])).toBe(false);
    expect(keepsRunning(on, [])).toBe(false);
  });

  it('quits with the setting off, whatever the tasks', () => {
    expect(keepsRunning(off, [enabled, { ...enabled, id: taskId('t-3') }, { ...enabled, id: taskId('t-4') }])).toBe(
      false,
    );
  });
});
