import { afterEach, describe, expect, it, vi } from 'vitest';
import { start } from '../../../src/runner/start';
import { showAfterMs } from '../../../src/runner/work';
import { run, type OperationFeature, type Plan } from '../../../src/shared/feature';
import { featureId } from '../../../src/shared/ids';
import { appTarget } from '../../../src/shared/target';
import { delStep, harness, keyOf, planOf, type HarnessOptions } from './harness';

function feature(plan: Plan, id = 'test.delete'): OperationFeature {
  return { kind: 'operation', id: featureId(id), plan: () => run(plan) };
}

function failing(
  keys: readonly string[],
  error: Error = new Error('ERR it failed'),
): NonNullable<HarnessOptions['server']> {
  return (request) => (keys.includes(keyOf(request)) ? Promise.reject(error) : Promise.resolve(1));
}

async function started(
  plan: Plan,
  options: HarnessOptions = {},
): Promise<ReturnType<typeof harness> & { result: unknown }> {
  const test = harness({ features: [feature(plan)], ...options });
  const result = await start(test.ports, { feature: featureId('test.delete'), target: appTarget });
  return { ...test, result };
}

const three = planOf('Delete three keys', [delStep('a'), delStep('b'), delStep('c')]);

afterEach(() => {
  vi.useRealTimers();
});

describe('runner.run', () => {
  it('refuses a plan on a read-only connection, sends nothing, and says why', async () => {
    const test = await started(three, { readOnly: () => true });
    expect(test.result).toEqual({
      kind: 'refused',
      code: 'runner.run/read-only',
      message: 'The connection Local is read-only.',
    });
    expect(test.sent).toEqual([]);
    expect(test.state().runner.notifications.at(-1)).toMatchObject({ level: 'warning' });
  });

  it('runs the guard again before each step that writes', async () => {
    let readOnly = false;
    const test = await started(three, {
      readOnly: () => readOnly,
      server: () => {
        readOnly = true;
        return Promise.resolve(1);
      },
    });
    expect(test.sent.map(keyOf)).toEqual(['a']);
    expect(test.result).toMatchObject({ kind: 'refused', code: 'runner.run/read-only' });
  });

  it('refuses a plan on a connection that is not connected', async () => {
    const test = await started(three, { connected: () => false });
    expect(test.result).toMatchObject({ kind: 'refused', code: 'runner.run/not-connected' });
    expect(test.sent).toEqual([]);
  });

  it('writes each step in the Log before it is sent, and its outcome after', async () => {
    const test = await started(three, { server: () => Promise.resolve(1) });
    expect(test.log()).toEqual([
      '[test.delete] DEL a',
      '[test.delete] 1 changed in 0 ms',
      '[test.delete] DEL b',
      '[test.delete] 1 changed in 0 ms',
      '[test.delete] DEL c',
      '[test.delete] 1 changed in 0 ms',
    ]);
    expect(test.state().runner.log[0]).toMatchObject({ connection: 'Local', source: 'test.delete', kind: 'step' });
  });

  it('stops at a step that fails: the steps before stay done, the steps after are not sent', async () => {
    const test = await started(three, { server: failing(['b']) });
    expect(test.sent.map(keyOf)).toEqual(['a', 'b']);
    expect(test.result).toMatchObject({ kind: 'failed', message: 'Stopped at step 2 of 3. ERR it failed' });
    expect(test.log()).toContain('[test.delete] failed: ERR it failed');
    expect(test.state().runner.notifications.at(-1)).toMatchObject({
      level: 'error',
      text: 'Stopped at step 2 of 3. ERR it failed',
    });
  });

  it('goes on after a step that says so, and says which steps failed', async () => {
    const plan = planOf('Delete three keys', [
      delStep('a'),
      delStep('b', { onFailure: { kind: 'go-on' } }),
      delStep('c'),
    ]);
    const test = await started(plan, { server: failing(['b']) });
    expect(test.sent.map(keyOf)).toEqual(['a', 'b', 'c']);
    expect(test.result).toEqual({ kind: 'done' });
    expect(test.state().runner.notifications.at(-1)).toMatchObject({
      level: 'warning',
      text: 'Delete three keys: this step failed: DEL b.',
    });
  });

  it('runs the steps of instead when a step fails with one of its codes', async () => {
    const error = Object.assign(new Error('NamespaceExists'), { code: 48 });
    const instead = { kind: 'instead' as const, codes: [48], steps: [delStep('b2')] };
    const plan = planOf('Delete', [delStep('a'), delStep('b', { onFailure: instead }), delStep('c')]);
    const test = await started(plan, { server: failing(['b'], error) });
    expect(test.sent.map(keyOf)).toEqual(['a', 'b', 'b2', 'c']);
    expect(test.result).toEqual({ kind: 'done' });
  });

  it('stops when a step fails with a code instead does not name', async () => {
    const instead = { kind: 'instead' as const, codes: [48], steps: [delStep('b2')] };
    const plan = planOf('Delete', [delStep('a'), delStep('b', { onFailure: instead }), delStep('c')]);
    const test = await started(plan, { server: failing(['b'], Object.assign(new Error('other'), { code: 1 })) });
    expect(test.sent.map(keyOf)).toEqual(['a', 'b']);
    expect(test.result).toMatchObject({ kind: 'failed' });
  });

  it('stops only its own group when a step of a group fails', async () => {
    const plan = planOf('Copy two files', [
      delStep('a1', { group: 'first' }),
      delStep('a2', { group: 'first' }),
      delStep('a3', { group: 'first' }),
      delStep('b1', { group: 'second' }),
    ]);
    const test = await started(plan, { server: failing(['a2']) });
    expect(test.sent.map(keyOf)).toEqual(['a1', 'a2', 'b1']);
    expect(test.result).toEqual({ kind: 'done' });
    expect(test.state().runner.notifications.at(-1)).toMatchObject({ level: 'warning' });
  });

  it('shows a plan that runs longer than 400 ms as work in progress, and removes it when it ends', async () => {
    vi.useFakeTimers();
    let finish: (value: unknown) => void = () => undefined;
    const test = harness({
      features: [feature(planOf('Slow', [delStep('a')]))],
      server: () => new Promise((resolve) => (finish = resolve)),
    });
    const running = start(test.ports, { feature: featureId('test.delete'), target: appTarget });
    await vi.advanceTimersByTimeAsync(showAfterMs - 1);
    expect(test.state().runner.work).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(test.state().runner.work).toMatchObject([{ title: 'Slow', connection: 'local' }]);
    finish(1);
    await running;
    expect(test.state().runner.work).toEqual([]);
  });

  it('asks the pages of the connection to read again after a plan', async () => {
    const test = await started(three);
    expect(test.state().runner.refreshed).toMatchObject({ times: 1, connection: 'local' });
  });

  it('runs two plans on the same connection one after the other, in the order they were confirmed', async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const test = harness({
      features: [
        feature(planOf('First', [delStep('first')]), 'test.first'),
        feature(planOf('Second', [delStep('second')]), 'test.second'),
      ],
      server: (request) => {
        order.push(`sent ${keyOf(request)}`);
        return keyOf(request) === 'first'
          ? new Promise(
              (resolve) =>
                (release = () => {
                  resolve(1);
                }),
            )
          : Promise.resolve(1);
      },
    });
    const first = start(test.ports, { feature: featureId('test.first'), target: appTarget });
    const second = start(test.ports, { feature: featureId('test.second'), target: appTarget });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['sent first']);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(['sent first', 'sent second']);
  });
});
