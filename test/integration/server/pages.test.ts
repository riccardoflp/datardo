/**
 * The Reads and the Operations of the Server page against the test Redis (testing.md). The server is shared with other
 * tests: no count of clients, keys of other databases or slow log entries is asserted; keys are `m17:` in the
 * databases 8 and 9; `CLIENT KILL` is sent only to a client the test opened, and `SLOWLOG RESET` never (its
 * confirmation is closed, or the private server of servers.test.ts clears it).
 */
import { createClient } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerClient } from '../../../src/features/server/read-clients';
import type { ConfigParameter } from '../../../src/features/server/read-config';
import type { InfoReport } from '../../../src/features/server/read-info';
import { infoField } from '../../../src/features/server/read-info';
import type { MemoryRead } from '../../../src/features/server/read-memory';
import type { SlowLogRead } from '../../../src/features/server/read-slow-log';
import { readsOf } from '../../../src/features/server/show';
import type { PartRead } from '../../../src/features/server/types';
import { testServers } from '../servers';
import { cacheId, databases, liveServer, readOnlyId, resultOf, type LiveServer } from './live';
import { searchAll } from './search';

const url = testServers().redis;
const [filled, empty] = databases;

function valueOf<T>(part: PartRead<T> | undefined): T {
  if (part?.kind !== 'read') {
    throw new Error(`Expected a value, got ${JSON.stringify(part)}`);
  }
  return part.value;
}

describe.skipIf(url === undefined)('the Server page on the test Redis', () => {
  let live: LiveServer;

  beforeAll(async () => {
    live = await liveServer(url ?? '');
    await live.command(filled, 'FLUSHDB');
    await live.command(empty, 'FLUSHDB');
    for (let index = 0; index < 1200; index += 1) {
      await live.command(filled, 'SET', `m17:key:${String(index)}`, 'x'.repeat(index % 50));
    }
    await live.command(filled, 'SET', 'm17:largest', 'y'.repeat(100_000));
    await live.command(
      filled,
      'RPUSH',
      'm17:list',
      ...Array.from({ length: 200 }, (_, index) => `item ${String(index)}`),
    );
  }, 120_000);

  afterAll(async () => {
    await live.command(filled, 'FLUSHDB');
    await live.command(empty, 'FLUSHDB');
    await live.close();
  });

  describe('server.read-info', () => {
    it('INFO gives the version and the keys of db8; INFO replication gives only its section', async () => {
      const info = valueOf(
        resultOf<PartRead<InfoReport>>(await live.start('server.read-info', { connection: cacheId })),
      );
      expect(infoField(info, 'redis_version')).toMatch(/^\d+\.\d+/u);
      expect(info.databases.find((each) => each.database === filled)?.keys).toBe(1202);
      const replication = valueOf(
        resultOf<PartRead<InfoReport>>(
          await live.start('server.read-info', { connection: cacheId, part: 'replication' }),
        ),
      );
      expect(replication.sections.map((section) => section.name)).toEqual(['Replication']);
    });
  });

  describe('server.read-clients', () => {
    it('the row of the connection the page reads with has the marks Datardo and this page', async () => {
      const own = resultOf<string>(await live.start('server.show:client-id', { connection: cacheId }));
      const clients = valueOf(
        resultOf<PartRead<readonly ServerClient[]>>(
          await live.start('server.read-clients', { connection: cacheId, own }),
        ),
      );
      const row = clients.find((client) => client.id === own);
      expect(row).toMatchObject({ own: true, datardo: true });
      expect(row?.name).toMatch(/^datardo/u);
    });
  });

  describe('server.kill-client', () => {
    it('Disconnect sends exactly CLIENT KILL ID of a client the test opened, which is then gone; the Log has it', async () => {
      const victim = createClient({ url: url ?? '', name: 'm17-victim' });
      victim.on('error', () => {
        // The client is disconnected on purpose: its error is expected.
      });
      await victim.connect();
      const id = String(await victim.sendCommand<number>(['CLIENT', 'ID']));
      const result = await live.start('server.kill-client', { client: { id, name: 'm17-victim' } }, 'row-menu');
      expect(result.kind).toBe('done');
      expect(live.confirmed).toContain(`Disconnect client ${id}?`);
      expect(live.sent.filter((each) => each.text.startsWith('CLIENT KILL')).map((each) => each.text)).toEqual([
        `CLIENT KILL ID ${id}`,
      ]);
      const clients = valueOf(
        resultOf<PartRead<readonly ServerClient[]>>(await live.start('server.read-clients', { connection: cacheId })),
      );
      expect(clients.some((client) => client.id === id)).toBe(false);
      expect(live.state().runner.log.some((line) => line.text.includes(`CLIENT KILL ID ${id}`))).toBe(true);
      victim.destroy();
    });

    it('closing the confirmation sends nothing; on Cache read-only nothing is sent and the refusal says why', async () => {
      const victim = createClient({ url: url ?? '', name: 'm17-kept' });
      await victim.connect();
      const id = String(await victim.sendCommand<number>(['CLIENT', 'ID']));
      const before = live.sent.length;
      live.confirmations.push(false);
      expect((await live.start('server.kill-client', { client: { id } })).kind).toBe('cancelled');
      const refused = await live.start('server.kill-client', { client: { id } }, 'row-menu', {
        kind: 'connection',
        connection: readOnlyId,
      });
      expect(refused).toMatchObject({ kind: 'refused', code: 'server.kill-client/read-only' });
      expect(live.sent.slice(before).some((each) => each.text.startsWith('CLIENT KILL'))).toBe(false);
      expect(await victim.ping()).toBe('PONG');
      victim.destroy();
    });
  });

  describe('server.read-slow-log', () => {
    it('reads at most 1,000 entries, SLOWLOG LEN and the threshold', async () => {
      const read = resultOf<SlowLogRead>(
        await live.start('server.read-slow-log', { connection: cacheId, part: 'entries-and-threshold' }),
      );
      const entries = valueOf(read.entries);
      expect(entries.entries.length).toBeLessThanOrEqual(1000);
      expect(typeof entries.length).toBe('number');
      expect(typeof valueOf(read.threshold)?.microseconds).toBe('number');
    });
  });

  describe('server.slow-log-reset', () => {
    it('closing the confirmation sends no SLOWLOG RESET; on Cache read-only the refusal is read-only', async () => {
      const before = live.sent.length;
      live.confirmations.push(false);
      const closed = await live.start('server.slow-log-reset', null, 'toolbar');
      expect(['cancelled', 'refused']).toContain(closed.kind);
      const refused = await live.start('server.slow-log-reset', null, 'toolbar', {
        kind: 'connection',
        connection: readOnlyId,
      });
      expect(refused).toMatchObject({ kind: 'refused', code: 'server.slow-log-reset/read-only' });
      expect(live.sent.slice(before).some((each) => each.text === 'SLOWLOG RESET')).toBe(false);
    });
  });

  describe('server.read-memory', () => {
    it('reads MEMORY STATS, and MEMORY DOCTOR when asked', async () => {
      const read = resultOf<MemoryRead>(await live.start('server.read-memory', { connection: cacheId, doctor: true }));
      expect(valueOf(read.stats).values.some(([name]) => name === 'total.allocated')).toBe(true);
      expect(valueOf(read.doctor).length).toBeGreaterThan(0);
    });
  });

  describe('server.read-config', () => {
    it('reads every parameter, sorted, the secrets marked', async () => {
      const parameters = valueOf(
        resultOf<PartRead<readonly ConfigParameter[]>>(await live.start('server.read-config', { connection: cacheId })),
      );
      const names = parameters.map((each) => each.name);
      expect(names).toEqual(names.toSorted());
      expect(parameters.find((each) => each.name === 'requirepass')?.secret).toBe(true);
      expect(parameters.find((each) => each.name === 'maxmemory')?.secret).toBe(false);
    });
  });

  describe('server.show', () => {
    it('in Configuration an automatic refresh reads nothing, and in Memory it sends MEMORY STATS alone', async () => {
      expect(readsOf('configuration', 'auto', { connection: cacheId, last: {} })).toEqual([]);
      const before = live.sent.length;
      for (const need of readsOf('memory', 'auto', { connection: cacheId, last: {} })) {
        await live.start(need.read, need.args);
      }
      expect(live.sent.slice(before).map((each) => each.text)).toEqual(['MEMORY STATS']);
    });
  });

  describe('server.largest-keys', () => {
    it('SCAN 0 COUNT 500 and its followers, MEMORY USAGE per key, at most 100 TYPE, no KEYS; the largest first', async () => {
      const before = live.sent.length;
      const search = await searchAll(live, filled);
      const sent = live.sent.slice(before).map((each) => each.text);
      expect(sent[0]).toBe('SCAN 0 COUNT 500');
      expect(sent.some((each) => each.startsWith('KEYS'))).toBe(false);
      expect(sent.filter((each) => each.startsWith('MEMORY USAGE'))).toHaveLength(1202);
      expect(sent.filter((each) => each.startsWith('MEMORY USAGE')).every((each) => each.endsWith(' SAMPLES 5'))).toBe(
        true,
      );
      expect(sent.filter((each) => each.startsWith('TYPE'))).toHaveLength(100);
      expect(search.ended).toBe('all');
      expect(search.ranking.keys).toHaveLength(100);
      expect(new TextDecoder().decode(search.ranking.keys[0]?.name)).toBe('m17:largest');
      expect(search.types?.[Buffer.from('m17:list').toString('hex')]).toBe('list');
    });

    it('an empty database sends one SCAN and says it has no keys; on Cache read-only the search runs', async () => {
      const before = live.sent.length;
      const search = await searchAll(live, empty, readOnlyId);
      expect(live.sent.slice(before).map((each) => each.text)).toEqual(['SCAN 0 COUNT 500']);
      expect(search.ended).toBe('all');
      expect(search.returned).toBe(0);
    });
  });
});
