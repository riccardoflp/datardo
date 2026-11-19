import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/index/drop';
import { contextOn, engineSteps, notices, planOf, refusalOf, started } from './harness';

describe('index.drop', () => {
  it('asks Drop index status_1 on orders? and drops it', () => {
    const shown = planOf(plan(contextOn(false, 'index.drop'), started({ index: 'status_1' })));
    expect(shown.title).toBe('Drop index status_1 on orders?');
    expect(engineSteps(shown)[0]?.request).toMatchObject({
      collection: 'orders',
      method: 'dropIndex',
      arguments: ['status_1'],
    });
    expect(notices(shown)).toEqual(['Dropped the index status_1 of shop.orders.']);
  });

  it('asks to type the exact name status_1', () => {
    const shown = planOf(plan(contextOn(false, 'index.drop'), started({ index: 'status_1' })));
    expect(shown.danger).toEqual({
      kind: 'destructive',
      text: 'Queries that use it will fall back to other indexes or a collection scan. Hiding the index first lets you check the impact without losing it.',
      button: 'Drop',
      name: 'status_1',
    });
  });

  it('shows the step db.orders.dropIndex("status_1") and says it cannot be undone', () => {
    const shown = planOf(plan(contextOn(false, 'index.drop'), started({ index: 'status_1' })));
    expect(shown.steps[0]?.text).toBe('db.orders.dropIndex("status_1")');
    expect(shown.undo).toEqual({ cannot: "An index is not a document: this can't be undone from the undo history." });
    const advised = planOf(
      plan(
        contextOn(false, 'index.drop'),
        started({ index: 'status_1', advice: 'No query used it since 12 days ago.' }),
      ),
    );
    expect(advised.danger.kind === 'destructive' ? advised.danger.text : '').toMatch(
      /^No query used it since 12 days ago\.\n/u,
    );
  });

  it('refuses the _id index', () => {
    expect(refusalOf(plan(contextOn(false, 'index.drop'), started({ index: '_id_' })))).toEqual({
      code: 'index.drop/id-index',
      text: "The _id index can't be changed.",
    });
  });

  it('is refused on a read-only connection', () => {
    expect(refusalOf(plan(contextOn(true, 'index.drop'), started({ index: 'status_1' })))).toEqual({
      code: 'index.drop/read-only',
      text: 'The connection Production is read-only.',
    });
    expect(refusalOf(plan(contextOn(false, 'index.drop'), started({ index: 'status_1', view: true }))).text).toBe(
      'Views are read-only.',
    );
  });
});
