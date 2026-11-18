import { describe, expect, it } from 'vitest';
import { isRedisStringProblem, redisFromString, redisToString } from '../../../src/features/connection/redis-string';

describe('connection.redis-string', () => {
  it.each([
    ['redis://localhost', { host: 'localhost', port: 6379, username: '', password: '', database: 0, tls: false }],
    [
      'rediss://ada:p%40ss@cache.example.com:6380/2',
      { host: 'cache.example.com', port: 6380, username: 'ada', password: 'p@ss', database: 2, tls: true },
    ],
    [
      'redis://:s3cret@10.0.0.5/1',
      { host: '10.0.0.5', port: 6379, username: '', password: 's3cret', database: 1, tls: false },
    ],
    ['redis://ada@cache', { host: 'cache', port: 6379, username: 'ada', password: '', database: 0, tls: false }],
    ['cache:6379', { host: 'cache', port: 6379, username: '', password: '', database: 0, tls: false }],
    ['REDIS://[::1]:7000/', { host: '::1', port: 7000, username: '', password: '', database: 0, tls: false }],
    ['redis://cache/3?timeout=5', { host: 'cache', port: 6379, username: '', password: '', database: 3, tls: false }],
    ['  redis://cache#top  ', { host: 'cache', port: 6379, username: '', password: '', database: 0, tls: false }],
  ])('reads %s', (text, fields) => {
    expect(redisFromString(text)).toEqual(fields);
  });

  it.each([
    ['redis://localhost', 'redis://localhost'],
    ['cache:6379', 'redis://cache'],
    ['REDIS://[::1]:7000/', 'redis://[::1]:7000'],
    ['redis://cache/3?timeout=5', 'redis://cache/3'],
  ])('writes back %s as %s', (text, written) => {
    const fields = redisFromString(text);
    if (isRedisStringProblem(fields)) {
      throw new Error(fields.message);
    }
    expect(redisToString(fields)).toBe(written);
  });

  it.each([
    ['http://cache', 'connection-string', 'The connection string must start with redis:// or rediss://'],
    ['redis://', 'connection-string', 'The connection string has no host'],
    ['redis://cache/orders', 'database', 'The database must be a number from 0: orders'],
    ['redis://cache:70000', 'port', 'The port must be a number from 1 to 65535'],
    ['redis://cache:0', 'port', 'The port must be a number from 1 to 65535'],
    ['redis://ca che', 'connection-string', 'Invalid Redis connection string'],
    ['redis://%zz@cache', 'connection-string', 'Invalid Redis connection string'],
  ])('refuses %s', (text, reason, message) => {
    expect(redisFromString(text)).toEqual({ reason, message });
  });

  it('writes the fields', () => {
    expect(redisToString({ host: 'cache', port: 6379, username: '', password: 'a b', database: 3, tls: true })).toBe(
      'rediss://:a%20b@cache/3',
    );
    expect(redisToString({ host: 'cache', port: 6380, username: 'ada', password: '', database: 0, tls: false })).toBe(
      'redis://ada@cache:6380',
    );
    expect(
      redisToString({ host: 'cache', port: 6379, username: 'ada', password: 'p@ss', database: 0, tls: false }),
    ).toBe('redis://ada:p%40ss@cache');
  });

  it('reads back what it wrote', () => {
    const fields = { host: '::1', port: 7001, username: 'a:b', password: 'p@s:s/', database: 12, tls: true };
    expect(redisFromString(redisToString(fields))).toEqual(fields);
  });
});
