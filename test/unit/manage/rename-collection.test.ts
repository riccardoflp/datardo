import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/manage/rename-collection';
import { collectionTab, listed, manageContext, planOf, questionOf, readOf, started } from './harness';

const context = manageContext('manage.rename-collection');
const collections = listed([
  ['orders', 'collection'],
  ['users', 'collection'],
  ['recent', 'view'],
]);
const onOrders = { database: 'shop', collection: 'orders' };

describe('manage.rename-collection', () => {
  it('reads the collections, then asks the new name, filled with the current one', () => {
    expect(readOf(plan(context, started(onOrders)))).toMatchObject({
      key: 'collections',
      read: 'tree.list-collections',
    });
    const question = questionOf(plan(context, started(onOrders, { collections })));
    expect(question.title).toBe('Rename collection shop.orders');
    expect(question.button).toBe('Rename');
    expect(question.fields[0]).toMatchObject({ key: 'name', label: 'New name', default: 'orders' });
    expect(question.fields[0]?.kind === 'text' ? question.fields[0].rules : []).toContainEqual({
      kind: 'not-one-of',
      values: ['users', 'recent'],
      message: 'A collection with this name already exists',
    });
  });

  it('renames nothing and sends nothing for the same name', () => {
    const same = planOf(plan(context, started(onOrders, { collections, name: ' orders ' })));
    expect(same.steps).toEqual([]);
    expect(same.danger).toEqual({ kind: 'none' });
  });

  it('renames, then moves what Datardo keeps and the open tab to the new name', () => {
    const tabbed = manageContext('manage.rename-collection', [collectionTab(4, 'orders')]);
    const renamed = planOf(plan(tabbed, started(onOrders, { collections, name: 'orders_2024' })));
    expect(renamed.steps.map((step) => step.text)).toEqual([
      'db.orders.renameCollection("orders_2024")',
      'move what Datardo keeps for shop.orders to shop.orders_2024',
    ]);
    expect(renamed.steps[1]).toMatchObject({
      kind: 'app',
      action: 'manage.rename-collection',
      args: { connection: 'c-local', database: 'shop', from: 'orders', to: 'orders_2024', tab: 't4' },
    });
    expect(renamed.steps[0]?.onFailure).toBeUndefined();
    expect(renamed.after[0]).toEqual({ kind: 'refresh', connection: 'c-local' });
  });

  it('does not open a tab that was not open', () => {
    const renamed = planOf(plan(context, started(onOrders, { collections, name: 'orders_2024' })));
    expect(renamed.steps[1]?.kind === 'app' ? renamed.steps[1].args : {}).not.toHaveProperty('tab');
  });

  it('asks again for a name that exists or that manage.name-rules refuses', () => {
    expect(questionOf(plan(context, started(onOrders, { collections, name: 'users' }))).text).toBe(
      'A collection with this name already exists',
    );
    const reserved = questionOf(plan(context, started(onOrders, { collections, name: 'system.x' })));
    expect(reserved.text).toBe('Names starting with "system." are reserved');
    expect(reserved.fields[0]).toMatchObject({ default: 'system.x' });
  });

  it('refuses a view with Views cannot be renamed.', () => {
    const refusal = { kind: 'refuse', code: 'manage.rename-collection/view', message: 'Views cannot be renamed.' };
    expect(plan(context, started({ database: 'shop', collection: 'recent', view: true }))).toEqual(refusal);
    expect(plan(context, started({ database: 'shop', collection: 'recent' }, { collections }))).toEqual(refusal);
  });

  it('is refused on a read-only connection before asking anything', () => {
    expect(plan(context, started({ ...onOrders, connection: 'c-production' }))).toEqual({
      kind: 'refuse',
      code: 'manage.rename-collection/read-only',
      message: 'The connection Production is read-only.',
    });
  });

  it('from Go to, renames the collection of the active tab', () => {
    const goTo = manageContext('manage.rename-collection', [collectionTab(2, 'users')], { kind: 'app' });
    const question = questionOf(plan(goTo, { collections }));
    expect(question.title).toBe('Rename collection shop.users');
  });
});
