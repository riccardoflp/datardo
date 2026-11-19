/**
 * The engines against real servers (testing.md): connecting, what the server is, bytes and types that survive, the
 * database of each Redis request, passwords that never show in an error, TLS through a proxy that terminates it, and
 * a server that never answers. No password of these tests is printed: each is made here and compared, never logged.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createNetServer, connect as netConnect, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { createServer as createTlsServer } from 'node:tls';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEngines, type ClientSettings } from '../../../src/engines';
import { serverRefusal } from '../../../src/features/connection/connect';
import { parse as parseServerInfo, serverInfoRequests } from '../../../src/features/connection/server-info';
import { connectionId } from '../../../src/shared/ids';
import { redisCommand, type EngineRequest, type RedisReply } from '../../../src/shared/engine-request';
import { testServers } from '../servers';

const tlsFolder = join(import.meta.dirname, '..', '..', 'fixtures', 'tls');
const caFile = join(tlsFolder, 'ca.pem');
const servers = testServers();
const redisUrl = servers.redis;
const [database] = servers.redisDatabases;
const id = connectionId('c-test');
const decoder = new TextDecoder();
const signal = (): AbortSignal => AbortSignal.timeout(20_000);

function settings(
  engine: 'mongodb' | 'redis',
  connectionString: string,
  more: Partial<ClientSettings> = {},
): ClientSettings {
  return { engine, connectionString, connectTimeoutMs: 5000, ...more };
}

async function serverInfoOf(
  engine: 'mongodb' | 'redis',
  open: ClientSettings,
  hosts = '',
): Promise<ReturnType<typeof parseServerInfo>> {
  const engines = createEngines();
  const client = await engines.open(open, signal());
  try {
    const replies: unknown[] = [];
    for (const request of serverInfoRequests(engine, 'overview')) {
      replies.push(await client.send(request, signal()));
    }
    return parseServerInfo(replies, { hosts });
  } finally {
    await client.close();
  }
}

/** A TLS server with the test certificate that hands each connection to a plain server. */
async function tlsProxy(target: string): Promise<{ readonly port: number; readonly close: () => void }> {
  const pem = readFileSync(join(tlsFolder, 'server.pem'));
  const [host, port] = target.split(':');
  const sockets = new Set<Socket>();
  const server = createTlsServer({ cert: pem, key: pem }, (socket) => {
    const plain = netConnect(Number(port), host ?? '127.0.0.1');
    sockets.add(plain).add(socket);
    socket.pipe(plain).pipe(socket);
    socket.on('error', () => plain.destroy());
    plain.on('error', () => socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    port: typeof address === 'object' && address !== null ? address.port : 0,
    close: () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    },
  };
}

function hostOf(uri: string): string {
  return /\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri)?.[1]?.split(',')[0] ?? '';
}

describe('connection.connect', () => {
  it('MongoDB: a standalone and a replica set, with what each server is', async () => {
    const standalone = await serverInfoOf('mongodb', settings('mongodb', servers.mongoStandalone), 'h:1');
    expect(standalone).toMatchObject({ engine: 'mongodb', topology: { kind: 'standalone' } });
    const replicaSet = await serverInfoOf('mongodb', settings('mongodb', servers.mongoReplicaSet));
    expect(replicaSet).toMatchObject({ engine: 'mongodb', topology: { kind: 'replica-set' } });
  });

  it('MongoDB: values keep their BSON types, and a cursor gives at most its limit', async () => {
    const engines = createEngines();
    await engines.connect(id, settings('mongodb', servers.mongoStandalone), signal());
    try {
      const send = (
        request: Omit<Extract<EngineRequest, { engine: 'mongodb' }>, 'engine' | 'database'>,
      ): Promise<unknown> =>
        engines.send({ connection: id, request: { engine: 'mongodb', database: 'm6', ...request } }, signal());
      await send({ collection: 'types', method: 'deleteMany', arguments: [{}] });
      const document = {
        _id: { $numberInt: '1' },
        int: { $numberInt: '7' },
        double: { $numberDouble: '7.0' },
        long: { $numberLong: '9007199254740993' },
        decimal: { $numberDecimal: '0.1' },
        bytes: { $binary: { base64: '/wBB', subType: '00' } },
      };
      await send({ collection: 'types', method: 'insertOne', arguments: [document] });
      await send({
        collection: 'types',
        method: 'insertMany',
        arguments: [[2, 3, 4].map((n) => ({ _id: { $numberInt: String(n) } }))],
      });
      expect(await send({ collection: 'types', method: 'findOne', arguments: [{ _id: { $numberInt: '1' } }] })).toEqual(
        document,
      );
      const found = await send({ collection: 'types', method: 'find', arguments: [{}], limit: 2 });
      expect(found).toHaveLength(2);
    } finally {
      await engines.disconnectAll();
    }
    expect(engines.isConnected(id)).toBe(false);
  });

  it('MongoDB: a wrong password fails, and the error does not hold it', async () => {
    const user = 'datardo';
    const password = randomBytes(12).toString('hex');
    const binary = process.env['MONGOMS_SYSTEM_BINARY'];
    const server = await MongoMemoryServer.create({
      auth: { enable: true, customRootName: user, customRootPwd: password },
      ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    });
    try {
      const host = hostOf(server.getUri());
      const good = await serverInfoOf(
        'mongodb',
        settings('mongodb', `mongodb://${user}:${password}@${host}/?authSource=admin`),
      );
      expect(good.engine).toBe('mongodb');
      const wrong = `${password}x`;
      const error = await createEngines()
        .open(settings('mongodb', `mongodb://${user}:${wrong}@${host}/?authSource=admin`), signal())
        .then(
          () => undefined,
          (failure: unknown) => failure as Error,
        );
      expect(error?.message).toMatch(/Authentication failed/);
      expect(error?.message).not.toContain(wrong);
    } finally {
      await server.stop();
    }
  });

  it('MongoDB: over TLS, checked against the CA file', async () => {
    const proxy = await tlsProxy(hostOf(servers.mongoStandalone));
    try {
      const uri = `mongodb://localhost:${String(proxy.port)}/?directConnection=true`;
      const info = await serverInfoOf('mongodb', settings('mongodb', uri, { tls: { caFile } }));
      expect(info.engine).toBe('mongodb');
      const untrusted = await createEngines()
        .open(settings('mongodb', uri, { tls: {}, connectTimeoutMs: 2000 }), signal())
        .then(
          () => 'connected',
          () => 'refused',
        );
      expect(untrusted).toBe('refused');
    } finally {
      proxy.close();
    }
  });
});

describe.runIf(redisUrl !== undefined)('connection.connect on Redis', () => {
  const url = redisUrl ?? '';
  const user = `datardo-test-${randomBytes(4).toString('hex')}`;
  const password = randomBytes(12).toString('hex');
  const host = hostOf(url);

  beforeAll(async () => {
    const engines = createEngines();
    await engines.connect(id, settings('redis', url), signal());
    await engines.send(
      { connection: id, request: redisCommand(0, 'ACL', 'SETUSER', user, 'on', `>${password}`, '~*', '+@all') },
      signal(),
    );
    await engines.disconnectAll();
  });

  afterAll(async () => {
    const engines = createEngines();
    await engines.connect(id, settings('redis', url), signal());
    await engines.send({ connection: id, request: redisCommand(0, 'ACL', 'DELUSER', user) }, signal());
    await engines.disconnectAll();
  });

  it('what the server is, and it is accepted', async () => {
    const info = await serverInfoOf('redis', settings('redis', url));
    expect(info).toMatchObject({ engine: 'redis', mode: 'standalone' });
    expect(serverRefusal(info)).toBeUndefined();
  });

  it('bytes survive, each request runs in its database, KEYS is never sent', async () => {
    const engines = createEngines();
    await engines.connect(id, settings('redis', url), signal());
    try {
      const other = servers.redisDatabases[1] ?? 15;
      const bytes = Uint8Array.from([0xff, 0x00, 0xfe, 0x41]);
      const key = `datardo:m6:${randomBytes(4).toString('hex')}`;
      const send = (request: EngineRequest): Promise<unknown> => engines.send({ connection: id, request }, signal());
      await send(redisCommand(database ?? 14, 'SET', key, bytes));
      expect(await send(redisCommand(database ?? 14, 'GET', key))).toEqual(bytes);
      expect(await send(redisCommand(other, 'GET', key))).toBeNull();
      await send(redisCommand(database ?? 14, 'HSET', `${key}:h`, 'f', 'v'));
      const hash = (await send(redisCommand(database ?? 14, 'HGETALL', `${key}:h`))) as RedisReply;
      expect(hash).toEqual({ kind: 'map', entries: [[new TextEncoder().encode('f'), new TextEncoder().encode('v')]] });
      await send(redisCommand(database ?? 14, 'DEL', key, `${key}:h`));
      await expect(send(redisCommand(0, 'KEYS', '*'))).rejects.toThrow(/never sends KEYS/);
    } finally {
      await engines.disconnectAll();
    }
  });

  it('a user and its password; a wrong one gives the server reason without the password', async () => {
    const at = url.replace('redis://', `redis://${user}:${password}@`);
    const info = await serverInfoOf('redis', settings('redis', at));
    expect(info.engine).toBe('redis');
    const wrong = `${password}x`;
    const error = await createEngines()
      .open(settings('redis', url.replace('redis://', `redis://${user}:${wrong}@`)), signal())
      .then(
        () => undefined,
        (failure: unknown) => failure as Error,
      );
    expect(error?.message).toMatch(/WRONGPASS invalid username-password pair or user is disabled/);
    expect(error?.message).not.toContain(wrong);
  });

  it('a client the server closes is reported as dropped', async () => {
    const engines = createEngines();
    await engines.connect(id, settings('redis', url), signal());
    const dropped = new Promise<string>((resolve) => {
      engines.onDrop((connection, reason) => {
        resolve(`${connection}: ${reason}`);
      });
    });
    const killer = createEngines();
    await killer.connect(id, settings('redis', url), signal());
    await killer.send(
      { connection: id, request: redisCommand(0, 'CLIENT', 'KILL', 'USER', 'default', 'SKIPME', 'yes') },
      signal(),
    );
    await killer.disconnectAll();
    expect(await dropped).toBe('c-test: The connection to Redis was closed.');
    expect(engines.isConnected(id)).toBe(false);
  });

  it('over TLS (rediss://), checked against the CA file', async () => {
    const proxy = await tlsProxy(host);
    try {
      const info = await serverInfoOf(
        'redis',
        settings('redis', `rediss://localhost:${String(proxy.port)}`, { tls: { caFile } }),
      );
      expect(info.engine).toBe('redis');
    } finally {
      proxy.close();
    }
  });
});

describe('connection.test', () => {
  let silent: Server;
  let port = 0;

  beforeAll(async () => {
    silent = createNetServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const address = silent.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterAll(() => {
    silent.close();
  });

  it("a Redis server that does not answer fails with didn't answer in 5 seconds", async () => {
    const started = Date.now();
    const error = await createEngines()
      .open(settings('redis', `redis://127.0.0.1:${String(port)}`), AbortSignal.timeout(30_000))
      .then(
        () => undefined,
        (failure: unknown) => failure as Error,
      );
    expect(error?.message).toBe(`Redis 127.0.0.1:${String(port)} didn't answer in 5 seconds`);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(decoder.decode(new Uint8Array())).toBe('');
  });
});
