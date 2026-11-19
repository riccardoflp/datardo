import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/drop-database';
import { collectionTab, listed, manageContext, planOf, readOf, started, tabOf } from './harness';

const tabs = [
  collectionTab(1, 'orders'),
  collectionTab(2, 'recent', true),
  tabOf(3, {
    kind: 'page',
    connection: 'c-local' as never,
    page: 'gridfs',
    title: 'fs',
    database: 'shop',
    of: ['fs'],
  }),
  tabOf(4, { kind: 'page', connection: 'c-local' as never, page: 'watch', title: 'Watch', database: 'shop' }),
  tabOf(5, { kind: 'document', connection: 'c-local' as never, database: 'shop', collection: 'orders', id: '7' }),
  tabOf(6, { kind: 'collection', connection: 'c-local' as never, database: 'other', collection: 'orders' }),
];
const context = manageContext('manage.drop-database', tabs);
const collections = listed([
  ['orders', 'collection'],
  ['users', 'collection'],
  ['recent', 'view'],
  ['system.views', 'collection'],
]);

describe('manage.drop-database', () => {
  it('asks to type the exact name of the database', () => {
    const dropped = planOf(plan(context, started({ database: 'shop' }, { collections })));
    expect(dropped.title).toBe('Drop database shop');
    expect(dropped.danger).toMatchObject({ kind: 'destructive', button: 'Drop', name: 'shop' });
    expect(dropped.steps.map((step) => step.text)).toEqual(['db.getSiblingDB("shop").dropDatabase()']);
  });

  it('counts the collections and views without system.*', () => {
    expect(readOf(plan(context, started({ database: 'shop' })))).toEqual({
      key: 'collections',
      read: 'tree.list-collections',
      args: { connection: 'c-local', database: 'shop' },
    });
    const dropped = planOf(plan(context, started({ database: 'shop' }, { collections })));
    expect(dropped.danger).toMatchObject({
      text: 'Deletes 3 collections with all their documents. This cannot be undone.',
    });
  });

  it('says 1 collection for a database with one collection, and leaves the number out when it could not be read', () => {
    const one = planOf(
      plan(context, started({ database: 'shop' }, { collections: listed([['orders', 'collection']]) })),
    );
    expect(one.danger).toMatchObject({
      text: 'Deletes 1 collection with all their documents. This cannot be undone.',
    });
    const failed = planOf(
      plan(context, started({ database: 'shop' }, { collections: { kind: 'error', message: 'x' } })),
    );
    expect(failed.danger).toMatchObject({ text: 'This cannot be undone.' });
  });

  it('closes every collection tab and GridFS tab of the database, and nothing else', () => {
    const dropped = planOf(plan(context, started({ database: 'shop' }, { collections })));
    const closed = dropped.after.flatMap((after) => (after.kind === 'start' ? [after.args] : []));
    expect(closed).toEqual([{ tab: 't1' }, { tab: 't2' }, { tab: 't3' }]);
    expect(dropped.after[0]).toEqual({ kind: 'refresh', connection: 'c-local' });
    expect(dropped.publishes).toBe(false);
  });

  it('is refused on a read-only connection', () => {
    expect(plan(context, started({ connection: 'c-production', database: 'shop' }))).toEqual({
      kind: 'refuse',
      code: 'manage.drop-database/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('from Go to, drops the database of the active tab', () => {
    const goTo = manageContext('manage.drop-database', tabs, { kind: 'app' });
    expect(readOf(plan(goTo, {})).args).toEqual({ connection: 'c-local', database: 'shop' });
  });
});
