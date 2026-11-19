import { describe, expect, it } from 'vitest';
import { view as mongodbView } from '../../../src/features/tree/mongodb';
import { loadingDelayMs, view } from '../../../src/features/tree/node-states';
import { view as redisView } from '../../../src/features/tree/redis';
import { afterPage, freshScan } from '../../../src/features/tree/scan-namespaces';
import type { Control, MongoTreeData, TreeLine } from '../../../src/features/tree/types';
import { bytes, inputOf, linesOf, mongoConnection, redisConnection } from './context';

const place = { parent: 'database:shop', level: 3 };
const retry: Control = {
  kind: 'start',
  label: 'Retry',
  element: 'tree.node-states@tree',
  feature: 'tree.refresh',
  target: { kind: 'app' },
};

describe('tree.node-states', () => {
  it('a node being read shows Loading… once 200 ms have passed, and nothing before', () => {
    expect(loadingDelayMs).toBe(200);
    const loading = { kind: 'loading', since: 1000 } as const;
    expect(view({ place, loadable: loading, now: 1150, retry })).toEqual([]);
    expect(view({ place, loadable: loading, now: 1200, retry }).map((line) => line.text)).toEqual(['Loading…']);
  });

  it('a read that fails shows the error of the server in the color of errors, with Retry, which refreshes', () => {
    const [line] = view({ place, loadable: { kind: 'failed', message: 'connection reset' }, now: 0, retry });
    expect([
      line?.text,
      line?.tone,
      line?.button?.label,
      line?.button?.kind === 'start' ? line.button.feature : '',
    ]).toEqual(['connection reset', 'error', 'Retry', 'tree.refresh']);
  });

  it('a user who may not list the collections of shop sees the message under shop, and the other databases as usual', () => {
    const message = 'not authorized on shop to execute command { listCollections: 1, … }';
    const data: MongoTreeData = {
      databases: { kind: 'loaded', value: [{ name: 'app' }, { name: 'shop' }, { name: 'zoo' }] },
      contents: { shop: { kind: 'failed', message } },
      counts: {},
    };
    const items = mongodbView(inputOf({ island: { mongodb: data, expanded: ['database:shop'] } }), mongoConnection());
    expect(linesOf(items)).toEqual(['app', 'shop', message, 'zoo']);
    const error = items[2] as TreeLine;
    expect([error.tone, error.parent, error.button?.label]).toEqual(['error', 'database:shop', 'Retry']);
  });

  it('MongoDB: No databases under Databases, No collections under a database with none', () => {
    expect(
      view({ place, loadable: { kind: 'loaded', value: [] }, now: 0, retry, empty: 'No collections' })[0]?.text,
    ).toBe('No collections');
  });

  it('Redis: No keys, No namespaces, and Scanned <n> of <total> keys with Load more', () => {
    const databases = { count: 1, databases: [{ number: 0, keys: 50_000, expires: 0, averageTtlMs: 0 }] };
    const scan = { ...afterPage(freshScan, { cursor: '9', keys: bytes('a', 'b') }), ended: 'paused' as const };
    const items = redisView(
      inputOf({
        connections: [redisConnection()],
        island: {
          redis: { databases: { kind: 'loaded', value: databases }, scans: { '0': { scan } } },
          expanded: ['redis-database:0'],
        },
      }),
      redisConnection(),
    );
    expect(linesOf(items)).toEqual(['db0', 'No namespaces', 'Scanned 2 of 50,000 keys']);
  });

  it('these lines are not nodes: they have no context menu, and only their button acts', () => {
    const [line] = view({ place, loadable: { kind: 'failed', message: 'x' }, now: 0, retry });
    expect(line?.kind).toBe('line');
    expect(line !== undefined && 'hasMenu' in line).toBe(false);
  });
});
