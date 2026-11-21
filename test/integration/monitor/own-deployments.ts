/**
 * The deployments of their own of the Replication and Sharding tests (testing.md, "Throwaway servers"): stepping down a
 * primary and stopping a balancer must never touch the shared servers. A replica set of three members, which elects
 * another primary when one steps down; and a small sharded cluster started from the mongod and mongos of
 * `MONGOMS_SYSTEM_BINARY`'s folder, on free ports, in a folder of the system's temporary files: a config server and
 * two shards, each a replica set of one member, and a mongos. Each is stopped, and its folder removed, by `stop`.
 */
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { OwnDeployment } from './own-server';

/** A replica set of three members. */
export async function ownReplicaSet(): Promise<OwnDeployment> {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  const set = await MongoMemoryReplSet.create({
    ...(binary === undefined || binary === '' ? {} : { binary: { systemBinary: binary } }),
    replSet: { name: 'monitor-rs', count: 3, storageEngine: 'wiredTiger' },
  });
  return {
    uri: set.getUri(),
    topology: { kind: 'replica-set', name: 'monitor-rs' },
    stop: async () => {
      await set.stop();
    },
  };
}

/** The mongos next to `MONGOMS_SYSTEM_BINARY`, when there is one: the cluster cannot be started without it. */
export function mongosBinary(): string | undefined {
  const binary = process.env['MONGOMS_SYSTEM_BINARY'];
  if (binary === undefined || binary === '') {
    return undefined;
  }
  const mongos = join(dirname(binary), process.platform === 'win32' ? 'mongos.exe' : 'mongos');
  return existsSync(mongos) ? mongos : undefined;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error('No free port.'));
        }
      });
    });
  });
}

/** A process of the cluster: it fails the start when it exits before it answers. */
interface Started {
  readonly child: ChildProcess;
  readonly port: number;
  readonly exited: Promise<number | null>;
}

function started(binary: string, args: readonly string[], port: number, folder: string): Started {
  const child = spawn(binary, [...args, '--port', String(port), '--bind_ip', '127.0.0.1', '--logpath', folder], {
    stdio: 'ignore',
    windowsHide: true,
  });
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', resolve);
  });
  return { child, port, exited };
}

async function answering(server: Started): Promise<MongoClient> {
  const seen = { gone: false };
  void server.exited.then(() => {
    seen.gone = true;
  });
  const uri = `mongodb://127.0.0.1:${String(server.port)}/?directConnection=true`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (seen.gone) {
      throw new Error(`The server on port ${String(server.port)} exited before it answered.`);
    }
    try {
      return await MongoClient.connect(uri, { serverSelectionTimeoutMS: 1000 });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`The server on port ${String(server.port)} did not answer.`);
}

async function primaryOf(client: MongoClient): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const hello = await client.db('admin').command({ hello: 1 });
    if (hello['isWritablePrimary'] === true) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('No primary was elected.');
}

async function replicaSetOfOne(
  mongod: string,
  name: string,
  role: '--configsvr' | '--shardsvr',
  folder: string,
): Promise<Started> {
  const data = join(folder, name);
  await mkdir(data, { recursive: true });
  const args = [role, '--replSet', name, '--dbpath', data, '--wiredTigerCacheSizeGB', '0.25'];
  const server = started(mongod, args, await freePort(), join(folder, `${name}.log`));
  const client = await answering(server);
  try {
    const host = `127.0.0.1:${String(server.port)}`;
    await client.db('admin').command({
      replSetInitiate: {
        _id: name,
        ...(role === '--configsvr' ? { configsvr: true } : {}),
        members: [{ _id: 0, host }],
      },
    });
    await primaryOf(client);
  } finally {
    await client.close();
  }
  return server;
}

async function stopped(processes: readonly Started[], folder: string): Promise<void> {
  for (const each of processes) {
    if (each.child.exitCode === null) {
      each.child.kill();
      await each.exited;
    }
  }
  await rm(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

/** A config server, the shards `shard01` and `shard02`, and a mongos; the URI is the mongos's. */
export async function ownCluster(): Promise<OwnDeployment> {
  const mongos = mongosBinary();
  const mongod = process.env['MONGOMS_SYSTEM_BINARY'];
  if (mongos === undefined || mongod === undefined) {
    throw new Error('The cluster needs MONGOMS_SYSTEM_BINARY with a mongos next to it.');
  }
  const folder = await mkdtemp(join(tmpdir(), 'datardo-cluster-'));
  const processes: Started[] = [];
  try {
    const config = await replicaSetOfOne(mongod, 'cfg', '--configsvr', folder);
    processes.push(config);
    for (const name of ['shard01', 'shard02']) {
      processes.push(await replicaSetOfOne(mongod, name, '--shardsvr', folder));
    }
    const configdb = `cfg/127.0.0.1:${String(config.port)}`;
    const router = started(mongos, ['--configdb', configdb], await freePort(), join(folder, 'mongos.log'));
    processes.push(router);
    const client = await answering(router);
    try {
      for (const shard of processes.slice(1, 3)) {
        const name = shard === processes[1] ? 'shard01' : 'shard02';
        await client.db('admin').command({ addShard: `${name}/127.0.0.1:${String(shard.port)}`, name });
      }
    } finally {
      await client.close();
    }
    return {
      uri: `mongodb://127.0.0.1:${String(router.port)}/`,
      topology: { kind: 'sharded' },
      stop: () => stopped([...processes].reverse(), folder),
    };
  } catch (error) {
    await stopped([...processes].reverse(), folder);
    throw error;
  }
}
