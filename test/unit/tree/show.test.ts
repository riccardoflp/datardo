import { describe, expect, it } from 'vitest';
import { nodeOfTab, revealedFor, view } from '../../../src/features/tree/show';
import { freshIsland, type MongoTreeData, type TreeItem } from '../../../src/features/tree/types';
import { connectionId } from '../../../src/shared/ids';
import { inputOf, linesOf, mongoConnection, nodesOf, redisConnection } from './context';

const data: MongoTreeData = {
  databases: { kind: 'loaded', value: [{ name: 'shop' }] },
  contents: {
    shop: { kind: 'loaded', value: { buckets: [], entries: [{ name: 'orders', kind: 'collection', system: false }] } },
  },
  counts: {},
};

function items(options: Parameters<typeof inputOf>[0]): readonly TreeItem[] {
  const shown = view(inputOf(options));
  return shown.kind === 'tree' ? shown.items : [];
}

describe('tree.show', () => {
  it('with no saved connection, shows No connections yet and Add connection', () => {
    const shown = view(inputOf({ connections: [] }));
    expect(shown).toMatchObject({
      kind: 'no-connections',
      line: 'No connections yet',
      add: { label: 'Add connection', element: 'connection.add@tree', feature: 'connection.add' },
    });
  });

  it('shows the three parts in order: Pinned only with pins, Databases, Pages of <name>', () => {
    const lines = linesOf(
      items({ pins: [{ kind: 'collection', database: 'shop', collection: 'orders' }], island: { mongodb: data } }),
    );
    expect(lines.slice(0, 4)).toEqual(['Pinned', 'orders', 'Databases', 'shop']);
    expect(lines.slice(4, 5)).toEqual(['Pages of Local']);
    expect(linesOf(items({ island: { mongodb: data } }))[0]).toBe('Databases');
  });

  it('while not connected, Pinned and Pages of are shown and Databases says <name> is not connected with Connect', () => {
    const lines = items({ state: 'not-connected', pins: [{ kind: 'page', page: 'monitor', title: 'Monitor' }] });
    const line = lines.find((item) => item.kind === 'line');
    expect(
      line?.kind === 'line'
        ? [line.text, line.button?.label, line.button?.kind === 'start' ? line.button.element : '']
        : [],
    ).toEqual(['Local is not connected', 'Connect', 'connection.connect@tree']);
    expect(linesOf(lines)).toContain('Pinned');
    expect(linesOf(lines)).toContain('Pages of Local');
  });

  it('while it connects, Databases shows Connecting…; when it cannot, the reason and Retry', () => {
    expect(linesOf(items({ state: 'connecting' }))[1]).toBe('Connecting…');
    const base = inputOf({ state: 'failed' });
    const live = {
      ...base.state.connections.live,
      'c-local': { state: 'failed', reason: 'connect ECONNREFUSED 127.0.0.1:27017' },
    } as const;
    const shown = view({ ...base, state: { ...base.state, connections: { ...base.state.connections, live } } });
    const line = shown.kind === 'tree' ? shown.items[1] : undefined;
    expect(line?.kind === 'line' ? [line.text, line.tone, line.button?.label] : []).toEqual([
      'connect ECONNREFUSED 127.0.0.1:27017',
      'error',
      'Retry',
    ]);
  });

  it('while reconnecting, the nodes already loaded stay, dimmed', () => {
    const nodes = nodesOf(items({ state: 'reconnecting', island: { mongodb: data } })).filter(
      (node) => node.ref.kind === 'database',
    );
    expect(nodes.map((node) => [node.name, node.dimmed])).toEqual([['shop', true]]);
  });

  it('each part collapses with a click on its heading; the state is the island of the connection', () => {
    const lines = linesOf(items({ island: { mongodb: data, collapsedParts: ['databases'] } }));
    expect(lines.slice(0, 2)).toEqual(['Databases', 'Pages of Local']);
  });

  it('the island has the role tree, and a header with Filter, Refresh and Collapse all', () => {
    const shown = view(inputOf({ island: { mongodb: data } }));
    expect(
      shown.kind === 'tree'
        ? [shown.role, shown.header.filter.label, shown.header.refresh.label, shown.header.collapseAll.label]
        : [],
    ).toEqual(['tree', 'Filter', 'Refresh', 'Collapse all']);
    expect(shown.kind === 'tree' ? shown.header.refresh : undefined).toMatchObject({
      element: 'tree.refresh@tree',
      feature: 'tree.refresh',
    });
  });

  it('the heading Databases of MongoDB shows Create database…, not on a read-only connection', () => {
    const heading = (readOnly: boolean) => {
      const found = items({ connections: [mongoConnection({ readOnly })], island: { mongodb: data } }).find(
        (item) => item.kind === 'heading',
      );
      return found?.kind === 'heading' ? found.buttons.map((button) => button.label) : [];
    };
    expect(heading(false)).toEqual(['Create database…']);
    expect(heading(true)).toEqual([]);
  });

  it('the nodes do not take the connection color: nothing of the view says it', () => {
    const shown = view(
      inputOf({ connections: [mongoConnection({ color: 'red' } as never)], island: { mongodb: data } }),
    );
    expect(JSON.stringify(shown)).not.toContain('red');
  });

  it('a Redis connection shows its databases under Databases and its four pages', () => {
    const lines = linesOf(items({ connections: [redisConnection()], state: 'connecting' }));
    expect(lines).toEqual([
      'Databases',
      'Connecting…',
      'Pages of Cache local',
      'Overview',
      'Server',
      'Console',
      'Pub/Sub',
    ]);
  });

  it('when a tab becomes active, the node of what it shows is selected, and its loaded database expanded', () => {
    const shows = {
      kind: 'collection',
      connection: connectionId('c-local'),
      database: 'shop',
      collection: 'orders',
    } as const;
    const island = revealedFor({ ...freshIsland, mongodb: data }, shows);
    expect([island.selected, island.expanded]).toEqual(['collection:shop.orders', ['database:shop']]);
    const notLoaded = revealedFor(freshIsland, shows);
    expect(notLoaded.expanded).toEqual([]);
  });

  it('a tab of the app selects nothing; a keys tab selects its database or its namespace', () => {
    expect(
      revealedFor({ ...freshIsland, selected: 'database:shop' }, { kind: 'app', page: 'settings' }).selected,
    ).toBeUndefined();
    expect(nodeOfTab({ kind: 'keys', connection: connectionId('c-cache'), database: 2, separator: ':' })).toBe(
      'redis-database:2',
    );
    expect(
      nodeOfTab({ kind: 'keys', connection: connectionId('c-cache'), database: 0, separator: ':', namespace: 'ab:' }),
    ).toBe('namespace:0:61623a');
  });
});
