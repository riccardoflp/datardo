import { describe, expect, it } from 'vitest';
import { connectionId, tabId } from '../../../src/shared/ids';
import { view } from '../../../src/features/playground/show';
import type { PlaygroundRun, PlaygroundState } from '../../../src/features/playground/types';
import { firstTab, local, playgroundOf, playgroundTabOf } from './context';

const tab = playgroundTabOf(firstTab, 'Playground 1');
const onLocal = { name: 'Local', readOnly: false };

function running(tabOf = firstTab): PlaygroundRun {
  return {
    tab: tabOf,
    title: 'Playground 1',
    connection: connectionId('c-local'),
    connectionName: 'Local',
    database: 'shop',
    startedAt: 0,
    firstLine: 1,
  };
}

function shown(playground: PlaygroundState, more: Partial<Parameters<typeof view>[0]> = {}): ReturnType<typeof view> {
  return view({ tab, playground, connection: onLocal, ...more });
}

describe('playground.show', () => {
  it('shows the database of the last use("…") on the button, else the default database', () => {
    expect(shown(playgroundOf('use("shop")\ndb.orders.find()', { defaultDatabase: 'test' })).toolbar.target.label).toBe(
      'Local › shop',
    );
    expect(shown(playgroundOf('db.orders.find()', { defaultDatabase: 'test' })).toolbar.target.label).toBe(
      'Local › test',
    );
  });

  it('follows the button with (read-only) on a read-only connection', () => {
    expect(shown(playgroundOf('1'), { connection: { name: 'Production', readOnly: true } }).toolbar.target.label).toBe(
      'Production › shop (read-only)',
    );
  });

  it('has a Run button on the first line of each statement, each with its name', () => {
    const buttons = shown(playgroundOf('a = 1\n\nb = 2\nc = [\n1]')).runButtons;
    expect(buttons.map((each) => each.line)).toEqual([1, 3, 4]);
    expect(buttons[2]).toEqual({
      line: 4,
      label: 'Run',
      name: 'Run the statement at line 4',
      element: 'playground.run@editor',
      disabled: false,
    });
  });

  it('has no Run button for a script that does not parse, and keeps Run all', () => {
    const page = shown(playgroundOf('db.orders.find({'));
    expect(page.runButtons).toEqual([]);
    expect(page.toolbar.run).toMatchObject({ label: 'Run all', element: 'playground.run@toolbar', disabled: false });
    expect(page.toolbar.run.tooltip).toBe(
      'Run the script (Ctrl+Enter). Drops are confirmed first; nothing is recorded in the undo history.',
    );
  });

  it('shows Stop in the place of Run all while it runs, and disables the Run buttons', () => {
    const page = shown(playgroundOf('a = 1'), { running: running() });
    expect(page.toolbar.run).toMatchObject({ label: 'Stop', element: 'playground.stop@toolbar', disabled: false });
    expect(page.runButtons[0]?.disabled).toBe(true);
    expect(page.toolbar.target.disabled).toBe(true);
    expect(page.results.state).toBe('running');
  });

  it('disables Run all while another playground runs', () => {
    const page = shown(playgroundOf('a = 1'), { running: running(tabId('t9')) });
    expect(page.toolbar.run).toMatchObject({ label: 'Run all', disabled: true });
  });

  it('shows the dot while the text differs from the text it opened with', () => {
    expect(shown(playgroundOf('a = 1')).unsaved).toBe(false);
    expect(shown(playgroundOf('a = 1', { text: 'a = 12' })).unsaved).toBe(true);
  });

  it('says what a playground does before the first run', () => {
    expect(shown(playgroundOf('a = 1')).results).toMatchObject({
      state: 'before',
      lines: ['Run a playground with Ctrl+Enter.', expect.stringContaining('A playground runs what its script says.')],
    });
  });

  it('has the path in the scope bar and the names of the toolbar', () => {
    const page = shown(playgroundOf('a = 1'));
    expect(page.path).toBe('Local / Playground 1');
    expect(page.toolbar.target.tooltip).toBe('Connection and default database of this playground');
    expect(page.toolbar.open).toMatchObject({ label: 'Open…', element: 'playground.open-file@toolbar' });
    expect(page.toolbar.save).toMatchObject({ label: 'Save', element: 'playground.save@toolbar', disabled: false });
  });

  it('disables Save on a saved file without changes', () => {
    const saved = playgroundTabOf(firstTab, 'report.mongodb.js', local, 'C:/p/report.mongodb.js');
    expect(view({ tab: saved, playground: playgroundOf('a'), connection: onLocal }).toolbar.save.disabled).toBe(true);
  });

  it('marks the line of a failed run', () => {
    expect(shown(playgroundOf('a = 1', { failedLine: 4 })).failedLine).toBe(4);
  });
});
