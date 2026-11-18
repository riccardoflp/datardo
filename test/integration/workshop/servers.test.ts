import { MongoClient } from 'mongodb';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { testServers } from '../servers';

const servers = testServers();

describe('the throwaway servers', () => {
  it('give a standalone MongoDB that answers a ping', async () => {
    const client = new MongoClient(servers.mongoStandalone);
    try {
      await client.connect();
      const reply = await client.db('admin').command({ ping: 1 });
      expect(reply['ok']).toBe(1);
    } finally {
      await client.close();
    }
  });

  it('give a replica set of one member', async () => {
    const client = new MongoClient(servers.mongoReplicaSet);
    try {
      await client.connect();
      const hello = await client.db('admin').command({ hello: 1 });
      expect(hello['setName']).toBeTypeOf('string');
    } finally {
      await client.close();
    }
  });

  it.skipIf(servers.redis === undefined)('give a Redis server that answers PING', async () => {
    const client = createClient({ url: servers.redis ?? '' });
    try {
      await client.connect();
      expect(await client.ping()).toBe('PONG');
    } finally {
      client.destroy();
    }
  });
});
