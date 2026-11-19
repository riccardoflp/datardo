import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/drop-collection';
import { collectionTab, listed, manageContext, planOf, readOf, started, tabOf } from './harness';

const tabs = [
  collectionTab(1, 'orders'),
  tabOf(2, {
    kind: 'document',
    connection: 'c-local' as never,
    database: 'shop',
    collection: 'orders',
    id: '7',
  }),
  collectionTab(3, 'users'),
];
const context = manageContext('manage.drop-collection', tabs);
const onOrders = { database: 'shop', collection: 'orders', view: false };
const counted = { count: { orders: 1 }, indexes: { indexes: [{ name: '_id_' }], totals: {} } };

describe('manage.drop-collection', () => {
  it('asks to type the exact name of the collection, with the button Drop', () => {
    const dropped = planOf(plan(context, started(onOrders, counted)));
    expect(dropped.title).toBe('Drop collection shop.orders');
    expect(dropped.danger).toEqual({
      kind: 'destructive',
      text: 'Deletes 1 document and 1 index. This cannot be undone.',
      button: 'Drop',
      name: 'orders',
    });
  });

  it('reads the number of documents and the indexes first', () => {
    expect(readOf(plan(context, started(onOrders)))).toEqual({
      key: 'count',
      read: 'tree.count',
      args: { connection: 'c-local', database: 'shop', collections: ['orders'] },
    });
    expect(readOf(plan(context, started(onOrders, { count: { orders: 1 } })))).toEqual({
      key: 'indexes',
      read: 'index.list',
      args: { connection: 'c-local', database: 'shop', collection: 'orders', definitionsOnly: true },
    });
  });

  it('shows the numbers with separators, and leaves out one that could not be read', () => {
    const many = { count: { orders: 1234 }, indexes: { indexes: [{}, {}], totals: {} } };
    expect(planOf(plan(context, started(onOrders, many))).danger).toMatchObject({
      text: 'Deletes 1,234 documents and 2 indexes. This cannot be undone.',
    });
    const noCount = { count: {}, indexes: { indexes: [{}, {}], totals: {} } };
    expect(planOf(plan(context, started(onOrders, noCount))).danger).toMatchObject({
      text: 'Deletes 2 indexes. This cannot be undone.',
    });
    const neither = { count: {}, indexes: { kind: 'error', message: 'x' } };
    expect(planOf(plan(context, started(onOrders, neither))).danger).toMatchObject({
      text: 'This cannot be undone.',
    });
  });

  it('shows the step db.orders.drop(), as the Log records it', () => {
    const dropped = planOf(plan(context, started(onOrders, counted)));
    expect(dropped.steps.map((step) => step.text)).toEqual(['db.orders.drop()']);
    expect(dropped.steps[0]).toMatchObject({ kind: 'engine', writes: true });
    expect(dropped.publishes).toBe(false);
    expect(dropped.undo).toHaveProperty('cannot');
  });

  it('closes the tab of the collection only, and reads the tree again', () => {
    const dropped = planOf(plan(context, started(onOrders, counted)));
    expect(dropped.after).toEqual([
      { kind: 'refresh', connection: 'c-local' },
      { kind: 'start', feature: 'tab.close', target: { kind: 'app' }, args: { tab: 't1' } },
      { kind: 'notify', level: 'success', text: 'Dropped shop.orders.' },
    ]);
  });

  it('drops a view with one button, without typing, saying that it cannot be undone', () => {
    const dropped = planOf(plan(context, started({ database: 'shop', collection: 'recent', view: true })));
    expect(dropped.title).toBe('Drop view shop.recent?');
    expect(dropped.danger).toEqual({
      kind: 'confirm',
      text: 'The documents of its source collection are not affected.\nThis cannot be undone.',
      button: 'Drop',
    });
    expect(dropped.steps[0]?.text).toBe('db.recent.drop()');
  });

  it('reads manage.read-options when nothing says whether it is a view', () => {
    const answers = started({ database: 'shop', collection: 'recent' });
    expect(readOf(plan(context, answers))).toEqual({
      key: 'options',
      read: 'manage.read-options',
      args: { connection: 'c-local', database: 'shop', collection: 'recent' },
    });
    const options = { kind: 'found', type: 'view', options: { viewOn: 'orders', pipeline: [] } };
    expect(planOf(plan(context, { ...answers, options })).danger.kind).toBe('confirm');
  });

  it('takes the kind from the list it was picked from', () => {
    const goTo = {
      ...context,
      target: { kind: 'app' as const },
      state: { ...context.state, tabs: { ...context.state.tabs, active: undefined } },
    };
    const current = { ...goTo, state: { ...goTo.state, nav: { ...goTo.state.nav, current: 'c-local' as never } } };
    const answers = {
      databases: [{ name: 'shop' }],
      database: 'shop',
      collections: listed([['recent', 'view']]),
      collection: 'recent',
    };
    expect(planOf(plan(current, answers)).danger.kind).toBe('confirm');
  });

  it('is refused on a read-only connection without reading the counts', () => {
    expect(plan(context, started({ ...onOrders, connection: 'c-production' }))).toEqual({
      kind: 'refuse',
      code: 'manage.drop-collection/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
