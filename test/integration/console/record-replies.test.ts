/**
 * Records the replies the Reads of the console parse (`console.command-flags`, `console.command-docs`) from the test
 * Redis into `test/fixtures/replies/`, named after the server version they came from (testing.md), and makes
 * Datardo's built-in list of commands, `src/features/console/redis-7.2-commands.json`, from the same server: its
 * `COMMAND DOCS` read by `console.command-docs`, reduced to the commands, subcommands and arguments whose `since` is
 * 7.2 or older, with the flags of `COMMAND INFO`. It runs only when `DATARDO_RECORD_REPLIES=1`.
 *
 * Replies are written as JSON: text as a string, bytes that are not text as `{ "$hex": … }`, a map as
 * `{ "$map": [[key, value], …] }`, an error as `{ "$error": … }` (`test/unit/console/replies.ts` reads them back).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEngines } from '../../../src/engines';
import { docsForVersion, parse as parseDocs, pairsOf } from '../../../src/features/console/command-docs';
import type { CommandDoc } from '../../../src/features/console/types';
import type { RedisReply } from '../../../src/shared/engine-request';
import { redisCommand } from '../../../src/shared/engine-request';
import { connectionId, type ConnectionId } from '../../../src/shared/ids';
import { testServers } from '../servers';

const recording = process.env['DATARDO_RECORD_REPLIES'] === '1';
const folder = join(import.meta.dirname, '..', '..', 'fixtures', 'replies');
const builtinFile = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'src',
  'features',
  'console',
  'redis-7.2-commands.json',
);
const strict = new TextDecoder('utf-8', { fatal: true });

type Engines = ReturnType<typeof createEngines>;

function asJson(reply: RedisReply): unknown {
  if (reply instanceof Uint8Array) {
    try {
      return strict.decode(reply);
    } catch {
      return { $hex: Buffer.from(reply).toString('hex') };
    }
  }
  if (Array.isArray(reply)) {
    return (reply as readonly RedisReply[]).map(asJson);
  }
  if (reply !== null && typeof reply === 'object' && 'kind' in reply) {
    return reply.kind === 'map'
      ? { $map: reply.entries.map(([key, each]) => [asJson(key), asJson(each)]) }
      : { $error: reply.message };
  }
  return reply;
}

async function send(engines: Engines, id: ConnectionId, ...words: string[]): Promise<RedisReply> {
  return (await engines.send(
    { connection: id, request: redisCommand(0, ...words) },
    AbortSignal.timeout(10_000),
  )) as RedisReply;
}

async function connected(engines: Engines, id: ConnectionId, url: string): Promise<void> {
  await engines.connect(
    id,
    { engine: 'redis', connectionString: url, connectTimeoutMs: 10_000 },
    AbortSignal.timeout(20_000),
  );
}

async function writeJson(name: string, value: unknown): Promise<void> {
  await writeFile(join(folder, name), `${JSON.stringify(value, null, 2)}\n`);
}

/** The flags of every command and subcommand, from `COMMAND INFO` with no name. */
function flagsByName(info: RedisReply): ReadonlyMap<string, readonly string[]> {
  const flags = new Map<string, readonly string[]>();
  const decoder = new TextDecoder();
  const add = (entry: readonly RedisReply[]): void => {
    const name = decoder.decode(entry[0] as Uint8Array).toLowerCase();
    flags.set(
      name,
      ((entry[2] ?? []) as readonly Uint8Array[]).map((flag) => decoder.decode(flag)),
    );
    for (const sub of (entry[9] ?? []) as readonly (readonly RedisReply[])[]) {
      add(sub);
    }
  };
  for (const entry of info as readonly (readonly RedisReply[])[]) {
    add(entry);
  }
  return flags;
}

function withFlags(command: CommandDoc, flags: ReadonlyMap<string, readonly string[]>): CommandDoc {
  return {
    ...command,
    flags: flags.get(command.name) ?? [],
    subcommands: command.subcommands.map((sub) => withFlags(sub, flags)).sort((a, b) => (a.name < b.name ? -1 : 1)),
  };
}

async function recordBuiltinList(engines: Engines, id: ConnectionId, version: string): Promise<void> {
  const docs = parseDocs([await send(engines, id, 'COMMAND', 'DOCS')]);
  const flags = flagsByName(await send(engines, id, 'COMMAND', 'INFO'));
  const commands = docsForVersion(docs.commands, '7.2.99')
    .map((command) => withFlags(command, flags))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const source = `COMMAND DOCS and COMMAND INFO of Redis ${version}, without what is newer than 7.2, by test/integration/console/record-replies.test.ts`;
  await writeFile(builtinFile, `${JSON.stringify({ source, commands }, null, 1)}\n`);
}

async function recordDenied(engines: Engines, id: ConnectionId, url: string, version: string): Promise<void> {
  const user = 'datardo-record-no-command';
  await send(engines, id, 'ACL', 'SETUSER', user, 'on', '>record-only', '~*', '&*', '+@all', '-command');
  const denied = createEngines();
  const deniedId = connectionId('record-denied');
  try {
    const address = new URL(url);
    address.username = user;
    address.password = 'record-only';
    await connected(denied, deniedId, address.toString());
    const message = await send(denied, deniedId, 'COMMAND', 'INFO', 'set').then(
      () => 'no error',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    await writeJson(`redis-${version}-command-info-denied.json`, { $error: message });
  } finally {
    await denied.disconnectAll();
    await send(engines, id, 'ACL', 'DELUSER', user);
  }
}

async function record(url: string): Promise<void> {
  const engines = createEngines();
  const id = connectionId('record');
  await connected(engines, id, url);
  try {
    const info = new TextDecoder().decode((await send(engines, id, 'INFO', 'server')) as Uint8Array);
    const fullVersion = /redis_version:([\d.]+)/u.exec(info)?.[1] ?? 'unknown';
    const version = fullVersion.split('.').slice(0, 2).join('.');
    const names = ['set', 'get', 'function', 'sort', 'config', 'eval', 'blpop', 'mymodule.do'];
    const infos: Record<string, unknown> = {};
    for (const name of names) {
      infos[name] = asJson(await send(engines, id, 'COMMAND', 'INFO', name));
    }
    await writeJson(`redis-${version}-command-info.json`, infos);
    const documented = ['get', 'set', 'hset', 'del', 'scan', 'zadd', 'config', 'blpop', 'expire', 'sort', 'substr'];
    await writeJson(
      `redis-${version}-command-docs.json`,
      asJson(await send(engines, id, 'COMMAND', 'DOCS', ...documented)),
    );
    await recordDenied(engines, id, url, version);
    await recordBuiltinList(engines, id, fullVersion);
    expect(pairsOf(await send(engines, id, 'COMMAND', 'DOCS', 'get')).length).toBe(1);
  } finally {
    await engines.disconnectAll();
  }
}

describe('console.command-docs', () => {
  it.runIf(recording)('records COMMAND INFO and COMMAND DOCS of Redis, and makes the built-in list', async () => {
    const servers = testServers();
    await mkdir(folder, { recursive: true });
    expect(servers.redis).toBeDefined();
    await record(servers.redis ?? '');
  });
});
