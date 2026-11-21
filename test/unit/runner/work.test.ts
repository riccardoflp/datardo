import { afterEach, describe, expect, it, vi } from 'vitest';
import { linesText, logPlace, open as openLog, timeText, view as logView } from '../../../src/features/runner/log';
import { elapsedText, view as progressView } from '../../../src/features/runner/progress';
import { cancel, cancelLatest, Cancelled } from '../../../src/runner/cancel';
import type { AppAction } from '../../../src/runner/ports';
import { runtimeOf } from '../../../src/runner/runtime';
import { start } from '../../../src/runner/start';
import { showAfterMs } from '../../../src/runner/work';
import { redisCommand } from '../../../src/shared/engine-request';
import { run, type OperationFeature, type ReadFeature } from '../../../src/shared/feature';
import { connectionId, featureId, type WorkId } from '../../../src/shared/ids';
import { reduce, initialState } from '../../../src/shared/state';
import type { LogLine, Work } from '../../../src/shared/state/runner';
import { appTarget } from '../../../src/shared/target';
import { delStep, harness, keyOf, planOf } from './harness';

afterEach(() => {
  vi.useRealTimers();
});

function work(more: Partial<Work> = {}): Work {
  return { id: 'w1' as WorkId, feature: featureId('test.count'), title: 'Count documents', started: 0, ...more };
}

const slowRead: ReadFeature = {
  kind: 'read',
  id: featureId('test.read'),
  request: () => ({
    kind: 'engine',
    requests: [{ connection: connectionId('local'), request: redisCommand(0, 'DBSIZE') }],
  }),
  parse: (replies) => replies[0],
};

function waitingServer(): { server: () => Promise<unknown>; answer: (value: unknown) => void } {
  let answer: (value: unknown) => void = () => undefined;
  return {
    server: () => new Promise((resolve) => (answer = resolve)),
    answer: (value) => {
      answer(value);
    },
  };
}

describe('runner.progress', () => {
  it('makes a read that runs longer than 400 ms an item of work in progress', async () => {
    vi.useFakeTimers();
    const slow = waitingServer();
    const test = harness({ features: [slowRead], server: slow.server });
    const reading = start(test.ports, { feature: slowRead.id, target: appTarget });
    await vi.advanceTimersByTimeAsync(showAfterMs);
    expect(test.state().runner.work).toHaveLength(1);
    slow.answer(12);
    expect(await reading).toEqual({ kind: 'read', result: 12 });
    expect(test.state().runner.work).toEqual([]);
  });

  it('counts the work running for the status line, and says nothing when there is none', () => {
    expect(progressView({ work: [], now: 0 }).status).toBeUndefined();
    expect(progressView({ work: [work()], now: 0 }).status).toBe('1 task running');
    expect(
      progressView({ work: [work(), work({ id: 'w2' as WorkId }), work({ id: 'w3' as WorkId })], now: 0 }).status,
    ).toBe('3 tasks running');
  });

  it('shows the title, the connection, the time since it started and the progress of each item', () => {
    const shown = progressView({
      work: [work({ connection: connectionId('local'), done: 4000, total: 10_000, unit: 'documents' })],
      now: 125_000,
      connectionName: () => 'Local',
    });
    expect(shown.items[0]).toMatchObject({
      title: 'Count documents',
      connection: 'Local',
      elapsed: '2 min 5 s',
      progress: '4,000 of 10,000 documents',
      fraction: 0.4,
      cancellable: true,
    });
    expect(elapsedText(3_780_000)).toBe('1 h 3 min');
  });

  it('shows what a long app step says of itself, in place of the count of its steps', () => {
    const shown = progressView({ work: [work({ detail: '1.2 MB of 4.0 MB', done: 0, total: 1 })], now: 0 });
    expect(shown.items[0]).toMatchObject({ progress: '1.2 MB of 4.0 MB' });
  });

  it('says why an item cannot be cancelled in place of Cancel', () => {
    const [item] = progressView({ work: [work({ cannotCancel: 'Already sent to the server.' })], now: 0 }).items;
    expect(item).toMatchObject({ cancellable: false, cannotCancel: 'Already sent to the server.' });
  });

  it('keeps an item that failed, with its error, until it is dismissed', () => {
    let state = reduce(initialState, { slice: 'runner', type: 'work-started', work: work() });
    state = reduce(state, {
      slice: 'runner',
      type: 'work-changed',
      id: 'w1' as WorkId,
      work: { error: 'The disk is full.' },
    });
    const view = progressView({ work: state.runner.work, now: 0 });
    expect(view.items[0]).toMatchObject({ error: 'The disk is full.', cancellable: false });
    expect(view.status).toBeUndefined();
    state = reduce(state, { slice: 'runner', type: 'work-ended', id: 'w1' as WorkId });
    expect(state.runner.work).toEqual([]);
  });
});

describe('runner.cancel', () => {
  it('stops waiting for a read at once', async () => {
    const test = harness({ features: [slowRead], server: waitingServer().server });
    const reading = start(test.ports, { feature: slowRead.id, target: appTarget });
    await Promise.resolve();
    expect(cancelLatest(test.ports)).toBe(true);
    expect(await reading).toEqual({ kind: 'cancelled' });
  });

  it('stops a plan before its next step, and writes how far it went in the Log', async () => {
    const plan = planOf('Delete three keys', [delStep('a'), delStep('b'), delStep('c')]);
    const feature: OperationFeature = { kind: 'operation', id: featureId('test.delete'), plan: () => run(plan) };
    const test: ReturnType<typeof harness> = harness({
      features: [feature],
      server: (request) => {
        if (keyOf(request) === 'a') {
          cancelLatest(test.ports);
        }
        return Promise.resolve(1);
      },
    });
    const result = await start(test.ports, { feature: feature.id, target: appTarget });
    expect(result).toEqual({ kind: 'cancelled' });
    expect(test.sent.map(keyOf)).toEqual(['a']);
    expect(test.log()).toContain('[test.delete] cancelled: Stopped after step 1 of 3.');
  });

  it('cancels a plan of one app step while it runs; the step says what it left, and the item what it said', async () => {
    vi.useFakeTimers();
    const said: { progress?: (text: string) => void } = {};
    const copy: AppAction = (_args, signal, progress) => {
      said.progress = (text) => progress?.({ detail: text });
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new Cancelled('Download cancelled: nothing was written.'));
        });
      });
    };
    const plan = planOf('Copy a file', [{ kind: 'app', action: 'test.copy', args: null, text: 'copy the file' }]);
    const feature: OperationFeature = { kind: 'operation', id: featureId('test.copy'), plan: () => run(plan) };
    const test = harness({ features: [feature], appActions: { 'test.copy': copy } });
    const running = start(test.ports, { feature: feature.id, target: appTarget });
    await vi.advanceTimersByTimeAsync(showAfterMs);
    said.progress?.('1.2 MB of 4.0 MB');
    expect(test.state().runner.work[0]).toMatchObject({ title: 'Copy a file', detail: '1.2 MB of 4.0 MB' });
    expect(test.state().runner.work[0]?.cannotCancel).toBeUndefined();
    expect(cancelLatest(test.ports)).toBe(true);
    expect(await running).toEqual({ kind: 'cancelled' });
    expect(test.state().runner.notifications.map((each) => each.text)).toContain(
      'Download cancelled: nothing was written.',
    );
  });

  it('cannot cancel a plan of one step that has been sent, and says why', async () => {
    const plan = planOf('Delete a key', [delStep('a')]);
    const feature: OperationFeature = { kind: 'operation', id: featureId('test.delete'), plan: () => run(plan) };
    const slow = waitingServer();
    const test = harness({ features: [feature], server: slow.server });
    const running = start(test.ports, { feature: feature.id, target: appTarget });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const item = runtimeOf(test.ports).work.latest();
    expect(item?.cannotCancel).toBe('Already sent to the server.');
    expect(cancel(test.ports, item?.id as WorkId)).toBe(false);
    slow.answer(1);
    expect(await running).toEqual({ kind: 'done' });
  });
});

function line(id: number, more: Partial<LogLine> = {}): LogLine {
  return {
    id,
    time: 0,
    source: 'document.delete',
    kind: 'step',
    text: `[document.delete] step ${String(id)}`,
    ...more,
  };
}

describe('runner.log', () => {
  const lines = [
    line(1, { connection: 'Local' }),
    line(2, { kind: 'outcome', connection: 'Local' }),
    line(3, { source: 'MCP', kind: 'refusal', text: '[MCP] refused: find/read-only' }),
    line(4, { source: 'key.delete', kind: 'error', connection: 'Cache', text: '[key.delete] failed: OOM' }),
  ];

  it('filters by source, connection, kind and text', () => {
    const shown = (filter: Parameters<typeof logView>[0]['filter']): number[] =>
      logView({ log: lines, filter }).lines.map((item) => item.id);
    expect(shown({ text: '' })).toEqual([1, 2, 3, 4]);
    expect(shown({ text: '', source: 'MCP' })).toEqual([3]);
    expect(shown({ text: '', connection: 'Local' })).toEqual([1, 2]);
    expect(shown({ text: '', kind: 'steps' })).toEqual([1, 2]);
    expect(shown({ text: '', kind: 'refusals' })).toEqual([3]);
    expect(shown({ text: '', kind: 'errors' })).toEqual([4]);
    expect(shown({ text: 'oom' })).toEqual([4]);
    expect(logView({ log: lines, filter: { text: '' } })).toMatchObject({
      sources: ['document.delete', 'MCP', 'key.delete'],
      connections: ['Local', 'Cache'],
      empty: false,
    });
  });

  it('has the time to the millisecond, the connection, the source and the text of each line', () => {
    const time = new Date(2026, 0, 2, 14, 3, 27, 512).getTime();
    expect(timeText(time)).toBe('14:03:27.512');
    expect(linesText([line(1, { time, connection: 'Local' })])).toBe(
      '14:03:27.512\tLocal\tdocument.delete\t[document.delete] step 1',
    );
  });

  it('keeps the last 5,000 lines', () => {
    let state = initialState;
    const entries = Array.from({ length: 5003 }, (_, index) => ({
      time: index,
      source: 'test.feature',
      kind: 'info' as const,
      text: String(index),
    }));
    state = reduce(state, { slice: 'runner', type: 'logged', lines: entries });
    expect(state.runner.log).toHaveLength(5000);
    expect(state.runner.log[0]?.id).toBe(4);
  });

  it('empties the Log with Clear, and goes on numbering the lines', () => {
    let state = reduce(initialState, {
      slice: 'runner',
      type: 'logged',
      lines: [{ time: 0, source: 'a', kind: 'info', text: 'a' }],
    });
    state = reduce(state, { slice: 'runner', type: 'log-cleared' });
    expect(state.runner.log).toEqual([]);
    state = reduce(state, {
      slice: 'runner',
      type: 'logged',
      lines: [{ time: 0, source: 'a', kind: 'info', text: 'b' }],
    });
    expect(state.runner.log[0]?.id).toBe(2);
  });

  it('opens at a line for Show in log, and filtered to a source for the MCP state', async () => {
    const test = harness({ features: [openLog] });
    await start(test.ports, { feature: openLog.id, target: appTarget, args: { line: 42 } });
    expect(test.state().runner.opened).toMatchObject({ page: 'log', at: 'line:42' });
    expect(logPlace('line:42')).toEqual({ line: 42 });
    await start(test.ports, { feature: openLog.id, target: appTarget, args: { source: 'MCP' } });
    expect(test.state().runner.opened).toMatchObject({ page: 'log', at: 'source:MCP', times: 2 });
    expect(logPlace('source:MCP')).toEqual({ source: 'MCP' });
    expect(test.log()).toEqual([]);
  });
});
