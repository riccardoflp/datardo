import { describe, expect, it } from 'vitest';
import { afterReplies, plan } from '../../../src/features/monitor/set-collection-balancing';
import { cluster, contextOn, int, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.set-collection-balancing', cluster);
const disable = startedWith({ connection: cluster.id, namespace: 'shop.orders', balancing: 'disable' });
const enable = startedWith({ connection: cluster.id, namespace: 'shop.orders', balancing: 'enable' });

describe('monitor.set-collection-balancing', () => {
  it('disables balancing with configureCollectionBalancing, after a confirmation that shows both ways', () => {
    const shown = planOf(plan(context, disable));
    expect(shown.title).toBe('Disable balancing for shop.orders');
    const [step] = shown.steps;
    expect(step?.text).toBe('db.adminCommand({ configureCollectionBalancing: "shop.orders", enableBalancing: false })');
    expect(step?.onFailure).toMatchObject({ kind: 'instead', codes: [40415, 59] });
    const instead = step?.onFailure?.kind === 'instead' ? step.onFailure.steps : [];
    expect(instead[0]).toMatchObject({
      kind: 'engine',
      writes: true,
      request: {
        database: 'config',
        collection: 'collections',
        method: 'updateOne',
        arguments: [{ _id: 'shop.orders' }, { $set: { noBalance: true } }],
      },
    });
    expect(shown.danger.kind).toBe('confirm');
    const text = shown.danger.kind === 'confirm' ? shown.danger.text : '';
    expect(text.split('\n').slice(0, 2)).toEqual([
      'Disable balancing for shop.orders?',
      'The balancer no longer moves the chunks of this collection (a migration in progress is completed): its data can become uneven across the shards.',
    ]);
    expect(text).toContain('configureCollectionBalancing');
    expect(text).toContain('noBalance');
    expect(shown.danger).toMatchObject({ button: 'Disable balancing' });
  });

  it('says balancing is disabled by configureCollectionBalancing, and reads the cluster again', () => {
    const after = afterReplies(context, disable, [{ ok: int(1) }]);
    expect(after).toEqual({
      kind: 'after',
      after: [
        {
          kind: 'notify',
          level: 'success',
          text: 'Balancing disabled for shop.orders (configureCollectionBalancing).',
        },
        {
          kind: 'start',
          feature: 'monitor.read-sharding',
          target: { kind: 'connection', connection: cluster.id },
          args: { connection: cluster.id, step: 'cluster', full: true },
        },
      ],
    });
  });

  it('says the other way when the server answered 40415 and config.collections was updated', () => {
    const after = afterReplies(context, disable, [{ acknowledged: true, matchedCount: int(1), modifiedCount: int(1) }]);
    expect(after.kind === 'after' ? after.after[0] : undefined).toMatchObject({
      text: 'Balancing disabled for shop.orders (config.collections (noBalance)).',
    });
  });

  it('refuses when the second step matches no document: not a sharded collection', () => {
    expect(afterReplies(context, disable, [{ matchedCount: int(0), modifiedCount: int(0) }])).toEqual({
      kind: 'refuse',
      code: 'monitor.set-collection-balancing/not-sharded',
      message: 'shop.orders is not a sharded collection.',
    });
  });

  it('sends enableBalancing: true, or sets noBalance: false, to enable', () => {
    const shown = planOf(plan(context, enable));
    const [step] = shown.steps;
    expect(step?.text).toBe('db.adminCommand({ configureCollectionBalancing: "shop.orders", enableBalancing: true })');
    const instead = step?.onFailure?.kind === 'instead' ? step.onFailure.steps : [];
    expect(instead[0]).toMatchObject({
      request: { arguments: [{ _id: 'shop.orders' }, { $set: { noBalance: false } }] },
    });
    expect(shown.danger).toMatchObject({ button: 'Enable balancing' });
  });

  it('runs the other way only for the codes 40415 and 59: another error stops the plan', () => {
    const [step] = planOf(plan(context, disable)).steps;
    const codes = step?.onFailure?.kind === 'instead' ? step.onFailure.codes : [];
    expect(codes).not.toContain(13);
  });

  it('refuses on a read-only connection: monitor.set-collection-balancing/read-only', () => {
    const outcome = plan(
      contextOn('monitor.set-collection-balancing', production),
      startedWith({ connection: production.id, namespace: 'shop.orders', balancing: 'disable' }),
    );
    expect(outcome).toEqual({
      kind: 'refuse',
      code: 'monitor.set-collection-balancing/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('refuses not through a mongos: monitor.set-collection-balancing/unsupported', () => {
    const outcome = plan(
      contextOn('monitor.set-collection-balancing', local),
      startedWith({ connection: local.id, namespace: 'shop.orders', balancing: 'disable' }),
    );
    expect(outcome).toMatchObject({ kind: 'refuse', code: 'monitor.set-collection-balancing/unsupported' });
  });
});
