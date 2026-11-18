import { describe, expect, it } from 'vitest';
import { ask, noDanger, refuse, run, type OperationFeature, type RunnableFeature } from '../../../src/shared/feature';
import { featureId, type ConnectionId, type FeatureId } from '../../../src/shared/ids';
import { initialState, reduce, type AppEvent, type AppState } from '../../../src/shared/state';
import { appTarget } from '../../../src/shared/target';
import { start } from '../../../src/runner/start';
import type { AppAction, RunnerPorts } from '../../../src/runner/ports';
import { redisCommand } from '../../../src/shared/engine-request';

interface Harness {
  readonly ports: RunnerPorts;
  readonly sent: unknown[];
  readonly actions: unknown[];
  readonly state: () => AppState;
}

function harness(features: RunnableFeature[], answers: Record<string, unknown> | undefined, readOnly = false): Harness {
  let state = initialState;
  const sent: unknown[] = [];
  const actions: unknown[] = [];
  const save: AppAction = (args) => {
    actions.push(args);
    return Promise.resolve();
  };
  const ports: RunnerPorts = {
    features: new Map<FeatureId, RunnableFeature>(features.map((feature) => [feature.id, feature])),
    engines: {
      send: (request) => {
        sent.push(request);
        return Promise.resolve('OK');
      },
    },
    appActions: new Map([['test.save', save]]),
    files: () => Promise.resolve(),
    dialogs: { ask: () => Promise.resolve(answers), confirm: () => Promise.resolve(answers !== undefined) },
    state: {
      get: () => state,
      dispatch: (event: AppEvent) => {
        state = reduce(state, event);
      },
    },
    platform: 'windows',
    isReadOnly: () => readOnly,
    connectionName: () => 'Local',
    now: () => 1000,
  };
  return { ports, sent, actions, state: () => state };
}

const rename: OperationFeature = {
  kind: 'operation',
  id: featureId('test.rename'),
  plan: (_context, answers) => {
    const name = answers['name'];
    if (typeof name !== 'string') {
      return ask({ title: 'Rename', button: 'Rename', fields: [{ kind: 'text', key: 'name', label: 'Name' }] });
    }
    if (name === 'bad') {
      return refuse('test.rename/bad', 'That name is bad.');
    }
    return run({
      title: 'Rename',
      steps: [{ kind: 'app', action: 'test.save', args: { name }, text: `save the name ${name}` }],
      danger: noDanger,
      undo: { cannot: 'Nothing to undo.' },
      publishes: false,
      after: [],
    });
  },
};

const deleteKey: OperationFeature = {
  kind: 'operation',
  id: featureId('test.delete-key'),
  plan: () =>
    run({
      title: 'Delete key',
      steps: [
        {
          kind: 'engine',
          connection: 'local' as ConnectionId,
          request: redisCommand(0, 'DEL', 'orders:42'),
          writes: true,
          text: 'DEL orders:42',
        },
      ],
      danger: { kind: 'confirm', text: 'Delete the key orders:42?', button: 'Delete' },
      undo: { cannot: 'Nothing is kept.' },
      publishes: false,
      after: [],
    }),
};

describe('the core of the runner', () => {
  it('asks, then runs the plan the answer gives, and writes the step in the Log', async () => {
    const test = harness([rename], { name: 'orders' });
    const result = await start(test.ports, { feature: rename.id, target: appTarget });
    expect(result).toEqual({ kind: 'done' });
    expect(test.actions).toEqual([{ name: 'orders' }]);
    expect(test.state().runner.log.map((line) => line.text)).toEqual([
      '[test.rename] save the name orders',
      '[test.rename] done in 0 ms',
    ]);
  });

  it('ends with nothing run when the question is cancelled', async () => {
    const test = harness([rename], undefined);
    expect(await start(test.ports, { feature: rename.id, target: appTarget })).toEqual({ kind: 'cancelled' });
    expect(test.actions).toEqual([]);
    expect(test.state().runner.log).toEqual([]);
  });

  it('gives a refusal its code', async () => {
    const test = harness([rename], { name: 'bad' });
    const result = await start(test.ports, { feature: rename.id, target: appTarget });
    expect(result).toEqual({ kind: 'refused', code: 'test.rename/bad', message: 'That name is bad.' });
  });

  it('refuses a write on a read-only connection and sends nothing', async () => {
    const test = harness([deleteKey], {}, true);
    const result = await start(test.ports, { feature: deleteKey.id, target: appTarget });
    expect(result).toMatchObject({ kind: 'refused', code: 'runner.run/read-only' });
    expect(test.sent).toEqual([]);
  });

  it('sends nothing when the confirmation is cancelled', async () => {
    const test = harness([deleteKey], undefined);
    expect(await start(test.ports, { feature: deleteKey.id, target: appTarget })).toEqual({ kind: 'cancelled' });
    expect(test.sent).toEqual([]);
  });
});
