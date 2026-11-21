import { describe, expect, it } from 'vitest';
import {
  collectionSteps,
  completeCluster,
  mergeSharding,
  parse,
  type ShardingRead,
  type ShardingServer,
} from '../../../src/features/monitor/read-sharding';
import { parse as parseEvents } from '../../../src/features/monitor/read-sharding-events';
import { isWordColumn, unsortedColumns } from '../../../src/features/monitor/parts/sharding-tables';
import { nextSort } from '../../../src/features/monitor/parts/tiles';
import { clockText } from '../../../src/features/monitor/parts/units';
import { view, type ClusterView, type ShardingState } from '../../../src/features/monitor/sharding';
import type { MonitorConnection } from '../../../src/features/monitor/types';
import { connectionId } from '../../../src/shared/ids';
import { failed, now } from './context';
import { actionlog, changelog, clusterReplies, compliant, imbalanced } from './sharding-replies';

const connection: MonitorConnection = { id: connectionId('c-cluster'), name: 'Cluster', readOnly: false, mongos: true };
type ClusterStep = Extract<ShardingRead, { readonly step: 'cluster' }>;

function clusterStep(replace: Readonly<Record<number, unknown>> = {}): ClusterStep {
  const read = parse(clusterReplies(replace), { step: 'cluster', at: now });
  if (read.step !== 'cluster') {
    throw new Error('Expected the step cluster.');
  }
  return read;
}

function fullCluster(): ClusterStep['cluster'] {
  const reads = parse([compliant, imbalanced, compliant], {
    step: 'collections',
    verdicts: ['logs.events', 'shop.orders', 'shop.users'],
  });
  return completeCluster(clusterStep(), reads.step === 'collections' ? reads.collections : []);
}

function state(extra: Partial<ShardingState> = {}): ShardingState {
  return {
    connection,
    server: { kind: 'read', value: { kind: 'mongos' } },
    cluster: fullCluster(),
    readAt: now,
    collectionFilter: '',
    events: parseEvents([changelog, actionlog]),
    eventsText: '',
    eventsScope: 'balancer',
    ...extra,
  };
}

function clusterView(extra: Partial<ShardingState> = {}): ClusterView {
  const shown = view(state(extra));
  if (shown.kind !== 'cluster') {
    throw new Error(`Expected the cluster, got ${shown.kind}.`);
  }
  return shown;
}

describe('monitor.sharding', () => {
  it('shows the six tiles and the three tables through a mongos with 2 shards and 3 sharded collections', () => {
    const shown = clusterView();
    expect(shown.tiles.map((tile) => [tile.label, tile.value, tile.line])).toEqual([
      ['Shards', '2', 'zones: east, north, west'],
      ['Sharded collections', '3', '1 with balancing off · 1 not balanced'],
      ['Chunks', '28', '1 jumbo · chunk size 128 MB'],
      ['Balancer', 'enabled', 'idle · 1,204 rounds · window 23:00–06:00 (config server time) · no secondary throttle'],
      ['Migrations (24 h)', '4 done · 1 failed', '2 balancer rounds with errors'],
      ['Config servers', 'cfg', '3 members · 1 of 2 mongos active · mongos 8.0.4'],
    ]);
    expect(shown.shards.rows).toHaveLength(2);
    expect(shown.shards.asOf).toBe(`as of ${clockText(now)}`);
    expect(shown.collections.rows).toHaveLength(3);
    expect(shown.collections.count).toBe('3 of 3 collections');
    expect(shown.events.rows).toHaveLength(4);
    expect(shown.events.count).toBe('the 4 most recent, newest first · 1 with errors');
    expect(shown.errors).toEqual([]);
  });

  it('writes the shards: replica set or (standalone), state, data with its share, primary of', () => {
    const [first, second] = clusterView().shards.rows;
    expect(first).toMatchObject({
      shard: 'shard01',
      color: 0,
      replicaSet: 'shard01',
      members: 's1a:27018, s1b:27018',
      state: 'active',
      zones: 'east',
      chunks: '13',
      data: '3.0 GB',
      dataTooltip: '75% of the sharded data',
      primaryOf: 'admin2, shop',
    });
    expect(second).toMatchObject({ replicaSet: '(standalone)', color: 1 });
  });

  it('shows the sentence of a standalone server, a replica set, a member of a shard and a config server', () => {
    const sentence = (value: ShardingServer) => view(state({ server: { kind: 'read', value } }));
    expect(sentence({ kind: 'standalone', me: 'db1.example.net:27017' })).toEqual({
      kind: 'sentence',
      sentence: 'db1.example.net:27017 is a standalone server: it is not part of a sharded cluster.',
    });
    expect(sentence({ kind: 'replica-set', me: 'db1.example.net:27017' })).toEqual({
      kind: 'sentence',
      sentence: 'db1.example.net:27017 is a replica set member, not a mongos: it is not part of a sharded cluster.',
    });
    expect(
      sentence({
        kind: 'shard-member',
        me: 'db1.example.net:27017',
        shard: 'shard01',
        configServer: 'cfg/c1:27019,c2:27019',
      }),
    ).toEqual({
      kind: 'sentence',
      sentence:
        'db1.example.net:27017 is a member of the shard shard01 of a sharded cluster (config servers cfg/c1:27019,c2:27019): connect to a mongos to see the whole cluster.',
    });
    expect(sentence({ kind: 'config-server', me: 'c1.example.net:27019' })).toEqual({
      kind: 'sentence',
      sentence:
        'c1.example.net:27019 is a config server of a sharded cluster: connect to a mongos to see the shards, the sharded collections and the balancer.',
    });
  });

  it('shows the collections without a Balance from the balancer and the line of the clusterManager role', () => {
    const refused = failed('not authorized on admin', 13);
    const reads = parse([refused, refused, refused], {
      step: 'collections',
      verdicts: ['logs.events', 'shop.orders', 'shop.users'],
    });
    const cluster = completeCluster(clusterStep(), reads.step === 'collections' ? reads.collections : []);
    const shown = clusterView({ cluster });
    expect(shown.errors).toEqual([
      'Not everything could be read (the cluster’s state needs the clusterMonitor role, the balancer status of each collection clusterManager):',
      'balancer status of the collections (balancerCollectionStatus, clusterManager role): not authorized on admin',
    ]);
    const orders = shown.collections.rows.find((row) => row.namespace === 'shop.orders');
    expect(orders?.balance.word).toBe('uneven');
    expect(shown.collections.rows.find((row) => row.namespace === 'shop.users')?.balance.word).toBe('');
  });

  it('keeps the Balance of the last Refresh on an automatic refresh, which sends no balancerCollectionStatus', () => {
    const automatic = clusterStep();
    expect(collectionSteps(connection.id, automatic, false)).toEqual([]);
    const merged = mergeSharding(fullCluster(), automatic.cluster);
    const shown = clusterView({ cluster: merged });
    expect(shown.collections.rows.find((row) => row.namespace === 'shop.orders')?.balance.word).toBe('uneven chunks');
    expect(shown.collections.rows.find((row) => row.namespace === 'shop.users')?.balance.word).toBe('balanced');
  });

  it('shows Balancing off in the warning color for a collection with balancing disabled', () => {
    const users = clusterView().collections.rows.find((row) => row.namespace === 'shop.users');
    expect(users).toMatchObject({ balancing: 'off', balancingTone: 'warning', unique: 'yes' });
  });

  it('shows a jumbo chunk in Jumbo and makes the Chunks tile say 1 jumbo in the warning color', () => {
    const shown = clusterView();
    expect(shown.collections.rows.find((row) => row.namespace === 'logs.events')).toMatchObject({
      jumbo: '1',
      jumboTone: 'warning',
    });
    expect(shown.tiles[2]).toMatchObject({ tone: 'warning' });
  });

  it('keeps the collections whose namespace or shard key contains customerId', () => {
    const shown = clusterView({ collectionFilter: 'customerId' });
    expect(shown.collections.rows.map((row) => row.namespace)).toEqual(['shop.orders']);
    expect(shown.collections.count).toBe('1 of 3 collections');
    expect(clusterView({ collectionFilter: 'nothing' }).collections.empty).toBe('No collection matches the filter.');
  });

  it('sorts Chunks the largest first and Namespace from A on a first click, and not Distribution', () => {
    expect(nextSort(undefined, 'chunks', isWordColumn)).toEqual({ column: 'chunks', descending: true });
    expect(nextSort(undefined, 'namespace', isWordColumn)).toEqual({ column: 'namespace', descending: false });
    expect(nextSort({ column: 'chunks', descending: true }, 'chunks', isWordColumn).descending).toBe(false);
    expect(unsortedColumns).toEqual(['chunksPerShard', 'distribution']);
  });

  it('lists a shard removed since that still owns chunks in the tooltip of Distribution, without a color', () => {
    const events = clusterView().collections.rows.find((row) => row.namespace === 'logs.events');
    expect(events?.distribution.segments).toEqual([
      { shard: 'shard02', color: 1, share: 0.75 },
      { shard: 'shard03', share: 0.25 },
    ]);
    expect(events?.distribution.tooltip).toBe('shard02: 3 (75%)\nshard03: 1 (25%)');
    const orders = clusterView().collections.rows.find((row) => row.namespace === 'shop.orders');
    expect(orders?.distribution.tooltip).toBe('shard01: 3.0 GB (75%)\nshard02: 1.0 GB (25%)');
    expect(orders?.chunksPerShard).toBe('shard01 12 · shard02 11');
  });

  it('shows a selected collection in the inspector island with its control, its shards and its zones', () => {
    const shown = clusterView({ chosen: { kind: 'collection', key: 'shop.orders' } });
    expect(shown.inspector).toMatchObject({
      kind: 'collection',
      balancing: {
        label: 'Disable balancing…',
        element: 'monitor.set-collection-balancing@inspector',
        args: { connection: connection.id, namespace: 'shop.orders', balancing: 'disable' },
      },
      key: '{ customerId: 1, _id: "hashed" }',
      shards: [
        { shard: 'shard01', chunks: '12', data: '3.0 GB', share: '75%' },
        { shard: 'shard02', chunks: '11', data: '1.0 GB', share: '25%' },
      ],
      zones: [
        { range: '{ customerId: MinKey() } → { customerId: 500 }', shards: 'on shard01' },
        { range: '{ customerId: 500 } → { customerId: MaxKey() }', shards: 'no shard in this zone' },
      ],
    });
    const users = clusterView({ chosen: { kind: 'collection', key: 'shop.users' } }).inspector;
    expect(users).toMatchObject({
      noZones: 'No zone ranges for this collection.',
      balancing: { label: 'Enable balancing…' },
    });
  });

  it('offers Stop balancer… when it is on, Start balancer… when it is off, nothing when its mode is unknown', () => {
    expect(clusterView().shards.balancer).toMatchObject({
      label: 'Stop balancer…',
      element: 'monitor.set-balancer@toolbar',
      args: { connection: connection.id, balancer: 'stop' },
    });
    const off = clusterStep({ 2: { mode: 'off', ok: 1 } }).cluster;
    expect(clusterView({ cluster: off }).shards.balancer?.label).toBe('Start balancer…');
    expect(clusterView({ cluster: off }).tiles[3]?.value).toBe('disabled');
    const unknown = clusterStep({ 2: failed('not authorized'), 3: failed('not authorized') }).cluster;
    const shown = clusterView({ cluster: unknown });
    expect(shown.shards.balancer).toBeUndefined();
    expect(shown.tiles[3]?.value).toBe('?');
    expect(shown.errors[0]).toMatch(/^Not everything could be read/u);
  });

  it('disables the balancer’s buttons on a read-only connection', () => {
    const shown = clusterView({ connection: { ...connection, name: 'Production', readOnly: true } });
    expect(shown.shards.balancer?.disabledBecause).toBe('The connection Production is read-only.');
  });

  it('says what is empty, and keeps the error line of the events', () => {
    const empty = clusterStep({ 1: { shards: [], ok: 1 }, 4: [] }).cluster;
    const shown = clusterView({ cluster: empty, events: { kind: 'read', value: [] } });
    expect(shown.shards.empty).toBe('The cluster has no shards yet (addShard).');
    expect(shown.collections.empty).toBe('No collection is sharded yet.');
    expect(shown.events.empty).toBe('No events recorded.');
    const failedShards = clusterStep({ 1: failed('refused'), 4: failed('refused') }).cluster;
    const broken = clusterView({
      cluster: failedShards,
      eventsText: 'shop',
      events: { kind: 'failed', failure: { message: 'config.changelog: refused' } },
    });
    expect(broken.shards.empty).toBe('The shards could not be read.');
    expect(broken.collections.empty).toBe('The sharded collections could not be read.');
    expect(broken.events.error).toBe('config.changelog: refused');
    const none = clusterView({ eventsText: 'shop', events: { kind: 'read', value: [] } });
    expect(none.events.empty).toBe('No event for this namespace.');
  });

  it('says the data per shard is of the first 100 only after the count', () => {
    const many = Array.from({ length: 140 }, (_, index) => ({ _id: `shop.c${String(index)}`, key: { _id: 1 } }));
    const read = clusterStep({ 4: many, 12: failed('Unrecognized pipeline stage name') });
    const shown = clusterView({ cluster: completeCluster(read, []) });
    expect(shown.collections.count).toBe('140 of 140 collections · data per shard of the first 100 only');
  });

  it('shows a selected event and a selected shard whole in the inspector island', () => {
    const events = parseEvents([changelog, actionlog]);
    const key = events.kind === 'read' ? (events.value[0]?.key ?? '') : '';
    expect(clusterView({ chosen: { kind: 'event', key } }).inspector).toMatchObject({ kind: 'event' });
    expect(clusterView({ chosen: { kind: 'shard', key: 'shard02' } }).inspector).toMatchObject({
      kind: 'shard',
      record: { _id: 'shard02' },
    });
  });
});
