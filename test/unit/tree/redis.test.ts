import { describe, expect, it } from 'vitest';
import { firstDatabase, mostNamespacesShown, view } from '../../../src/features/tree/redis';
import { afterPage, freshScan } from '../../../src/features/tree/scan-namespaces';
import type { RedisDatabase, RedisTreeData, ScanState, TreeIsland } from '../../../src/features/tree/types';
import { bytes, inputOf, linesOf, nodesOf, redisConnection } from './context';

const cache = redisConnection();

function databases(keys: Readonly<Record<number, number>>): readonly RedisDatabase[] {
  return Array.from({ length: 16 }, (_, number) => ({
    number,
    keys: keys[number] ?? 0,
    expires: number === 0 ? 310 : 0,
    averageTtlMs: 0,
  }));
}

function scanned(names: readonly string[], ended: 'whole' | 'paused' = 'whole'): ScanState {
  return {
    scan: { ...afterPage(freshScan, { cursor: ended === 'whole' ? '0' : '17', keys: bytes(...names) }), ended },
  };
}

function data(
  scans: Readonly<Record<string, ScanState>> = {},
  keys: Readonly<Record<number, number>> = { 0: 1204, 2: 5 },
): RedisTreeData {
  return { databases: { kind: 'loaded', value: { count: 16, databases: databases(keys) } }, scans };
}

function input(island: Partial<TreeIsland>, settings: Readonly<Record<string, string>> = {}) {
  return inputOf({ connections: [cache], island, settings });
}

describe('tree.redis', () => {
  it('lists the databases with keys, db0 and the first one in the order of their numbers; the others under one node', () => {
    const lines = linesOf(view(input({ redis: data({}, { 2: 5 }) }), redisConnection({ address: 'redis://cache/7' })));
    expect(lines).toEqual(['db0', 'db2', 'db7', '13 empty databases']);
    expect(firstDatabase(redisConnection({ address: 'redis://cache:6380/7' }))).toBe(7);
  });

  it('the node of the empty databases is collapsed, and lists them once expanded', () => {
    const lines = linesOf(view(input({ redis: data(), expanded: ['empty-databases'] }), cache));
    expect(lines.slice(0, 4)).toEqual(['db0', 'db2', '14 empty databases', 'db1']);
    expect(nodesOf(view(input({ redis: data() }), cache)).at(-1)?.expanded).toBe(false);
  });

  it('shows the number of keys of a database after its name, and its keys and expiries on hover', () => {
    const db0 = nodesOf(view(input({ redis: data() }), cache))[0];
    expect([db0?.after, db0?.hover]).toEqual(['1,204', 'db0: 1,204 keys, 310 with an expiry']);
  });

  it('a click on the name of a database opens its keys tab and scans nothing', () => {
    const db0 = nodesOf(view(input({ redis: data() }), cache))[0];
    expect(db0?.click).toMatchObject({
      element: 'key.show@tree',
      feature: 'tab.open',
      args: { shows: { kind: 'keys', connection: 'c-cache', database: 0, separator: ':' } },
    });
    expect(db0?.expanded).toBe(false);
  });

  it('expanding db0 shows its namespaces sorted by name ignoring case, each with its own under it', () => {
    const scans = { '0': scanned(['Users:1', 'users:2', 'b:x:1', 'b:x:2', 'apps:1', 'apps:2', 'loner:1', 'counter']) };
    const items = view(input({ redis: data(scans), expanded: ['redis-database:0'] }), cache);
    expect(linesOf(items).slice(0, 4)).toEqual(['db0', 'apps', 'b', 'db2']);
    const b = nodesOf(items).find((node) => node.name === 'b');
    expect([b?.expandable, b?.expanded, b?.after, b?.hover]).toEqual([true, false, '2', 'b:*']);
  });

  it('when the scan stopped before the end: Scanned 10,000 of 1,204,000 keys with Load more, and counts with +', () => {
    const names = Array.from({ length: 10_000 }, (_, index) => `orders:${String(index)}`);
    const items = view(
      input({ redis: data({ '0': scanned(names, 'paused') }, { 0: 1_204_000 }), expanded: ['redis-database:0'] }),
      cache,
    );
    expect(nodesOf(items).find((node) => node.name === 'orders')?.after).toBe('10K+');
    const scannedLine = items.find((item) => item.kind === 'line');
    expect(scannedLine?.kind === 'line' ? [scannedLine.text, scannedLine.button?.label] : []).toEqual([
      'Scanned 10,000 of 1,204,000 keys',
      'Load more',
    ]);
    expect(scannedLine?.kind === 'line' ? scannedLine.button : undefined).toMatchObject({
      element: 'tree.scan-namespaces@tree',
      feature: 'tree.scan-namespaces',
      args: { connection: 'c-cache', database: 0, cursor: '17' },
    });
  });

  it('clicking the name orders under db0 opens the keys tab of the pattern orders:* in database 0', () => {
    const items = view(
      input({ redis: data({ '0': scanned(['orders:1', 'orders:2']) }), expanded: ['redis-database:0'] }),
      cache,
    );
    const orders = nodesOf(items).find((node) => node.name === 'orders');
    expect(orders?.click).toMatchObject({
      element: 'key.show@tree',
      args: { shows: { kind: 'keys', database: 0, namespace: 'orders:', separator: ':' } },
    });
    expect(orders?.ref).toMatchObject({ pattern: 'orders:*' });
  });

  it('a node with more than 200 namespaces shows the first 200 and <n> more namespaces, which opens the keys tab', () => {
    const names = Array.from({ length: 250 }, (_, index) => [
      `n${String(index).padStart(3, '0')}:a`,
      `n${String(index).padStart(3, '0')}:b`,
    ]).flat();
    const items = view(input({ redis: data({ '0': scanned(names) }), expanded: ['redis-database:0'] }), cache);
    expect(nodesOf(items).filter((node) => node.ref.kind === 'namespace')).toHaveLength(mostNamespacesShown);
    const more = items.find((item) => item.kind === 'line' && item.text === '50 more namespaces');
    expect(more?.kind === 'line' ? more.button : undefined).toMatchObject({
      element: 'key.show@tree',
      args: { shows: { kind: 'keys', database: 0 } },
    });
  });

  it('with the separator /, img/1 and img/2 give img, and a:b is under none, from the keys already scanned', () => {
    const scans = { '0': scanned(['img/1', 'img/2', 'a:b', 'a:c']) };
    const slash = view(
      input({ redis: data(scans), expanded: ['redis-database:0'] }, { 'datardo.key.separator': '/' }),
      cache,
    );
    expect(linesOf(slash).slice(0, 2)).toEqual(['db0', 'img']);
    const colon = view(input({ redis: data(scans), expanded: ['redis-database:0'] }), cache);
    expect(linesOf(colon).slice(0, 2)).toEqual(['db0', 'a']);
  });

  it('a database with no key shows No keys; one whose keys form no namespace shows No namespaces', () => {
    const empty = view(input({ redis: data({ '0': scanned([]) }), expanded: ['redis-database:0'] }), cache);
    expect(linesOf(empty).slice(0, 2)).toEqual(['db0', 'No keys']);
    const loose = view(input({ redis: data({ '0': scanned(['a', 'b:1']) }), expanded: ['redis-database:0'] }), cache);
    expect(linesOf(loose).slice(0, 2)).toEqual(['db0', 'No namespaces']);
  });

  it('while it scans, the database shows Loading… once 200 ms have passed', () => {
    const scanning: ScanState = { scan: freshScan, scanning: { since: 9_900 } };
    expect(
      linesOf(view(input({ redis: data({ '0': scanning }), expanded: ['redis-database:0'] }), cache)).slice(0, 2),
    ).toEqual(['db0', 'db2']);
    const later: ScanState = { scan: freshScan, scanning: { since: 9_000 } };
    expect(
      linesOf(view(input({ redis: data({ '0': later }), expanded: ['redis-database:0'] }), cache)).slice(0, 2),
    ).toEqual(['db0', 'Loading…']);
  });
});
