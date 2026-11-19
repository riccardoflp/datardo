import { describe, expect, it } from 'vitest';
import { canOpen, plan } from '../../../src/features/monitor/open-slow-query';
import { contextOn, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.open-slow-query');
const query = { filter: { status: 'paid' }, sort: { createdAt: -1 }, projection: { total: 1 } };

function openWith(kind: string, parts: unknown, explain = false): ReturnType<typeof plan> {
  return plan(
    context,
    startedWith({ connection: local.id, namespace: 'shop.orders', kind, query: parts as never, explain }),
  );
}

describe('monitor.open-slow-query', () => {
  it('opens a find of shop.orders with its filter, sort and projection', () => {
    const shown = planOf(openWith('find', query));
    expect(shown.title).toBe('Open shop.orders');
    expect(shown.steps).toEqual([
      expect.objectContaining({
        kind: 'app',
        text: 'open shop.orders with the filter { status: "paid" }',
        action: 'monitor.open-query',
        args: {
          connection: local.id,
          database: 'shop',
          collection: 'orders',
          filter: { status: 'paid' },
          sort: { createdAt: -1 },
          projection: { total: 1 },
          explain: false,
        },
      }),
    ]);
    expect(shown.danger).toEqual({ kind: 'none' });
  });

  it('leaves the projection out of a count', () => {
    const shown = planOf(openWith('count', query));
    expect(shown.steps[0]).toMatchObject({ args: { filter: { status: 'paid' } } });
    expect(JSON.stringify(shown.steps[0])).not.toContain('projection');
  });

  it('opens an aggregate with its pipeline', () => {
    const pipeline = [{ $match: { status: 'paid' } }, { $limit: 10 }];
    const shown = planOf(openWith('aggregate', { pipeline }));
    expect(shown.steps[0]).toMatchObject({ text: 'open shop.orders with the pipeline', args: { pipeline } });
  });

  it('opens the same with Explain', () => {
    expect(planOf(openWith('find', query, true)).steps[0]).toMatchObject({ args: { explain: true } });
  });

  it('opens an update as its filter, also on a read-only connection', () => {
    const update = { filter: { _id: 7 }, update: { $set: { status: 'paid' } } };
    const shown = planOf(
      plan(
        contextOn('monitor.open-slow-query', production),
        startedWith({ connection: production.id, namespace: 'shop.orders', kind: 'update', query: update }),
      ),
    );
    expect(shown.steps[0]).toMatchObject({ args: { filter: { _id: 7 } } });
    expect(JSON.stringify(shown.steps[0])).not.toContain('$set');
  });

  it('does not open shop.$cmd.aggregate nor an insert', () => {
    expect(canOpen('aggregate', 'shop.$cmd.aggregate')).toBe(false);
    expect(canOpen('insert', 'shop.orders')).toBe(false);
    expect(openWith('insert', {})).toEqual({
      kind: 'refuse',
      code: 'monitor.open-slow-query/unsupported',
      message: 'This operation cannot be opened in its collection.',
    });
  });
});
