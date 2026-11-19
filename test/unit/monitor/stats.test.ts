import { describe, expect, it } from 'vitest';
import { nextSort } from '../../../src/features/monitor/parts/tiles';
import { rateText, sizeText } from '../../../src/features/monitor/parts/units';
import { emptyHistory, rates } from '../../../src/features/monitor/rates';
import {
  collectionEntries,
  sortCollections,
  type CollectionStats,
} from '../../../src/features/monitor/read-collection-stats';
import type { DatabaseStats } from '../../../src/features/monitor/read-database-stats';
import type { ServerStatus } from '../../../src/features/monitor/read-server-status';
import { isNameColumn, view, type StatsState } from '../../../src/features/monitor/stats';
import { now } from './context';

function server(at: number, query: number): ServerStatus {
  return {
    host: 'db1.example.net:27017',
    version: '8.2.0',
    uptime: 3 * 86_400 + 4 * 3600,
    connections: { current: 12, available: 1204, totalCreated: 88_112 },
    counters: { query, insert: 0, update: 0, delete: 0, getmore: 0, command: 0 },
    network: { bytesIn: 0, bytesOut: 0, requests: 0 },
    memory: { resident: 512, virtual: 4096 },
    at,
  };
}

function database(name: string, dataSize: number): DatabaseStats {
  return {
    name,
    numbers: { collections: 2, views: 0, objects: 10, dataSize, storageSize: 1, indexes: 1, indexSize: 1 },
  };
}

const databases: readonly DatabaseStats[] = [database('a', 100), database('b', 300), database('c', 200)];

function collection(name: string, size: number): CollectionStats {
  return {
    name,
    type: 'collection',
    numbers: { count: 1, size, avgObjSize: 1, storageSize: 1, nindexes: 1, totalIndexSize: 1, capped: false },
  };
}

describe('monitor.stats', () => {
  it('shows Operations with the line since start after the first read, Operations / s after the second', () => {
    const first = server(now, 1000);
    const once = rates(undefined, first, emptyHistory);
    const before = view({ server: { kind: 'read', value: first }, rates: once }).tiles;
    expect(before.find((tile) => tile.label === 'Operations')?.line).toBe('since start · rates after the next refresh');
    const second = server(now + 5000, 1060);
    const twice = rates(first, second, once.history);
    const after = view({ server: { kind: 'read', value: second }, rates: twice }).tiles;
    expect(after.find((tile) => tile.label === 'Operations / s')?.value).toBe('12');
    expect(after.map((tile) => tile.label)).toEqual([
      'Server',
      'Uptime',
      'Connections',
      'Operations / s',
      'Network / s',
      'Memory',
    ]);
    expect(after[1]?.value).toBe('3d 4h');
    expect(after[2]?.line).toBe('1,204 available · 88,112 created');
    expect(after[5]).toMatchObject({ value: '512 MB', line: '4,096 MB virtual' });
  });

  it('writes a rate under 10 with one decimal and from 10 whole', () => {
    expect(rateText(3.14)).toBe('3.1');
    expect(rateText(41.2)).toBe('41');
  });

  it('writes 1,572,864 bytes as 1.5 MB, 12,582,912 as 12 MB and 840 as 840 B', () => {
    expect(sizeText(1_572_864)).toBe('1.5 MB');
    expect(sizeText(12_582_912)).toBe('12 MB');
    expect(sizeText(840)).toBe('840 B');
  });

  it('sorts the databases by Data, the largest first, then the smallest first on a second click', () => {
    const first = nextSort(undefined, 'data', isNameColumn);
    const state: StatsState = { databases: { kind: 'read', value: databases }, databaseSort: first };
    expect(view(state).databases.rows.map((row) => row.name)).toEqual(['b', 'c', 'a']);
    const second = nextSort(first, 'data', isNameColumn);
    expect(view({ ...state, databaseSort: second }).databases.rows.map((row) => row.name)).toEqual(['a', 'c', 'b']);
    expect(nextSort(undefined, 'name', isNameColumn).descending).toBe(false);
  });

  it('shows Collections of shop for the chosen database, the collection with the most data first', () => {
    const stats = sortCollections([collection('users', 10), collection('orders', 2000)]);
    const shown = view({
      databases: { kind: 'read', value: [database('shop', 1)] },
      chosenDatabase: 'shop',
      collections: { kind: 'read', value: stats },
    });
    expect(shown.collections?.title).toBe('Collections of shop');
    expect(shown.collections?.rows.map((row) => row.name)).toEqual(['orders', 'users']);
    expect(shown.databases.rows[0]?.chosen).toBe(true);
  });

  it('lists a view with the type view and empty numbers', () => {
    const shown = view({
      chosenDatabase: 'shop',
      collections: { kind: 'read', value: [{ name: 'recent', type: 'view' }] },
    });
    expect(shown.collections?.rows[0]?.cells).toEqual(['recent', 'view', '', '', '', '', '', '']);
  });

  it('lists a database the user cannot read by name, with the server’s message as tooltip', () => {
    const shown = view({
      databases: {
        kind: 'read',
        value: [{ name: 'secret', failure: { message: 'not authorized on secret' } }, database('shop', 1)],
      },
    });
    expect(shown.databases.rows[0]).toEqual({
      name: 'secret',
      cells: ['secret'],
      tooltip: 'not authorized on secret',
    });
    expect(shown.databases.rows[1]?.cells).toHaveLength(8);
  });

  it('does not list the system. collections', () => {
    const entries = collectionEntries([{ name: 'system.profile' }, { name: 'orders' }]);
    expect(entries.map((entry) => entry.name)).toEqual(['orders']);
  });

  it('gives each part its own error line, and a server without databases the headers alone', () => {
    const shown = view({
      server: { kind: 'failed', failure: { message: 'not authorized on admin' } },
      databases: { kind: 'read', value: [] },
    });
    expect(shown.serverError).toBe('not authorized on admin');
    expect(shown.tiles).toEqual([]);
    expect(shown.databases.rows).toEqual([]);
    expect(shown.databases.columns.map((column) => column.label)).toContain('Index size');
  });
});
