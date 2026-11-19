import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/monitor/set-balancer';
import { cluster, contextOn, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.set-balancer', cluster);

describe('monitor.set-balancer', () => {
  it('stops the balancer: the confirmation shows balancerStop and the button Stop balancer', () => {
    const shown = planOf(plan(context, startedWith({ connection: cluster.id, balancer: 'stop' })));
    expect(shown.title).toBe('Stop the balancer');
    expect(shown.steps.map((step) => step.text)).toEqual(['db.adminCommand({ balancerStop: 1 })']);
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        'Stop the balancer?\nNo more chunks are moved between the shards until it is started again: the data can ' +
        'become uneven and ranges can stay on shards outside their zone. A migration in progress is completed first ' +
        '(balancerStop waits for it).',
      button: 'Stop balancer',
    });
  });

  it('says the balancer is stopped and reads the cluster again, in full', () => {
    const shown = planOf(plan(context, startedWith({ connection: cluster.id, balancer: 'stop' })));
    expect(shown.after).toEqual([
      { kind: 'notify', level: 'success', text: 'The balancer is stopped.' },
      {
        kind: 'start',
        feature: 'monitor.read-sharding',
        target: { kind: 'connection', connection: cluster.id },
        args: { connection: cluster.id, step: 'cluster', full: true },
      },
    ]);
    expect(shown.undo).toMatchObject({ cannot: expect.any(String) as unknown });
  });

  it('starts the balancer with balancerStart, and says it is started', () => {
    const shown = planOf(plan(context, startedWith({ connection: cluster.id, balancer: 'start' })));
    expect(shown.steps.map((step) => step.text)).toEqual(['db.adminCommand({ balancerStart: 1 })']);
    expect(shown.danger).toMatchObject({ button: 'Start balancer' });
    expect(shown.after[0]).toMatchObject({ text: 'The balancer is started.' });
  });

  it('refuses on a read-only connection: monitor.set-balancer/read-only', () => {
    expect(plan(contextOn('monitor.set-balancer', production), startedWith({ connection: production.id }))).toEqual({
      kind: 'refuse',
      code: 'monitor.set-balancer/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('refuses not through a mongos: monitor.set-balancer/unsupported', () => {
    expect(plan(contextOn('monitor.set-balancer', local), startedWith({ connection: local.id }))).toMatchObject({
      kind: 'refuse',
      code: 'monitor.set-balancer/unsupported',
    });
  });
});
