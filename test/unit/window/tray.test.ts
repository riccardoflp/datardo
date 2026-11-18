import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/window/tray';
import { featureId, type WorkId } from '../../../src/shared/ids';
import { stateWith } from './context';

describe('window.tray', () => {
  it('says Datardo: scheduled tasks keep running when the pointer rests on it, at 16 px', () => {
    expect(view(stateWith()).tooltip).toBe('Datardo: scheduled tasks keep running');
    expect(view(stateWith()).iconSize).toBe(16);
  });

  it('has exactly Open Datardo, Scheduled tasks, a separator and Quit, in this order', () => {
    expect(view(stateWith()).entries.map((entry) => (entry.kind === 'separator' ? '—' : entry.title))).toEqual([
      'Open Datardo',
      'Scheduled tasks',
      '—',
      'Quit',
    ]);
  });

  it('Open Datardo shows the window; Scheduled tasks shows it with the Scheduled tasks page', () => {
    const [open, tasks] = view(stateWith()).entries;
    expect(open?.kind === 'command' && open.intents.map((intent) => intent.feature)).toEqual([
      'window.single-instance',
    ]);
    expect(tasks?.kind === 'command' && tasks.intents.map((intent) => intent.feature)).toEqual([
      'window.single-instance',
      'task.show',
    ]);
  });

  it('Quit quits; with work to ask about, it shows the window first', () => {
    const quit = (state: ReturnType<typeof stateWith>): readonly string[] => {
      const entry = view(state).entries[3];
      return entry?.kind === 'command' ? entry.intents.map((intent) => intent.feature) : [];
    };
    expect(quit(stateWith())).toEqual(['window.quit']);
    const busy = stateWith({
      runner: { work: [{ id: 'w' as WorkId, feature: featureId('backup.create'), title: 'Backup', started: 1 }] },
    });
    expect(quit(busy)).toEqual(['window.single-instance', 'window.quit']);
  });

  it('a click on the icon shows the window', () => {
    expect(view(stateWith()).click.map((intent) => intent.feature)).toEqual(['window.single-instance']);
  });
});
