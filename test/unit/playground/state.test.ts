/**
 * What the main process keeps of the playgrounds: the part `playgrounds` of the app's state, the runs of the host with
 * a process that a test drives, the target a file remembers, and the entries other areas give a playground (the tab's
 * menu, **Cancel** on the status line).
 */
import { describe, expect, it } from 'vitest';
import { view as statusLine } from '../../../src/features/nav/status-line';
import { view as tabMenu } from '../../../src/features/tab/menu';
import type { FromRun, ToRun } from '../../../src/features/playground/runtime';
import { PlaygroundHost, type RunArgs, type RunProcess } from '../../../src/main/playground/host';
import { connectionId, featureId, tabId, type WorkId } from '../../../src/shared/ids';
import { reduce } from '../../../src/shared/state';
import { reducePlaygrounds, type PlaygroundsState, type RunResult } from '../../../src/shared/state/playgrounds';
import { playgroundTargetIn, withPlaygroundTarget } from '../../../src/storage/connection-state';
import { harness } from '../runner/harness';
import { input } from '../nav/inputs';
import { firstTab, playgroundOf, playgroundTabOf, stateOf } from './context';

const result = (more: Partial<RunResult> = {}): RunResult => ({
  title: 'Playground 1',
  connectionName: 'Local',
  database: 'shop',
  durationMs: 3,
  value: { kind: 'none' },
  output: [],
  ...more,
});

const run = {
  tab: firstTab,
  title: 'Playground 1',
  connection: connectionId('local'),
  connectionName: 'Local',
  database: 'shop',
  startedAt: 0,
  firstLine: 1,
};

function opened(text = 'db.orders.find()'): PlaygroundsState {
  return reducePlaygrounds({}, { slice: 'playgrounds', type: 'opened', playground: playgroundOf(text) });
}

describe('playground.show', () => {
  it('marks the line a run failed on until the text changes or another run starts', () => {
    let state = reducePlaygrounds(opened(), { slice: 'playgrounds', type: 'run-started', run });
    state = reducePlaygrounds(state, {
      slice: 'playgrounds',
      type: 'run-ended',
      tab: firstTab,
      result: result({ error: { message: 'x is not defined', line: 2 } }),
    });
    expect(state[firstTab]?.failedLine).toBe(2);
    expect(state[firstTab]?.run).toBeUndefined();
    const sameText = reducePlaygrounds(state, {
      slice: 'playgrounds',
      type: 'edited',
      tab: firstTab,
      text: 'db.orders.find()',
      selection: { from: 0, to: 2 },
    });
    expect(sameText[firstTab]?.failedLine).toBe(2);
    const typed = reducePlaygrounds(state, { slice: 'playgrounds', type: 'edited', tab: firstTab, text: 'db.x' });
    expect(typed[firstTab]?.failedLine).toBeUndefined();
    const again = reducePlaygrounds(state, { slice: 'playgrounds', type: 'run-started', run });
    expect(again[firstTab]?.failedLine).toBeUndefined();
  });

  it('marks no line after a run that was stopped', () => {
    const started = reducePlaygrounds(opened(), { slice: 'playgrounds', type: 'run-started', run });
    const stopped = reducePlaygrounds(started, {
      slice: 'playgrounds',
      type: 'run-ended',
      tab: firstTab,
      result: result({ stopped: true, error: { message: 'Cancelled.', line: 1 } }),
    });
    expect(stopped[firstTab]?.failedLine).toBeUndefined();
    expect(stopped[firstTab]?.result?.stopped).toBe(true);
  });

  it('keeps a playground whose tab closed while it ran until its run ends, then forgets it', () => {
    const started = reducePlaygrounds(opened(), { slice: 'playgrounds', type: 'run-started', run });
    const closed = reducePlaygrounds(started, { slice: 'playgrounds', type: 'closed', tab: firstTab });
    expect(closed[firstTab]?.closed).toBe(true);
    expect(
      reducePlaygrounds(closed, { slice: 'playgrounds', type: 'run-ended', tab: firstTab, result: result() }),
    ).toEqual({});
  });

  it('forgets a playground whose tab closed when it was not running', () => {
    expect(reducePlaygrounds(opened(), { slice: 'playgrounds', type: 'closed', tab: firstTab })).toEqual({});
  });
});

describe('playground.target', () => {
  it('moves a tab whose connection changed to the end of the group of its new connection', () => {
    const other = connectionId('c-other');
    const tabs = [
      playgroundTabOf(firstTab, 'Playground 1'),
      {
        ...playgroundTabOf(tabId('t2'), 'Playground 2'),
        shows: { kind: 'playground', connection: other, title: 'Playground 1' },
      },
      {
        ...playgroundTabOf(tabId('t3'), 'Playground 3'),
        shows: { kind: 'playground', connection: other, title: 'Playground 2' },
      },
    ] as const;
    const state = stateOf({ tabs: [...tabs] });
    const moved = reduce(state, {
      slice: 'tabs',
      type: 'shows-changed',
      tab: firstTab,
      shows: { kind: 'playground', connection: other, title: 'Playground 3' },
    });
    expect(moved.tabs.tabs.map((tab) => tab.id)).toEqual(['t2', 't3', 't1']);
    expect(moved.tabs.tabs[2]?.shows).toEqual({ kind: 'playground', connection: other, title: 'Playground 3' });
  });
});

describe('playground.save', () => {
  it('remembers the default database of a file by its path, and forgets it', () => {
    const kept = withPlaygroundTarget({ other: 1 }, 'C:/w/report.mongodb.js', { database: 'shop' });
    expect(playgroundTargetIn(kept, 'C:/w/report.mongodb.js')).toEqual({ database: 'shop' });
    expect(playgroundTargetIn(kept, 'C:/w/other.mongodb.js')).toBeUndefined();
    expect(withPlaygroundTarget(kept, 'C:/w/report.mongodb.js', undefined)).toEqual({ other: 1 });
  });

  it('offers Save as… in the menu of a playground tab, and not in the menu of another tab', () => {
    const state = stateOf({ tabs: [playgroundTabOf(firstTab, 'Playground 1')] });
    const entries = tabMenu(state, firstTab).flatMap((entry) => (entry.kind === 'item' ? [entry] : []));
    expect(entries.at(-1)).toMatchObject({
      label: 'Save as…',
      element: 'playground.save@tab-menu',
      feature: 'playground.save',
      args: { tab: firstTab, as: true },
    });
  });
});

/** A process of a run that the test drives: what the host posts, and what the process answers. */
interface DrivenProcess extends RunProcess {
  readonly posted: ToRun[];
  killed: boolean;
  readonly answer: (message: FromRun) => void;
  readonly exit: () => void;
}

function drivenProcess(): DrivenProcess {
  let listener: (message: FromRun) => void = () => undefined;
  let exited: () => void = () => undefined;
  const made: DrivenProcess = {
    posted: [],
    killed: false,
    post: (message) => made.posted.push(message),
    onMessage: (each) => {
      listener = each;
    },
    onExit: (each) => {
      exited = each;
    },
    kill: () => {
      made.killed = true;
    },
    answer: (message) => {
      listener(message);
    },
    exit: () => {
      exited();
    },
  };
  return made;
}

function hostWithPlayground(): { host: PlaygroundHost; processes: DrivenProcess[]; h: ReturnType<typeof harness> } {
  const processes: DrivenProcess[] = [];
  const host = new PlaygroundHost(() => {
    const made = drivenProcess();
    processes.push(made);
    return made;
  });
  const h = harness();
  h.ports.state.dispatch({ slice: 'playgrounds', type: 'opened', playground: playgroundOf('while (true) {}') });
  return { host, processes, h };
}

const args: RunArgs = {
  tab: firstTab,
  title: 'Playground 1',
  connection: connectionId('local'),
  database: 'shop',
  firstLine: 1,
  code: '(async () => { while (true) {} })()',
  writes: false,
};

describe('playground.run', () => {
  it('shows a syntax error as the result and starts no process', async () => {
    const { host, processes, h } = hostWithPlayground();
    const { code: _code, ...rest } = args;
    await host.start(h.ports, { ...rest, error: { message: 'SyntaxError: Unexpected token', line: 1 } }).ended;
    expect(processes).toHaveLength(0);
    expect(h.state().playgrounds[firstTab]?.result?.error).toEqual({
      message: 'SyntaxError: Unexpected token',
      line: 1,
    });
    expect(h.log().at(-1)).toContain('SyntaxError: Unexpected token');
  });

  it('runs one playground at a time, and shows what the process answered when it ends', async () => {
    const { host, processes, h } = hostWithPlayground();
    const running = host.start(h.ports, args);
    expect(processes[0]?.posted[0]).toMatchObject({ kind: 'start', database: 'shop', firstLine: 1 });
    expect(h.state().playgrounds[firstTab]?.run?.title).toBe('Playground 1');
    expect(() => host.start(h.ports, args)).toThrow('A playground is already running.');
    processes[0]?.answer({ kind: 'print', line: 'hello' });
    processes[0]?.answer({ kind: 'done', value: { kind: 'text', text: 'done' }, database: 'shop' });
    await running.ended;
    expect(processes[0]?.killed).toBe(true);
    expect(h.state().playgrounds[firstTab]?.result).toMatchObject({
      output: ['hello'],
      value: { kind: 'text', text: 'done' },
    });
    expect(host.running).toBe(false);
  });

  it('says the process may have run out of memory when it ends before the script', async () => {
    const { host, processes, h } = hostWithPlayground();
    const running = host.start(h.ports, args);
    processes[0]?.exit();
    await running.ended;
    expect(h.state().playgrounds[firstTab]?.result?.error?.message).toBe(
      "The playground's process ended before the script did: it may have run out of memory.",
    );
  });
});

describe('playground.stop', () => {
  it('ends the process at once and shows that the run was cancelled', async () => {
    const { host, processes, h } = hostWithPlayground();
    host.start(h.ports, args);
    await host.stop();
    expect(processes[0]?.killed).toBe(true);
    expect(h.state().playgrounds[firstTab]?.result).toMatchObject({
      stopped: true,
      error: { message: 'Cancelled. Operations already sent may still complete on the server.' },
    });
    expect(h.state().runner.work).toEqual([]);
  });

  it('gives Cancel on the status line of a run the element of Stop', () => {
    const work = {
      id: 'w1' as WorkId,
      feature: featureId('playground.run'),
      title: 'Running Playground 1…',
      started: 0,
    };
    expect(statusLine(input({ work: [work] })).work).toMatchObject({
      kind: 'one',
      cancel: 'Cancel',
      cancelElement: 'playground.stop@status-line',
    });
  });
});
