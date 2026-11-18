import { describe, expect, it } from 'vitest';
import { serverRefusal } from '../../../src/features/connection/connect';
import {
  infoFields,
  isVersionAtLeast,
  parse,
  request,
  serverInfoRequests,
  serverText,
} from '../../../src/features/connection/server-info';
import type { ServerInfo } from '../../../src/shared/connection';
import { contextOf, mongoConnection, redisConnection, stateWith } from './context';
import { mongoReply, redisReply } from './replies';

const decoder = new TextDecoder();

describe('connection.server-info', () => {
  it('asks MongoDB hello then buildInfo on admin, and Redis the INFO sections', () => {
    const [hello, buildInfo] = serverInfoRequests('mongodb', 'connect');
    expect(hello).toMatchObject({ engine: 'mongodb', database: 'admin', method: 'runCommand' });
    expect(hello?.engine === 'mongodb' ? hello.arguments : []).toEqual([{ hello: { $numberInt: '1' } }]);
    expect(buildInfo?.engine === 'mongodb' ? buildInfo.arguments : []).toEqual([{ buildInfo: { $numberInt: '1' } }]);
    const sections = serverInfoRequests('redis', 'overview').map((each) =>
      each.engine === 'redis' ? each.command.map((word) => decoder.decode(word)).join(' ') : '',
    );
    expect(sections).toEqual(['INFO server', 'INFO replication', 'INFO memory', 'INFO clients']);
    expect(serverInfoRequests('redis', 'connect')).toHaveLength(1);
  });

  it('asks the server of a saved connection', () => {
    const connection = redisConnection();
    const context = contextOf('connection.server-info', stateWith([connection]));
    const read = request(context, { connection: connection.id, depth: 'overview' });
    expect(read).toMatchObject({ kind: 'engine' });
  });

  it('MongoDB: a standalone of 8.2, recorded, with the version of buildInfo and the host written', () => {
    const info = parse([mongoReply('mongodb-8.2-standalone-hello'), mongoReply('mongodb-8.2-buildInfo')], {
      hosts: 'localhost:27017',
    });
    expect(info).toMatchObject({ engine: 'mongodb', topology: { kind: 'standalone' } });
    expect(info.engine === 'mongodb' && info.version.startsWith('8.2.')).toBe(true);
    expect(info.engine === 'mongodb' ? info.hosts : []).toEqual([{ host: 'localhost:27017', role: 'standalone' }]);
    expect(serverText(info)).toBe('MongoDB 8.2 · standalone');
  });

  it('MongoDB: a replica set, recorded, is named by setName and its hosts carry their role', () => {
    const info = parse([mongoReply('mongodb-8.2-replica-set-hello'), mongoReply('mongodb-8.2-buildInfo')]);
    expect(info).toMatchObject({ engine: 'mongodb', topology: { kind: 'replica-set', name: 'testset' } });
    expect(info.engine === 'mongodb' ? info.hosts.map((each) => each.role) : []).toEqual(['primary']);
    expect(serverText(info)).toBe('MongoDB 8.2 · testset');
  });

  it('MongoDB: a mongos, recorded (msg isdbgrid), is a sharded cluster with the hosts written', () => {
    const info = parse([mongoReply('mongodb-8.2-sharded-hello'), mongoReply('mongodb-8.2-buildInfo')], {
      hosts: 'a:27017,b:27017',
    });
    expect(info).toMatchObject({ engine: 'mongodb', topology: { kind: 'sharded' } });
    expect(info.engine === 'mongodb' ? info.hosts : []).toEqual([
      { host: 'a:27017', role: 'mongos' },
      { host: 'b:27017', role: 'mongos' },
    ]);
    expect(serverText(info)).toBe('MongoDB 8.2 · sharded cluster');
  });

  it('MongoDB: passives and arbiters of hello are hosts, with their roles', () => {
    const info = parse(
      [
        { setName: 'rs0', hosts: ['a:1', 'b:1'], passives: ['c:1'], arbiters: ['d:1'], primary: 'b:1' },
        { version: '8.0.4' },
      ],
      null,
    );
    expect(info.engine === 'mongodb' ? info.hosts : []).toEqual([
      { host: 'a:1', role: 'secondary' },
      { host: 'b:1', role: 'primary' },
      { host: 'c:1', role: 'secondary' },
      { host: 'd:1', role: 'arbiter' },
    ]);
    expect(serverText(info)).toBe('MongoDB 8.0 · rs0');
  });

  it('Redis: a standalone 7.4, recorded, with its role, memory and clients', () => {
    const info = parse(
      ['server', 'replication', 'memory', 'clients'].map((section) => redisReply(`redis-7.4-info-${section}`)),
    );
    expect(info).toMatchObject({ engine: 'redis', product: 'Redis', mode: 'standalone', role: { kind: 'master' } });
    expect(info.engine === 'redis' && info.redisVersion.startsWith('7.4.')).toBe(true);
    expect(info.engine === 'redis' ? info.memory?.used : undefined).toBeGreaterThan(0);
    expect(info.engine === 'redis' ? info.clients?.connected : undefined).toBeGreaterThan(0);
    expect(serverText(info)).toBe('Redis 7.4 · standalone');
    expect(serverRefusal(info)).toBeUndefined();
  });

  it('Redis: a replica, recorded, is a replica of its master host and port', () => {
    const info = parse([redisReply('redis-7.4-replica-info-server'), redisReply('redis-7.4-replica-info-replication')]);
    expect(info).toMatchObject({
      role: { kind: 'replica', masterHost: 'host.docker.internal', masterPort: '6390' },
    });
    expect(serverText(info)).toBe('Redis 7.4 · replica');
  });

  it('Redis: cluster and sentinel modes, recorded, are refused', () => {
    const cluster = parse([redisReply('redis-7.4-cluster-info-server')]);
    const sentinel = parse([redisReply('redis-7.4-sentinel-info-server')]);
    expect(cluster).toMatchObject({ mode: 'cluster' });
    expect(serverRefusal(cluster)).toEqual({
      code: 'connection.connect/redis-cluster',
      message: 'Redis Cluster is not supported yet.',
    });
    expect(serverRefusal(sentinel)?.code).toBe('connection.connect/redis-sentinel');
  });

  it('Redis: versions are compared number by number', () => {
    expect(isVersionAtLeast('6.2.0', [6, 2])).toBe(true);
    expect(isVersionAtLeast('7.4.1', [6, 2])).toBe(true);
    expect(isVersionAtLeast('6.0.20', [6, 2])).toBe(false);
    expect(isVersionAtLeast('10.0.0', [6, 2])).toBe(true);
    const old: ServerInfo = { engine: 'redis', product: 'Redis', version: '5.0.14', redisVersion: '5.0.14' };
    expect(serverRefusal(old)?.message).toBe('Redis 5.0.14 is too old: Datardo needs Redis 6.2 or later.');
  });

  it('Redis: Valkey is shown by valkey_version, and accepted by redis_version', () => {
    const info = parse([
      '# Server\r\nredis_version:7.2.4\r\nserver_name:valkey\r\nvalkey_version:8.0.1\r\nredis_mode:standalone\r\n',
    ]);
    expect(info).toMatchObject({ product: 'Valkey', version: '8.0.1', redisVersion: '7.2.4' });
    expect(serverText(info)).toBe('Valkey 8.0 · standalone');
    expect(serverRefusal(info)).toBeUndefined();
  });

  it('INFO lines are name:value; comments, empty lines and missing names give nothing', () => {
    const fields = infoFields('# Server\r\n\r\nredis_version:7.4.1\r\nlistener0:name=tcp,port=6379\r\nnot a field\r\n');
    expect(fields.get('redis_version')).toBe('7.4.1');
    expect(fields.get('listener0')).toBe('name=tcp,port=6379');
    expect(fields.has('# Server')).toBe(false);
    expect(fields.get('redis_mode')).toBeUndefined();
    expect(parse([''])).toMatchObject({ engine: 'redis', version: '', redisVersion: '' });
  });

  it('the connection island shows the first two numbers of the version', () => {
    const info = parse([{ version: '7.0.12' }, { version: '7.0.12' }]);
    expect(serverText(info)).toBe('MongoDB 7.0 · standalone');
    expect(mongoConnection().engine).toBe('mongodb');
  });
});
