/**
 * Records the replies `connection.server-info` reads from the throwaway servers into `test/fixtures/replies/`, named
 * after the server version they came from (testing.md). It runs only when `DATARDO_RECORD_REPLIES=1`: the unit tests
 * of the `parse` functions read the recorded files, and the files change only when they are recorded again.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { serverInfoRequests } from '../../../src/features/connection/server-info';
import { connectionId } from '../../../src/shared/ids';
import { redisCommand } from '../../../src/shared/engine-request';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const decoder = new TextDecoder();

async function mongoReplies(uri: string, topology: string): Promise<void> {
  const engines = createEngines();
  const id = connectionId('record');
  await engines.connect(
    id,
    { engine: 'mongodb', connectionString: uri, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(20_000),
  );
  try {
    const [hello, buildInfo] = await Promise.all(
      serverInfoRequests('mongodb', 'overview').map((request) =>
        engines.send({ connection: id, request }, AbortSignal.timeout(10_000)),
      ),
    );
    const version = String((buildInfo as Record<string, string>)['version'])
      .split('.')
      .slice(0, 2)
      .join('.');
    await writeFile(join(folder, `mongodb-${version}-${topology}-hello.json`), `${JSON.stringify(hello, null, 2)}\n`);
    await writeFile(join(folder, `mongodb-${version}-buildInfo.json`), `${JSON.stringify(buildInfo, null, 2)}\n`);
  } finally {
    await engines.disconnectAll();
  }
}

async function redisReplies(url: string): Promise<void> {
  const engines = createEngines();
  const id = connectionId('record');
  await engines.connect(
    id,
    { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(20_000),
  );
  try {
    const sections = ['server', 'replication', 'memory', 'clients'];
    const texts: string[] = [];
    for (const section of sections) {
      const reply = await engines.send(
        { connection: id, request: redisCommand(0, 'INFO', section) },
        AbortSignal.timeout(10_000),
      );
      texts.push(decoder.decode(reply as Uint8Array));
    }
    const version = /redis_version:(\d+\.\d+)/.exec(texts[0] ?? '')?.[1] ?? 'unknown';
    for (const [index, section] of sections.entries()) {
      await writeFile(join(folder, `redis-${version}-info-${section}.txt`), texts[index] ?? '');
    }
  } finally {
    await engines.disconnectAll();
  }
}

describe('the recorded replies of the servers', () => {
  it.runIf(recording)('records hello and buildInfo of MongoDB, and INFO of Redis', async () => {
    const servers = testServers();
    await mkdir(folder, { recursive: true });
    await mongoReplies(servers.mongoStandalone, 'standalone');
    await mongoReplies(servers.mongoReplicaSet, 'replica-set');
    if (servers.redis !== undefined) {
      await redisReplies(servers.redis);
    }
    expect(recording).toBe(true);
  });
});
