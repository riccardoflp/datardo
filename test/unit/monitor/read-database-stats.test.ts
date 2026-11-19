import { describe, expect, it } from 'vitest';
import { databaseBatches, parse, request, statsAtOnce } from '../../../src/features/monitor/read-database-stats';
import { contextOn, failed, int, local, recorded, requestsOf } from './context';

const context = contextOn('monitor.read-database-stats');
const names = Array.from({ length: 20 }, (_, index) => `db${String(index)}`);

function dbStats(collections: number): unknown {
  return {
    collections: int(collections),
    views: int(0),
    objects: int(10),
    dataSize: int(100),
    storageSize: int(200),
    indexes: int(1),
    indexSize: int(50),
  };
}

describe('monitor.read-database-stats', () => {
  it('lists the databases with nameOnly', () => {
    const [sent] = requestsOf(request(context, { connection: local.id, step: 'list' }));
    expect(sent?.arguments[0]).toEqual({ listDatabases: { $numberInt: '1' }, nameOnly: true });
  });

  it('has at most 8 dbStats in flight at once with 20 databases', () => {
    const batches = databaseBatches(names);
    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 4]);
    expect(statsAtOnce).toBe(8);
    const sent = requestsOf(
      request(context, { connection: local.id, step: 'stats', databases: [...(batches[0] ?? [])] }),
    );
    expect(sent).toHaveLength(8);
    expect(sent[0]).toMatchObject({ database: 'db0', arguments: [{ dbStats: { $numberInt: '1' } }] });
  });

  it('keeps a database whose dbStats is refused with its name and the error; the other 19 have their numbers', () => {
    const replies = names.map((_, index) => (index === 3 ? failed('not authorized on db3') : dbStats(index)));
    const result = parse(replies, { step: 'stats', databases: names });
    const stats = result.step === 'stats' ? result.stats : [];
    expect(stats).toHaveLength(20);
    expect(stats.find((each) => each.name === 'db3')).toEqual({
      name: 'db3',
      failure: { message: 'not authorized on db3' },
    });
    expect(stats.filter((each) => each.numbers !== undefined)).toHaveLength(19);
  });

  it('fails the read when the databases cannot be listed', () => {
    const result = parse([failed('not authorized on admin', 13)], { step: 'list' });
    expect(result).toEqual({
      step: 'list',
      databases: { kind: 'failed', failure: { message: 'not authorized on admin', code: 13 } },
    });
  });

  it('reads the recorded listDatabases and dbStats of shop', () => {
    const list = parse([recorded('list-databases')], { step: 'list' });
    expect(list.step === 'list' && list.databases.kind === 'read' ? list.databases.value : []).toContain('shop');
    const stats = parse([recorded('db-stats')], { step: 'stats', databases: ['shop'] });
    const shop = stats.step === 'stats' ? stats.stats[0] : undefined;
    expect(shop?.numbers).toMatchObject({ collections: 3, views: 1, objects: 41 });
  });
});
