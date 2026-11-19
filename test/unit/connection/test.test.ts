import { describe, expect, it } from 'vitest';
import { parse, request } from '../../../src/features/connection/test';
import type { TryReply } from '../../../src/shared/connection';
import { contextOf, formOf, mongoConnection, stateWith } from './context';
import { mongoReply, redisReply } from './replies';

const mongoReplies = [mongoReply('mongodb-8.2-standalone-hello'), mongoReply('mongodb-8.2-buildInfo')];

function answered(reply: Partial<Extract<TryReply, { kind: 'answered' }>>): TryReply {
  return { kind: 'answered', engine: 'mongodb', host: 'db1:27017', replies: mongoReplies, ...reply };
}

describe('connection.test', () => {
  it('reads the form first, then asks the main process to try it', () => {
    const form = formOf('mongodb', { name: 'Local', connectionString: 'mongodb://db1:27017' });
    const read = request(contextOf('connection.test', stateWith([])), { form, connection: null });
    expect(read).toMatchObject({ kind: 'app', action: 'engine.try', args: { connection: null } });
  });

  it('a form that cannot be read is refused before anything is tried', () => {
    const form = formOf('mongodb', { name: 'Local', connectionString: 'http://db1' });
    const read = request(contextOf('connection.test', stateWith([mongoConnection()])), { form, connection: null });
    expect(read).toMatchObject({ kind: 'refuse' });
  });

  it('MongoDB: success names the host and the version', () => {
    const result = parse([answered({})]);
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/^Connected to db1:27017: MongoDB 8\.2\.\d+\.$/);
  });

  it('MongoDB: through the SSH tunnel', () => {
    expect(parse([answered({ through: 'ada@bastion' })]).text).toMatch(
      /^Connected to db1:27017 through ada@bastion: MongoDB 8\.2\.\d+\.$/,
    );
  });

  it('Redis: success names the host, the port and the version', () => {
    const result = parse([
      { kind: 'answered', engine: 'redis', host: 'cache:6379', replies: [redisReply('redis-7.4-info-server')] },
    ]);
    expect(result.ok).toBe(true);
    expect(result.text).toMatch(/^Connected to cache:6379: Redis 7\.4\.\d+\.$/);
  });

  it('with redis-oplog on, the linked Redis answers, or fails marking the Redis connection', () => {
    expect(parse([answered({ linked: { host: 'cache:6379' } })]).text).toMatch(/ Redis cache:6379 answers\.$/);
    const failed = parse([answered({ linked: { host: 'cache:6379', reason: 'ECONNREFUSED' } })]);
    expect(failed).toMatchObject({ ok: false, field: 'linked-connection' });
    expect(failed.text).toMatch(/MongoDB 8\.2\.\d+\. Could not connect to Redis: ECONNREFUSED$/);
  });

  it('a failure reads Could not connect: <reason>', () => {
    const reason = 'WRONGPASS invalid username-password pair or user is disabled.';
    expect(parse([{ kind: 'failed', reason }])).toEqual({ ok: false, text: `Could not connect: ${reason}` });
  });

  it('a Redis Cluster and a Redis too old fail with their refusal', () => {
    const cluster = parse([
      { kind: 'answered', engine: 'redis', host: 'c:6379', replies: [redisReply('redis-7.4-cluster-info-server')] },
    ]);
    expect(cluster).toMatchObject({
      ok: false,
      text: 'Redis Cluster is not supported yet.',
      code: 'connection.test/redis-cluster',
    });
    const old = parse([
      { kind: 'answered', engine: 'redis', host: 'c:6379', replies: ['# Server\r\nredis_version:5.0.14\r\n'] },
    ]);
    expect(old.text).toBe('Redis 5.0.14 is too old: Datardo needs Redis 6.2 or later.');
    expect(old.code).toBe('connection.test/unsupported');
  });

  it('a refusal of the main process marks its field', () => {
    const refused: TryReply = {
      kind: 'refused',
      code: 'connection.read-form/file-missing',
      message: 'The CA file does not exist: ca.pem',
      field: 'ca-file',
    };
    expect(parse([refused])).toMatchObject({ ok: false, field: 'ca-file', code: 'connection.read-form/file-missing' });
  });
});
