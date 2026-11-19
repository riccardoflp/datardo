import { describe, expect, it } from 'vitest';
import { request } from '../../../src/features/key/scan';
import { databaseList, plan } from '../../../src/features/key/switch-database';
import type { ReadRequest } from '../../../src/shared/feature';
import { cache, connected, keyContext, onDatabase, planOf, requestWords } from './context';

const databases = { count: 16, keys: { '0': 1204, '3': 7 } };
const context = keyContext('key.switch-database', onDatabase());

describe('key.switch-database', () => {
  it('lists db0 to db15, with db0 · 1,204 keys and db1 · empty, and sends nothing', () => {
    const list = databaseList({ databases }, 0);
    expect(list).toHaveLength(16);
    expect(list.slice(0, 2).map((each) => each.label)).toEqual(['db0 · 1,204 keys', 'db1 · empty']);
    expect(list[0]?.present).toBe(true);
    const asked = plan(context, { args: { databases } });
    expect(asked).toMatchObject({ kind: 'ask', question: { title: 'Switch database' } });
  });

  it('opens a keys tab of db3, whose scan is that of database 3', () => {
    const switched = planOf(plan(context, { args: { databases }, database: '3' }));
    expect(switched.steps).toEqual([
      {
        kind: 'app',
        action: 'tab.open',
        args: { shows: { kind: 'keys', connection: cache.id, database: 3, separator: ':' }, background: false },
        text: 'open the keys tab of db3 on Cache local',
      },
    ]);
    const read = request(keyContext('key.scan', onDatabase(3)), {
      connection: cache.id,
      database: 3,
      pattern: '*',
      type: 'all',
      cursor: '0',
    });
    const requests = (read as Extract<ReadRequest, { kind: 'engine' }>).requests;
    expect(requests.map(requestWords)).toEqual(['SCAN 0 COUNT 500', 'DBSIZE']);
    expect(requests.every((each) => (each.request as { database: number }).database === 3)).toBe(true);
  });

  it('leaves the tab of db0 on database 0: no command is sent to the open tabs', () => {
    const switched = planOf(plan(context, { args: { databases }, database: '3' }));
    expect(switched.steps.every((step) => step.kind === 'app')).toBe(true);
  });

  it('says This server has no db16 for a database it does not have', () => {
    expect(plan(context, { args: { databases }, database: '16' })).toEqual({
      kind: 'refuse',
      code: 'key.switch-database/out-of-range',
      message: 'This server has no db16: it has 16 databases, db0 to db15.',
    });
  });

  it('makes the keys tab of db3 active when it is open', () => {
    const open = { kind: 'keys', connection: cache.id, database: 3, separator: ':' } as const;
    const withTab = keyContext('key.switch-database', onDatabase(), connected(cache, '7.4.1', [open]));
    expect(planOf(plan(withTab, { args: { databases }, database: '3' })).steps).toEqual([
      expect.objectContaining({ action: 'tab.activate', args: { tab: 't1' } }),
    ]);
  });
});
