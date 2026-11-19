import { describe, expect, it } from 'vitest';
import { connectionId, tabId } from '../../../src/shared/ids';
import { plan, stoppedResult } from '../../../src/features/playground/stop';
import type { PlaygroundRun } from '../../../src/features/playground/types';
import { argsOf, contextOf, firstTab, planOf, playgroundOf, playgroundTabOf, stateOf, withPlayground } from './context';

const run: PlaygroundRun = {
  tab: firstTab,
  title: 'Playground 1',
  connection: connectionId('c-local'),
  connectionName: 'Local',
  database: 'shop',
  startedAt: 0,
  firstLine: 1,
};

describe('playground.stop', () => {
  it('stops the run in progress, from any tab', () => {
    const state = stateOf({
      tabs: [playgroundTabOf(firstTab, 'Playground 1'), playgroundTabOf(tabId('t2'), 'Playground 2')],
      active: tabId('t2'),
      playgrounds: { [firstTab]: playgroundOf('sleep(600000)', { run }), t2: playgroundOf('', { tab: tabId('t2') }) },
    });
    const found = planOf(plan(contextOf('playground.stop', state), {}));
    expect(found.steps[0]?.text).toBe('stop the run of Playground 1');
    expect(argsOf(found, 'playground.stop')).toEqual({ tab: 't1', title: 'Playground 1' });
    expect(found.danger).toEqual({ kind: 'none' });
  });

  it('does nothing when no playground is running', () => {
    expect(planOf(plan(contextOf('playground.stop', withPlayground('a')), {})).steps).toEqual([]);
  });

  it('ends with the output, the notes and Cancelled.', () => {
    const notes = [
      'Note: The transaction still open was aborted because the run was cancelled: nothing of it was committed (session.commitTransaction() commits).',
    ];
    expect(
      stoppedResult(
        { title: 'Playground 1', connectionName: 'Local', database: 'shop', durationMs: 900, output: ['a'] },
        notes,
      ),
    ).toEqual({
      title: 'Playground 1',
      connectionName: 'Local',
      database: 'shop',
      durationMs: 900,
      output: ['a', ...notes],
      value: { kind: 'none' },
      error: { message: 'Cancelled. Operations already sent may still complete on the server.' },
      stopped: true,
    });
  });
});
