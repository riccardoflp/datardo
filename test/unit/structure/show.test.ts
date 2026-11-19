import { describe, expect, it } from 'vitest';
import { databaseChoices, plan, view, type StructurePageState } from '../../../src/features/structure/show';
import { diffStructure } from '../../../src/features/structure/steps';
import type { StructureComparison } from '../../../src/features/structure/types';
import type { AppStep } from '../../../src/shared/feature';
import {
  collection,
  contextWith,
  database,
  devShop,
  differenceOf,
  index,
  int,
  planOf,
  view as viewOf,
  workedExample,
} from './build';

const connections = [
  { id: 'c-local', name: 'Local', readOnly: false },
  { id: 'c-prod', name: 'Production', readOnly: false },
  { id: 'c-dev', name: 'Dev', readOnly: false },
];

function comparisonOf(differences = workedExample()): StructureComparison {
  const counts = { same: 0, different: 0, 'only-left': 0, 'only-right': 0 };
  for (const difference of differences) {
    counts[difference.kind] += 1;
  }
  return { differences, counts, notes: [] };
}

function pageState(more: Partial<StructurePageState> = {}): StructurePageState {
  return {
    left: devShop,
    right: { connection: 'c-prod', database: 'shop' },
    connections,
    databases: ['admin', 'config', 'local', 'shop', 'shop_staging'],
    comparing: false,
    result: { comparison: comparisonOf(), milliseconds: 800 },
    showAll: false,
    folded: [],
    drops: false,
    swapping: false,
    ...more,
  };
}

describe('structure.show', () => {
  it('opens a tab titled Structure: shop on shop of Dev, with Connection at Dev marked same connection', () => {
    const planned = planOf(plan(contextWith('structure.show'), {}));
    const step = planned.steps[0] as AppStep;
    expect(step.action).toBe('tab.open');
    expect(step.args).toMatchObject({
      shows: { kind: 'page', connection: 'c-dev', page: 'structure', title: 'Structure: shop', database: 'shop' },
    });
    const { result: _result, ...chosenNothing } = pageState({ right: { connection: 'c-dev' } });
    const page = view(chosenNothing);
    expect(page.title).toBe('Structure: shop');
    expect(page.left).toEqual({ label: 'Left · model', database: 'shop', connection: 'Dev' });
    expect(page.right.connection.value).toBe('c-dev');
    expect(page.right.connections[0]).toEqual({ id: 'c-dev', label: 'Dev', notes: ['same connection'] });
    expect(page.chips).toBeUndefined();
  });

  it('lists the database with the left name first, then by name', () => {
    expect(databaseChoices(devShop, 'c-prod', ['zeta', 'admin', 'alpha', 'shop'])).toEqual(['shop', 'alpha', 'zeta']);
  });

  it('does not list shop itself, admin, local and config on the same connection', () => {
    expect(databaseChoices(devShop, 'c-dev', ['admin', 'config', 'local', 'shop', 'shop_staging'])).toEqual([
      'shop_staging',
    ]);
    const page = view(pageState({ right: { connection: 'c-dev' }, databases: ['admin', 'local', 'config', 'shop'] }));
    expect(page.right.databases).toEqual([]);
    expect(page.right.message).toBe('Dev has no other database to compare with.');
  });

  it('titles the tab Structure: shop ↔ shop_staging when the right database has another name', () => {
    expect(view(pageState({ right: { connection: 'c-dev', database: 'shop_staging' } })).title).toBe(
      'Structure: shop ↔ shop_staging',
    );
  });

  it('counts the differences in the chips and the summary', () => {
    const counts = { same: 31, different: 4, 'only-left': 5, 'only-right': 3 };
    const page = view(pageState({ result: { comparison: { differences: [], counts, notes: [] }, milliseconds: 800 } }));
    expect(page.chips?.map((chip) => chip.label)).toEqual(['31 same', '4 different', '5 only left', '3 only right']);
    expect(page.summary).toBe('12 differences · 0.8 s');
  });

  it('says the structures are the same, and that nothing differs', () => {
    const same = database([collection('orders', { indexes: [index('a_1', { a: int(1) })] })]);
    const page = view(pageState({ result: { comparison: diffStructure(same, same), milliseconds: 800 } }));
    expect(page.summary).toBe('The structures are the same · 0.8 s');
    expect(page.empty).toBe('No differences: the collections, options and indexes are the same on both sides.');
    expect(page.chips?.find((chip) => chip.kind === 'different')?.enabled).toBe(false);
  });

  it('hides a collection whose objects are all the same with Only differences, and shows it with All', () => {
    const left = database([collection('a', { indexes: [index('x_1', { x: int(1) })] }), collection('b')]);
    const right = database([collection('a', { indexes: [index('x_1', { x: int(1) })] })]);
    const result = { comparison: diffStructure(left, right), milliseconds: 100 };
    expect(view(pageState({ result })).groups.map((group) => group.collection)).toEqual(['b']);
    const all = view(pageState({ result, showAll: true })).groups;
    expect(all.map((group) => [group.collection, group.count])).toEqual([
      ['a', '· same'],
      ['b', '· 1 difference'],
    ]);
  });

  it('keeps only the rows of the chip pressed, and says when it has none', () => {
    const page = view(pageState({ chip: 'only-right' }));
    expect(page.groups.flatMap((group) => group.rows.map((row) => row.kind))).toEqual(['Only right', 'Only right']);
    expect(page.toolbar.all.on).toBe(false);
    expect(view(pageState({ chip: 'same' })).toolbar.all.on).toBe(true);
    const onlyLeft = { comparison: diffStructure(database([collection('a')]), database([])), milliseconds: 1 };
    expect(view(pageState({ result: onlyLeft, chip: 'same' })).empty).toBe('Nothing of this kind.');
  });

  it('puts Apply… on the head of a collection with several differences a command can apply, else on the row', () => {
    const left = database([
      collection('orders', { indexes: [index('a_1', { a: int(1) }), index('b_1', { b: int(1) })] }),
      collection('users', { indexes: [index('c_1', { c: int(1) })] }),
    ]);
    const right = database([collection('orders', { indexes: [index('z_1', { z: int(1) })] }), collection('users')]);
    const groups = view(pageState({ result: { comparison: diffStructure(left, right), milliseconds: 1 } })).groups;
    const orders = groups.find((group) => group.collection === 'orders');
    expect(orders?.apply).toMatchObject({
      label: 'Apply…',
      hint: 'Apply the 3 differences of orders to the right database',
      enabled: true,
      element: 'structure.apply@table',
    });
    expect(orders?.apply?.chosen).toHaveLength(3);
    const users = groups.find((group) => group.collection === 'users');
    expect(users?.apply).toBeUndefined();
    expect(users?.rows[0]?.apply).toMatchObject({ hint: 'Change the right database (after a confirmation)' });
    expect(orders?.rows.find((row) => row.object === 'index z_1')?.apply?.hint).toBe(
      'Change the right database, dropping something (after a confirmation)',
    );
  });

  it('gives a difference no command can apply no Apply…, and says so in the inspector island', () => {
    const comparison = diffStructure(
      database([collection('orders', { options: { collation: { locale: 'fr' } } })]),
      database([collection('orders')]),
    );
    const options = differenceOf(comparison.differences, 'orders', 'options');
    const page = view(pageState({ result: { comparison, milliseconds: 1 }, selected: options.id }));
    expect(page.groups[0]?.rows[0]?.apply).toBeUndefined();
    expect(page.detail?.apply).toBeUndefined();
    expect(page.detail?.message).toBe('No command can do this: the script says what to do');
    expect(page.detail?.fields).toEqual([
      { field: 'collation', left: '{ locale: "fr" }', right: '—', rightHint: 'Missing on this side' },
    ]);
  });

  it('shows the definitions of index status_1 and its steps on the right', () => {
    const status = differenceOf(workedExample(), 'orders', 'index', 'status_1');
    const detail = view(pageState({ selected: status.id })).detail;
    expect(detail?.left).toBeDefined();
    expect(detail?.right).toBeUndefined();
    expect(detail?.stepsTitle).toBe('Steps on the right');
    expect(detail?.steps).toBe('db.getCollection("orders").createIndex({ status: 1 });\n');
    expect(detail?.copyScript).toEqual({
      label: 'Copy script',
      hint: 'Copy the steps of this difference',
      element: 'structure.copy-script@inspector',
    });
    expect(detail?.apply?.element).toBe('structure.apply@inspector');
  });

  it('compares a read-only right connection, copies its script, and disables every Apply…', () => {
    const readOnly = connections.map((each) => (each.id === 'c-prod' ? { ...each, readOnly: true } : each));
    const page = view(pageState({ connections: readOnly }));
    expect(page.right.readOnly).toEqual({ label: 'read-only', hint: 'The connection Production is read-only.' });
    expect(page.toolbar.copyScript.enabled).toBe(true);
    expect(page.toolbar.openInPlayground.enabled).toBe(true);
    expect(page.toolbar.applyAll).toMatchObject({
      enabled: false,
      hint: 'The connection Production is read-only.',
      element: 'structure.apply@toolbar',
    });
    const rows = page.groups.flatMap((group) => group.rows);
    expect(rows.every((row) => row.apply === undefined || !row.apply.enabled)).toBe(true);
  });

  it('makes Production the model after ⇄: what was only left is only right', () => {
    const left = database([collection('orders'), viewOf('recent', 'orders')]);
    const right = database([collection('orders'), collection('legacy')]);
    const before = diffStructure(left, right);
    const after = diffStructure(right, left);
    expect(differenceOf(before.differences, 'recent', 'view').kind).toBe('only-left');
    expect(differenceOf(after.differences, 'recent', 'view').kind).toBe('only-right');
    expect(differenceOf(after.differences, 'legacy', 'collection').kind).toBe('only-left');
  });

  it('says how far each side has read while comparing, and disables Compare and ⇄', () => {
    const page = view(pageState({ comparing: true, progress: { left: { done: 3, total: 12 } } }));
    expect(page.progress).toBe('Reading the structures… left 3 of 12 collections, right …');
    expect(page.compare.enabled).toBe(false);
    expect(page.swap.enabled).toBe(false);
    expect(page.toolbar.applyAll.enabled).toBe(false);
    expect(view(pageState({ comparing: true, swapping: true })).progress).toBe('Swapping the sides…');
  });

  it('opens nothing on a connection that is not MongoDB, or with no database', () => {
    const context = { ...contextWith('structure.show'), target: { kind: 'app' as const } };
    expect(planOf(plan(context, {})).steps).toEqual([]);
  });
});
