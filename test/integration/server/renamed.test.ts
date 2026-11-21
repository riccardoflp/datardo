/**
 * The Server page on a server that refuses `CONFIG` and `CLIENT`, as a managed service does: a private Redis started
 * with `--rename-command CONFIG ""`, `--rename-command CLIENT ""` and `--slowlog-log-slower-than 0`, whose address is
 * `DATARDO_TEST_REDIS_RENAMED_URL` (testing.md). Skipped without it. The server is the test's own: its slow log is
 * cleared, and an ACL user allowed `INFO` alone is made on it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServerClient } from '../../../src/features/server/read-clients';
import type { ConfigParameter } from '../../../src/features/server/read-config';
import type { InfoReport } from '../../../src/features/server/read-info';
import type { MemoryRead } from '../../../src/features/server/read-memory';
import type { SlowLogRead } from '../../../src/features/server/read-slow-log';
import type { PartRead } from '../../../src/features/server/types';
import { cacheId, liveServer, resultOf, type LiveServer } from './live';

const url = process.env['DATARDO_TEST_REDIS_RENAMED_URL'];

function sentenceOf(part: PartRead<unknown> | undefined): string | undefined {
  return part?.kind === 'unavailable' ? part.unavailable.sentence : undefined;
}

async function readAll(live: LiveServer) {
  const connection = cacheId;
  return {
    info: resultOf<PartRead<InfoReport>>(await live.start('server.read-info', { connection })),
    replication: resultOf<PartRead<InfoReport>>(
      await live.start('server.read-info', { connection, part: 'replication' }),
    ),
    clients: resultOf<PartRead<readonly ServerClient[]>>(await live.start('server.read-clients', { connection })),
    slowLog: resultOf<SlowLogRead>(
      await live.start('server.read-slow-log', { connection, part: 'entries-and-threshold' }),
    ),
    memory: resultOf<MemoryRead>(await live.start('server.read-memory', { connection, doctor: true })),
    config: resultOf<PartRead<readonly ConfigParameter[]>>(await live.start('server.read-config', { connection })),
  };
}

describe.skipIf(url === undefined)('the Server page on a server whose CONFIG and CLIENT are renamed', () => {
  let live: LiveServer;

  beforeAll(async () => {
    live = await liveServer(url ?? '');
  });

  afterAll(async () => {
    await live.command(0, 'ACL', 'DELUSER', 'm17-info');
    await live.close();
  });

  describe('server.unavailable', () => {
    it('each section says what could not be read and the rest of the page works', async () => {
      const read = await readAll(live);
      expect(read.info.kind).toBe('read');
      expect(read.replication.kind).toBe('read');
      expect(sentenceOf(read.clients)).toMatch(/^This server does not allow CLIENT LIST: ERR unknown command/u);
      expect(sentenceOf(read.config)).toMatch(/^This server does not allow CONFIG GET: ERR unknown command/u);
      expect(read.slowLog.entries?.kind).toBe('read');
      expect(sentenceOf(read.slowLog.threshold)).toMatch(/^This server does not allow CONFIG GET/u);
      expect(read.memory.stats.kind).toBe('read');
      expect(resultOf(await live.start('server.show:client-id', { connection: cacheId }))).toBeNull();
    });

    it('a user allowed INFO and nothing else sees Overview and Replication whole, and a sentence in the four others', async () => {
      await live.command(
        0,
        'ACL',
        'SETUSER',
        'm17-info',
        'reset',
        'on',
        '>m17-pass',
        '+info',
        '+hello',
        '+ping',
        '+auth',
      );
      const user = await liveServer((url ?? '').replace('redis://', 'redis://m17-info:m17-pass@'));
      try {
        const read = await readAll(user);
        expect(read.info.kind).toBe('read');
        expect(read.replication.kind).toBe('read');
        expect(sentenceOf(read.clients)).toBeDefined();
        expect(sentenceOf(read.slowLog.entries)).toMatch(/^SLOWLOG GET needs a user that may run it: NOPERM/u);
        expect(sentenceOf(read.memory.stats)).toMatch(/^MEMORY STATS needs a user that may run it: NOPERM/u);
        expect(sentenceOf(read.config)).toBeDefined();
      } finally {
        await user.close();
      }
    });
  });

  describe('server.read-slow-log', () => {
    it('a password in the arguments of a logged command is masked before the entry leaves the main process', async () => {
      await live.command(0, 'MIGRATE', '127.0.0.1', '1', 'm17:none', '0', '10', 'AUTH', 's3cret').catch(() => null);
      const read = resultOf<SlowLogRead>(
        await live.start('server.read-slow-log', { connection: cacheId, part: 'entries' }),
      );
      const entries = read.entries?.kind === 'read' ? read.entries.value.entries : [];
      const migrate = entries.find((entry) => entry.command.startsWith('MIGRATE'));
      expect(migrate?.command).toContain('AUTH ***');
      const written = entries.map((entry) => [
        entry.command,
        ...entry.arguments.map((each) => Buffer.from(each).toString()),
      ]);
      expect(JSON.stringify(written)).not.toContain('s3cret');
    });
  });

  describe('server.slow-log-reset', () => {
    it('Clear sends SLOWLOG RESET after its confirmation, and the slow log is then empty but for the reads', async () => {
      await live.command(0, 'PING');
      const result = await live.start('server.slow-log-reset', null, 'toolbar');
      expect(result.kind).toBe('done');
      expect(live.confirmed).toContain('Clear the slow log of Cache?');
      expect(live.sent.some((each) => each.text === 'SLOWLOG RESET')).toBe(true);
      const read = resultOf<SlowLogRead>(
        await live.start('server.read-slow-log', { connection: cacheId, part: 'entries' }),
      );
      const entries = read.entries?.kind === 'read' ? read.entries.value.entries : [];
      expect(entries.every((entry) => entry.command.startsWith('SLOWLOG'))).toBe(true);
      expect(live.state().runner.log.some((line) => line.text.includes('SLOWLOG RESET'))).toBe(true);
    });
  });
});
