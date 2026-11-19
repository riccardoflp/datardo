import { describe, expect, it } from 'vitest';
import { infoField, infoNumber, infoReport, parse, request } from '../../../src/features/server/read-info';
import { view as overview } from '../../../src/features/server/overview';
import { view as replication } from '../../../src/features/server/replication';
import { bytes, cacheLocal, commandsOf, contextOn, failed, recordedBytes } from './context';

function reportOf(info: string): ReturnType<typeof infoReport> {
  return infoReport(info);
}

describe('server.read-info', () => {
  it('sends INFO, or INFO replication for the Replication section', () => {
    const context = contextOn('server.read-info');
    expect(commandsOf(request(context, { connection: cacheLocal.id }))).toEqual(['INFO']);
    expect(commandsOf(request(context, { connection: cacheLocal.id, part: 'replication' }))).toEqual([
      'INFO replication',
    ]);
  });

  it('redis_version:7.2.4 in # Server gives the field redis_version with the value 7.2.4', () => {
    const report = reportOf('# Server\r\nredis_version:7.2.4\r\n');
    expect(report.sections).toEqual([{ name: 'Server', fields: [['redis_version', '7.2.4']] }]);
    expect(infoField(report, 'redis_version')).toBe('7.2.4');
  });

  it('db0:keys=1204,expires=310,avg_ttl=86400000 gives db0 with 1,204 keys, 310 with an expiry and 86,400,000 ms', () => {
    const report = reportOf('# Keyspace\r\ndb0:keys=1204,expires=310,avg_ttl=86400000,subexpiry=0\r\n');
    expect(report.databases).toEqual([
      {
        database: 0,
        name: 'db0',
        keys: 1204,
        expires: 310,
        averageTtlMs: 86_400_000,
        pairs: [
          ['keys', '1204'],
          ['expires', '310'],
          ['avg_ttl', '86400000'],
          ['subexpiry', '0'],
        ],
      },
    ]);
  });

  it('executable and config_file keep everything after their first colon', () => {
    const report = reportOf('# Server\r\nexecutable:/usr/bin/redis-server\r\nconfig_file:C:\\redis\\redis.conf\r\n');
    expect(infoField(report, 'executable')).toBe('/usr/bin/redis-server');
    expect(infoField(report, 'config_file')).toBe('C:\\redis\\redis.conf');
  });

  it('a reply with no # Keyspace lines gives no databases, and the Overview says No keys.', () => {
    const info = parse([bytes('# Server\r\nredis_version:7.4.1\r\n\r\n# Keyspace\r\n')]);
    expect(info.kind === 'read' ? info.value.databases : undefined).toEqual([]);
    expect(overview({ connection: cacheLocal.id, info, now: 0 }).noKeys).toBe('No keys.');
  });

  it('INFO replication gives only the fields of # Replication (recorded from Redis 7.4)', () => {
    const info = parse([recordedBytes('redis-7.4-server-info-replication.txt')]);
    expect(info.kind === 'read' ? info.value.sections.map((section) => section.name) : []).toEqual(['Replication']);
    expect(info.kind === 'read' ? infoField(info.value, 'role') : undefined).toBe('master');
  });

  it('the whole INFO of Redis 7.4 gives its sections, numbers where a card reads them, and the slaves as replicas', () => {
    const info = parse([recordedBytes('redis-7.4-server-info.txt')]);
    expect(info.kind).toBe('read');
    const report = info.kind === 'read' ? info.value : reportOf('');
    expect(report.sections.map((section) => section.name)).toEqual(
      expect.arrayContaining(['Server', 'Clients', 'Memory', 'Persistence', 'Stats', 'Replication', 'Keyspace']),
    );
    expect(infoField(report, 'redis_version')).toMatch(/^7\.4\./u);
    expect(infoNumber(report, 'connected_clients')).toBeGreaterThan(0);
    expect(infoNumber(report, 'redis_mode')).toBeUndefined();
    const withSlave = reportOf(
      '# Replication\r\nrole:master\r\nslave0:ip=10.0.0.6,port=6379,state=online,offset=1234,lag=0\r\n',
    );
    expect(withSlave.replicas).toEqual([
      {
        name: 'slave0',
        ip: '10.0.0.6',
        port: '6379',
        state: 'online',
        offset: 1234,
        lag: 0,
        pairs: [
          ['ip', '10.0.0.6'],
          ['port', '6379'],
          ['state', 'online'],
          ['offset', '1234'],
          ['lag', '0'],
        ],
      },
    ]);
  });

  it('a field met twice keeps its last value', () => {
    expect(infoField(reportOf('# Stats\r\nexpired_keys:1\r\nexpired_keys:2\r\n'), 'expired_keys')).toBe('2');
  });

  it('a server that refuses INFO gives both sections the sentence of server.unavailable and no values', () => {
    const refused = failed("NOPERM User app has no permissions to run the 'info' command");
    const info = parse([refused]);
    const ofReplication = parse([refused]);
    expect(overview({ connection: cacheLocal.id, info, now: 0 })).toEqual({
      error: "INFO needs a user that may run it: NOPERM User app has no permissions to run the 'info' command",
      tiles: [],
    });
    expect(replication({ info: ofReplication })).toEqual({
      error: "INFO needs a user that may run it: NOPERM User app has no permissions to run the 'info' command",
      tiles: [],
    });
  });
});
