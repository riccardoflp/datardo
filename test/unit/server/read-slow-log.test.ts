import { describe, expect, it } from 'vitest';
import { entryOf, parse, request } from '../../../src/features/server/read-slow-log';
import { thresholdLine } from '../../../src/features/server/slow-log';
import { bytes, cacheLocal, commandsOf, contextOn, failed, recordedRedis } from './context';

const decoder = new TextDecoder();

function words(...values: readonly string[]): readonly Uint8Array[] {
  return values.map((value) => bytes(value));
}

function thresholdReply(value: string): unknown {
  return { kind: 'map', entries: [[bytes('slowlog-log-slower-than'), bytes(value)]] };
}

describe('server.read-slow-log', () => {
  it('sends SLOWLOG GET 1000 and SLOWLOG LEN, and CONFIG GET slowlog-log-slower-than when the section is chosen', () => {
    const context = contextOn('server.read-slow-log');
    expect(commandsOf(request(context, { connection: cacheLocal.id }))).toEqual(['SLOWLOG GET 1000', 'SLOWLOG LEN']);
    expect(commandsOf(request(context, { connection: cacheLocal.id, part: 'entries-and-threshold' }))).toEqual([
      'SLOWLOG GET 1000',
      'SLOWLOG LEN',
      'CONFIG GET slowlog-log-slower-than',
    ]);
    expect(commandsOf(request(context, { connection: cacheLocal.id, part: 'length' }))).toEqual(['SLOWLOG LEN']);
  });

  it('the entry 14 gives its id, its duration, LRANGE queue 0 -1, its client and its name', () => {
    const entry = entryOf([
      14,
      1794924309,
      12345,
      words('LRANGE', 'queue', '0', '-1'),
      bytes('10.0.0.7:52144'),
      bytes('orders-api'),
    ]);
    expect(entry).toMatchObject({
      id: 14,
      time: 1794924309,
      microseconds: 12345,
      command: 'LRANGE queue 0 -1',
      client: '10.0.0.7:52144',
      clientName: 'orders-api',
    });
  });

  it('CONFIG SET requirepass s3cret gives CONFIG SET requirepass ***, and s3cret is nowhere in what parse returns', () => {
    const read = parse([[[3, 1794924309, 50, words('CONFIG', 'SET', 'requirepass', 's3cret')]], 1], null);
    const entry = read.entries?.kind === 'read' ? read.entries.value.entries[0] : undefined;
    expect(entry?.command).toBe('CONFIG SET requirepass ***');
    expect(entry?.arguments.map((each) => decoder.decode(each))).toEqual(['CONFIG', 'SET', 'requirepass', '***']);
    expect(
      JSON.stringify(read, (_key, value: unknown) => (value instanceof Uint8Array ? decoder.decode(value) : value)),
    ).not.toContain('s3cret');
  });

  it('the passwords of AUTH, HELLO … AUTH, MIGRATE … AUTH and ACL SETUSER are masked too', () => {
    const command = (...values: readonly string[]) => entryOf([1, 1, 1, words(...values)])?.command;
    expect(command('AUTH', 'app', 'pw')).toBe('AUTH app ***');
    expect(command('AUTH', 'pw')).toBe('AUTH ***');
    expect(command('HELLO', '3', 'AUTH', 'app', 'pw')).toBe('HELLO 3 AUTH app ***');
    expect(command('MIGRATE', 'h', '6379', '', '0', '5000', 'AUTH', 'pw', 'KEYS', 'a')).toBe(
      'MIGRATE h 6379 "" 0 5000 AUTH *** KEYS a',
    );
    expect(command('ACL', 'SETUSER', 'app', 'on', '>pw')).toBe('ACL SETUSER app on ***');
    expect(command('CONFIG', 'SET', 'masterauth', 'pw', 'maxmemory', '1gb')).toBe(
      'CONFIG SET masterauth *** maxmemory 1gb',
    );
  });

  it('an argument the server cut is shown with its ... (2048 more bytes) (recorded from Redis 7.4)', () => {
    const [entries, length, threshold] = recordedRedis('redis-7.4-server-slowlog.json') as unknown[];
    const read = parse([entries, length, threshold], { connection: cacheLocal.id, part: 'entries-and-threshold' });
    expect(read.entries?.kind).toBe('read');
    const value = read.entries?.kind === 'read' ? read.entries.value : { entries: [] };
    expect(value.entries.map((entry) => entry.id)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(value.entries.find((entry) => entry.command.startsWith('SET '))?.arguments.at(-1)).toSatisfy(
      (argument: Uint8Array) => decoder.decode(argument).endsWith('... (2048 more bytes)'),
    );
    expect(value.entries[0]?.arguments.map((each) => decoder.decode(each)).at(-1)).toBe('... (11 more arguments)');
    expect(value.entries.find((entry) => entry.command === 'LRANGE server:queue 0 -1')).toMatchObject({
      client: '172.17.0.1:35752',
      clientName: 'orders-api',
    });
    expect(read.threshold).toEqual({ kind: 'read', value: { microseconds: 10000 } });
  });

  it('a threshold of 10000 is 10 ms; 0, every command; -1, off', () => {
    const line = (value: string) =>
      thresholdLine(parse([[], 0, thresholdReply(value)], { part: 'entries-and-threshold' }).threshold);
    expect(line('10000')).toBe(
      'The server logs the commands that take longer than 10 ms (slowlog-log-slower-than 10000).',
    );
    expect(line('0')).toBe('The server logs every command (slowlog-log-slower-than 0).');
    expect(line('-1')).toBe('The slow log is off (slowlog-log-slower-than -1): no command is logged.');
    expect(
      parse([[], 0, [bytes('slowlog-log-slower-than'), bytes('250')]], { part: 'entries-and-threshold' }).threshold,
    ).toEqual({
      kind: 'read',
      value: { microseconds: 250 },
    });
  });

  it('with 4,096 entries on the server, the 1,000 read and SLOWLOG LEN 4,096 are kept', () => {
    const entries = Array.from({ length: 1000 }, (_, index) => [4096 - index, 1794924309, 10, words('GET', 'k')]);
    const read = parse([entries, 4096]);
    expect(read.entries?.kind === 'read' ? [read.entries.value.entries.length, read.entries.value.length] : []).toEqual(
      [1000, 4096],
    );
  });

  it('SLOWLOG GET refused gives its sentence and no entries; CONFIG GET refused alone keeps the entries', () => {
    const refused = parse([failed('NOPERM no'), failed('NOPERM no'), failed('NOPERM no')], {
      part: 'entries-and-threshold',
    });
    expect(refused.entries).toMatchObject({
      kind: 'unavailable',
      unavailable: { sentence: 'SLOWLOG GET needs a user that may run it: NOPERM no' },
    });
    const managed = parse([[], 0, failed("ERR unknown command 'CONFIG'")], { part: 'entries-and-threshold' });
    expect(managed.entries?.kind).toBe('read');
    expect(thresholdLine(managed.threshold)).toBe(
      "The threshold is not known: This server does not allow CONFIG GET: ERR unknown command 'CONFIG'",
    );
  });
});
