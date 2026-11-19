import { describe, expect, it } from 'vitest';
import { keyspaceOf, parse, request } from '../../../src/features/tree/redis-databases';
import { contextOf, recordedBytes, recordedRedis } from './context';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

describe('tree.redis-databases', () => {
  it('asks INFO keyspace and CONFIG GET databases, and scans no key', () => {
    const read = request(contextOf('tree.redis-databases'), { connection: 'c-cache' });
    const commands =
      read.kind === 'engine'
        ? read.requests.map((each) =>
            each.request.engine === 'redis' ? each.request.command.map((word) => decoder.decode(word)).join(' ') : '',
          )
        : [];
    expect(commands).toEqual(['INFO keyspace', 'CONFIG GET databases']);
  });

  it('db0:keys=1204,expires=310,avg_ttl=86400000 gives database 0 with 1,204 keys, 310 expiring, and ignores subexpiry', () => {
    expect(keyspaceOf('# Keyspace\r\ndb0:keys=1204,expires=310,avg_ttl=86400000,subexpiry=0\r\n')).toEqual([
      { number: 0, keys: 1204, expires: 310, averageTtlMs: 86_400_000 },
    ]);
  });

  it('every database up to the answer of CONFIG GET databases, those with no line with 0 keys (recorded from Redis 7.4)', () => {
    const found = parse([
      recordedBytes('redis-7.4-info-keyspace.txt'),
      recordedRedis('redis-7.4-config-get-databases.json'),
    ]);
    expect(found.count).toBe(16);
    expect(found.databases).toHaveLength(16);
    expect(found.databases[15]).toEqual({ number: 15, keys: 2, expires: 1, averageTtlMs: 0 });
    expect(found.databases[0]).toEqual({ number: 0, keys: 0, expires: 0, averageTtlMs: 0 });
  });

  it('CONFIG GET databases answered as an array (RESP2) says 32 databases', () => {
    const found = parse([encoder.encode('# Keyspace\r\n'), [encoder.encode('databases'), encoder.encode('32')]]);
    expect(found.count).toBe(32);
  });

  it('when CONFIG is refused, the highest database of INFO keyspace plus one, at least 16, and no error', () => {
    const refused = { kind: 'error', message: "NOPERM User has no permissions to run the 'config|get' command" };
    expect(parse([encoder.encode('db3:keys=1,expires=0,avg_ttl=0\r\n'), refused]).count).toBe(16);
    expect(parse([encoder.encode('db20:keys=1,expires=0,avg_ttl=0\r\n'), refused]).count).toBe(21);
  });

  it('a server with no key at all gives db0 to db15, each with 0 keys', () => {
    const found = parse([encoder.encode('# Keyspace\r\n'), { kind: 'error', message: 'refused' }]);
    expect(found.databases.map((each) => `${String(each.number)}:${String(each.keys)}`)).toEqual(
      Array.from({ length: 16 }, (_, index) => `${String(index)}:0`),
    );
  });
});
