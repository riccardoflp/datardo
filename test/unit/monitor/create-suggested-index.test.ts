import { describe, expect, it } from 'vitest';
import { failureText, plan } from '../../../src/features/monitor/create-suggested-index';
import { contextOn, int, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.create-suggested-index');
const keys = { status: int(1), createdAt: int(-1) };
const reread = { connection: local.id, source: 'profiler', database: 'shop' };
const args = { connection: local.id, namespace: 'shop.orders', keys, view: false, reread };

function withIndexes(indexes: readonly unknown[]): Record<string, unknown> {
  return { ...startedWith(args), indexes };
}

describe('monitor.create-suggested-index', () => {
  it('reads the indexes of the collection first', () => {
    expect(plan(context, startedWith(args))).toEqual({
      kind: 'read',
      need: {
        key: 'indexes',
        read: 'index.list',
        args: { connection: local.id, database: 'shop', collection: 'orders' },
      },
    });
  });

  it('shows the confirmation with the step and the button Create index', () => {
    const shown = planOf(plan(context, withIndexes([{ name: '_id_', key: { _id: int(1) } }])));
    expect(shown.title).toBe('Create the index { status: 1, createdAt: -1 } on shop.orders');
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.getSiblingDB("shop").orders.createIndex({ status: 1, createdAt: -1 })',
    ]);
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        'Create the index { status: 1, createdAt: -1 } on shop.orders?\nBuilding an index reads the whole ' +
        'collection: on a large collection it takes time and loads the server. Every write then also updates the ' +
        'index.',
      button: 'Create index',
    });
    expect(shown.undo).toEqual({
      cannot: 'An index is not a document. Dropping the index in the Indexes section removes it.',
    });
  });

  it('says Created the index status_1_createdAt_-1 on shop.orders. and reads the slow operations again', () => {
    const shown = planOf(plan(context, withIndexes([])));
    expect(shown.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Created the index status_1_createdAt_-1 on shop.orders.' },
      { kind: 'refresh', connection: local.id },
      expect.objectContaining({ kind: 'start', feature: 'monitor.read-slow-queries', args: reread }),
    ]);
  });

  it('refuses when the collection already has the index under the name byStatus', () => {
    expect(plan(context, withIndexes([{ name: 'byStatus', key: keys }]))).toEqual({
      kind: 'refuse',
      code: 'monitor.create-suggested-index/exists',
      message: 'shop.orders already has the index byStatus on { status: 1, createdAt: -1 }.',
    });
  });

  it('offers the creation beside { createdAt: -1, status: 1 }, another index', () => {
    const other = { name: 'byDate', key: { createdAt: int(-1), status: int(1) } };
    expect(plan(context, withIndexes([other])).kind).toBe('run');
  });

  it('refuses on a read-only connection and on a view', () => {
    const readOnly = contextOn('monitor.create-suggested-index', production);
    expect(plan(readOnly, startedWith({ ...args, connection: production.id }))).toEqual({
      kind: 'refuse',
      code: 'monitor.create-suggested-index/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(plan(context, startedWith({ ...args, view: true }))).toMatchObject({
      kind: 'refuse',
      code: 'monitor.create-suggested-index/view',
    });
  });

  it('says Index not created: with the server’s message', () => {
    expect(failureText('index build aborted')).toBe('Index not created: index build aborted');
  });
});
