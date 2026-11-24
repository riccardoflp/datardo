import { describe, expect, it } from 'vitest';
import { contentsOf } from '../../../src/features/tree/list-collections';
import { noTypeAhead, view as keyboardView } from '../../../src/features/tree/keyboard';
import {
  selectedNodes,
  selectionAfter,
  view as selectView,
  withShownSelection,
} from '../../../src/features/tree/select';
import { menuOfItem, revealedFor, view as showView } from '../../../src/features/tree/show';
import type { MongoTreeData, TreeInput, TreeIsland, TreeItem } from '../../../src/features/tree/types';
import { inputOf, mongoConnection, redisConnection } from './context';

const names = (list: readonly string[]) => list.map((name) => ({ name, type: 'collection' }));

const data: MongoTreeData = {
  databases: { kind: 'loaded', value: [{ name: 'archive' }, { name: 'crm' }, { name: 'shop' }] },
  contents: {
    archive: { kind: 'loaded', value: contentsOf(names(['old'])) },
    crm: { kind: 'loaded', value: contentsOf(names(['people'])) },
    shop: { kind: 'loaded', value: contentsOf(names(['logs', 'orders', 'users'])) },
  },
  counts: {},
};

const expanded = ['database:crm', 'database:shop'];

function inputWith(island: Partial<TreeIsland> = {}, connection = mongoConnection()): TreeInput {
  return inputOf({ connections: [connection], island: { mongodb: data, expanded, ...island } });
}

function itemsOf(input: TreeInput): readonly TreeItem[] {
  const shown = showView(input);
  return shown.kind === 'tree' ? shown.items : [];
}

function selectedNames(island: TreeIsland): readonly string[] {
  return selectedNodes(island, itemsOf(inputWith(island))).map((node) => node.name);
}

const orders = 'collection:shop.orders';
const users = 'collection:shop.users';

describe('tree.select', () => {
  it('Ctrl+click on orders with users selected selects both; Ctrl+click on users again leaves orders alone', () => {
    const input = inputWith({ selected: users });
    const both = selectionAfter(input.island, itemsOf(input), { kind: 'toggle', item: orders });
    expect(selectedNames(both)).toEqual(['orders', 'users']);
    const one = selectionAfter(both, itemsOf(input), { kind: 'toggle', item: users });
    expect(selectedNames(one)).toEqual(['orders']);
  });

  it('Shift+click on orders with archive selected selects every node shown from archive to orders', () => {
    const input = inputWith({ selected: 'database:archive' });
    const range = selectionAfter(input.island, itemsOf(input), { kind: 'range', item: orders });
    expect(selectedNames(range)).toEqual(['archive', 'crm', 'people', 'shop', 'logs', 'orders']);
    expect(range.selected).toBe('database:archive');
  });

  it('a click on orders with several nodes selected selects orders alone', () => {
    const input = inputWith({ selected: users, selection: [orders, users] });
    expect(selectedNames(selectionAfter(input.island, itemsOf(input), { kind: 'only', item: orders }))).toEqual([
      'orders',
    ]);
  });

  it('Ctrl+click on a heading or a node of a Redis connection does what a click does', () => {
    const input = inputWith({ selected: users });
    const heading = selectionAfter(input.island, itemsOf(input), { kind: 'toggle', item: 'heading:databases' });
    expect(heading.selected).toBe('heading:databases');
    expect(heading.selection).toBeUndefined();
    const redis = redisConnection();
    const redisInput = inputOf({ connections: [redis], island: { selected: 'redis-database:0' } });
    const after = selectionAfter(redisInput.island, itemsOf(redisInput), { kind: 'toggle', item: 'redis-database:1' });
    expect(after.selection).toBeUndefined();
    expect(after.selected).toBe('redis-database:1');
  });

  it('says the tree can have several nodes selected on MongoDB, and each selected node says it is', () => {
    const input = inputWith({ selected: users, selection: [orders, users] });
    const items = itemsOf(input);
    expect(selectView(input, items, 'mongodb').multiselectable).toBe(true);
    expect(selectView(input, items, 'redis').multiselectable).toBe(false);
    const selected = items.filter((item) => item.kind === 'node' && item.selected).map((item) => item.id);
    expect(selected).toEqual([orders, users]);
  });

  it('a node that stops being shown leaves the selection', () => {
    const input = inputWith({ selected: users, selection: ['collection:crm.people', users] });
    const collapsed = inputWith({ ...input.island, expanded: ['database:shop'] });
    expect(withShownSelection(collapsed.island, itemsOf(collapsed)).selection).toEqual([users]);
    expect(withShownSelection(input.island, itemsOf(input))).toBe(input.island);
  });

  it('a right click on one of 3 selected nodes, none excluded, offers Exclude from searches alone, on the three', () => {
    const input = inputWith({ selected: orders, selection: ['collection:shop.logs', orders, users] });
    const items = itemsOf(input);
    const on = items.find((item) => item.id === users);
    const entries = on === undefined ? [] : menuOfItem(input, on, items);
    expect(entries.map((entry) => (entry.kind === 'item' ? entry.control.label : '—'))).toEqual([
      'Exclude from searches',
    ]);
    const [first] = entries;
    const args = first?.kind === 'item' && first.control.kind === 'start' ? first.control.args : undefined;
    expect(args).toMatchObject({
      action: 'exclude',
      nodes: [
        { database: 'shop', collection: 'logs' },
        { database: 'shop', collection: 'orders' },
        { database: 'shop', collection: 'users' },
      ],
    });
  });

  it('a right click on a node outside the selection opens its whole menu', () => {
    const input = inputWith({ selected: orders, selection: [orders, users] });
    const items = itemsOf(input);
    const crm = items.find((item) => item.id === 'database:crm');
    const entries = crm === undefined ? [] : menuOfItem(input, crm, items);
    expect(entries.length).toBeGreaterThan(5);
  });
});

describe('tree.keyboard', () => {
  it('after a click on orders, Shift+Down twice selects orders and the two collections after it; Escape leaves the last alone', () => {
    const shown = {
      ...data,
      contents: {
        ...data.contents,
        shop: { kind: 'loaded', value: contentsOf(names(['logs', 'orders', 'returns', 'users'])) },
      },
    } as const;
    let island: TreeIsland = { ...inputWith().island, mongodb: shown, selected: orders };
    let focus = orders;
    for (let press = 0; press < 2; press += 1) {
      const items = itemsOf(inputWith(island));
      const { effect } = keyboardView({ items, focus, key: 'Shift+Down', typed: noTypeAhead, now: 0 });
      if (effect.kind !== 'select') {
        throw new Error(`Expected a selection, not ${effect.kind}`);
      }
      island = selectionAfter(island, items, { kind: 'range', item: effect.item, from: effect.from });
      focus = effect.item;
    }
    const items = itemsOf(inputWith(island));
    expect(selectedNodes(island, items).map((node) => node.name)).toEqual(['orders', 'returns', 'users']);
    const { effect } = keyboardView({ items, focus, key: 'Escape', typed: noTypeAhead, now: 0 });
    expect(effect).toEqual({ kind: 'escape', item: users });
    const after = selectionAfter(island, items, { kind: 'escape', item: users });
    expect(selectedNodes(after, items).map((node) => node.name)).toEqual(['users']);
  });

  it('Shift+Down stops at the last node of Databases, and moves as Down on a heading', () => {
    const input = inputWith({ selected: users });
    const items = itemsOf(input);
    expect(keyboardView({ items, focus: users, key: 'Shift+Down', typed: noTypeAhead, now: 0 }).effect).toEqual({
      kind: 'select',
      item: users,
      from: users,
    });
    expect(
      keyboardView({ items, focus: 'heading:databases', key: 'Shift+Down', typed: noTypeAhead, now: 0 }).effect,
    ).toEqual({ kind: 'focus', item: 'database:archive' });
  });
});

describe('tree.show', () => {
  it('selects the node of a tab that becomes active alone', () => {
    const island = inputWith({ selected: orders, selection: [orders, users] }).island;
    const revealed = revealedFor(island, {
      kind: 'collection',
      connection: mongoConnection().id,
      database: 'crm',
      collection: 'people',
    });
    expect(revealed.selection).toBeUndefined();
    expect(revealed.selected).toBe('collection:crm.people');
  });
});
