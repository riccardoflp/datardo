import { describe, expect, it } from 'vitest';
import { address, addressHosts } from '../../../src/features/home/address';
import { filterConnections } from '../../../src/features/home/filter';
import type { ConnectionView } from '../../../src/shared/connection';
import { saved } from '../tab/harness';

/** What the connection area keeps beside a connection, from the connection string the user typed. */
function typed(connectionString: string, ssh?: string): Parameters<typeof address>[0] {
  const hosts = connectionString.replace(/^[a-z+]+:\/\//u, '');
  return {
    hosts,
    address: connectionString.replace(/\/\/[^@/]*@/u, '//'),
    ...(ssh === undefined
      ? {}
      : { ssh: { host: ssh, port: 22, username: 'deploy', authentication: 'agent' as const } }),
  };
}

describe('home.address', () => {
  it('each worked example gives exactly that line', () => {
    expect(
      address(
        typed(
          'mongodb://app:s3cret@db1.example.com:27017,db2.example.com:27017,db3.example.com:27017/shop?replicaSet=rs0',
        ),
      ),
    ).toBe('db1.example.com:27017 +2');
    expect(address(typed('mongodb+srv://app:s3cret@cluster0.ab12c.mongodb.net/shop'))).toBe(
      'cluster0.ab12c.mongodb.net',
    );
    expect(address(typed('mongodb://localhost'))).toBe('localhost');
    expect(address(typed('mongodb://[::1]:27017'))).toBe('[::1]:27017');
    expect(address(typed('redis://:s3cret@localhost:6379/2'))).toBe('localhost:6379');
    expect(address(typed('rediss://default:s3cret@cache.example.com:6380'))).toBe('cache.example.com:6380');
    expect(address(typed('mongodb://10.0.0.5:27017', 'deploy@bastion.example.com:2222'))).toBe(
      '10.0.0.5:27017 via bastion.example.com',
    );
  });

  it('building the address asks nothing of the secret storage: it reads only what is kept beside the connection', () => {
    const connection = saved('local', 'Local', 'mongodb');
    expect(address(connection)).toBe('localhost:27017');
  });

  it('resting the pointer on db1.example.com:27017 +2 shows the three hosts, one for each line, and nothing else', () => {
    expect(
      addressHosts(
        typed('mongodb://app:s3cret@db1.example.com:27017,db2.example.com:27017,db3.example.com:27017/shop'),
      ),
    ).toEqual(['db1.example.com:27017', 'db2.example.com:27017', 'db3.example.com:27017']);
  });

  it('two connections to localhost:27017 with different users show the same address', () => {
    expect(address(typed('mongodb://ann:a@localhost:27017'))).toBe(address(typed('mongodb://bob:b@localhost:27017')));
  });
});

const connections: readonly ConnectionView[] = [
  saved('local', 'Local', 'mongodb', { hosts: 'localhost:27017' }),
  saved('cache-local', 'Cache local', 'redis', { hosts: 'localhost:6379' }),
  saved('staging', 'Staging', 'mongodb', { folder: 'Dev', hosts: 'staging.example.com:27017' }),
  saved('production', 'Production', 'mongodb', {
    folder: 'Live',
    hosts: 'app@db1.example.com:27017,db2.example.com:27017,db3.example.com:27017',
  }),
  saved('cache-production', 'Cache production', 'redis', { folder: 'Live', hosts: 'cache.example.com:6380' }),
];

function names(typedText: string, engine: 'all' | 'mongodb' | 'redis' = 'all'): readonly string[] {
  return filterConnections(typedText, engine, connections).shown.map((connection) => connection.name);
}

describe('home.filter', () => {
  it('each worked example shows exactly those cards and those numbers', () => {
    expect(names('')).toHaveLength(5);
    expect(filterConnections('', 'all', connections).counts).toEqual({ all: 5, mongodb: 3, redis: 2 });
    expect(names('', 'redis')).toEqual(['Cache local', 'Cache production']);
    expect(names('local')).toEqual(['Local', 'Cache local']);
    expect(filterConnections('local', 'all', connections).counts).toEqual({ all: 2, mongodb: 1, redis: 1 });
    expect(names('live')).toEqual(['Production', 'Cache production']);
    expect(names('live cache')).toEqual(['Cache production']);
    expect(names('example', 'mongodb')).toEqual(['Staging', 'Production']);
    expect(names('6380')).toEqual(['Cache production']);
    expect(names('zz')).toEqual([]);
    expect(filterConnections('zz', 'all', connections).counts).toEqual({ all: 0, mongodb: 0, redis: 0 });
  });

  it('LOCAL gives the same cards as local', () => {
    expect(names('LOCAL')).toEqual(names('local'));
  });

  it('with only MongoDB connections saved, the engines are not shown', () => {
    const mongo = connections.filter((connection) => connection.engine === 'mongodb');
    expect(filterConnections('', 'redis', mongo)).toMatchObject({ enginesShown: false });
    expect(filterConnections('', 'redis', mongo).shown).toHaveLength(3);
    expect(filterConnections('', 'all', connections).enginesShown).toBe(true);
  });

  it('a text that matches the user name of a connection string, and nothing else, shows no card', () => {
    expect(names('app')).toEqual([]);
  });
});
