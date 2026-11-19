import { describe, expect, it } from 'vitest';
import { answerOf, bytes, drive, failed, failureOf, mcpState } from './harness';

type Words = readonly string[];

const reads = [
  'INFO',
  'SLOWLOG GET',
  'SLOWLOG LEN',
  'CONFIG GET slowlog-log-slower-than',
  'CLIENT LIST',
  'MEMORY STATS',
  'MEMORY DOCTOR',
];

function sentWords(driven: ReturnType<typeof drive>): readonly Words[] {
  return driven.sent.map((each) => {
    const request = each.request;
    return request.engine === 'redis' ? request.command.map((word) => new TextDecoder().decode(word)) : [];
  });
}

function onlyReads(driven: ReturnType<typeof drive>): void {
  for (const words of sentWords(driven)) {
    const line = words.join(' ');
    expect(reads.some((read) => line.startsWith(read))).toBe(true);
  }
}

const info = (lines: readonly string[]) => bytes(`${lines.join('\r\n')}\r\n`);

const summaryInfo = info([
  '# Server',
  'redis_version:7.2.4',
  'redis_mode:standalone',
  'uptime_in_seconds:1047600',
  '# Clients',
  'connected_clients:12',
  'blocked_clients:0',
  '# Memory',
  'used_memory:1048576',
  'maxmemory:0',
  '# Replication',
  'role:master',
  'connected_slaves:0',
  '# Keyspace',
  'db0:keys=12345,expires=1200,avg_ttl=0',
  'db1:keys=3,expires=0,avg_ttl=0',
]);

const slowEntry = (id: number, words: readonly string[]) => [
  id,
  1_763_374_830,
  152_400,
  words.map(bytes),
  bytes('10.0.0.5:51234'),
  bytes('api'),
];

function slowLog(entries: readonly unknown[], config: unknown = [bytes('slowlog-log-slower-than'), bytes('10000')]) {
  return (words: Words): unknown => {
    if (words[0] === 'SLOWLOG') {
      return words[1] === 'GET' ? entries : 57;
    }
    return config;
  };
}

describe('mcp.redis-server-tools', () => {
  it('sums up the server, and the keys of each database', () => {
    const driven = drive('redis_server_info', { connection: 'Cache local' }, { redis: () => summaryInfo });
    const text = answerOf(driven);
    expect(text.split('\n')[0]).toBe('Cache local: Redis 7.2.4, standalone, role master, up 12 d 3 h.');
    expect(text).toContain('Keys: db0 12,345 (1,200 with an expiry); db1 3.');
    onlyReads(driven);
    const empty = answerOf(
      drive(
        'redis_server_info',
        { connection: 'Cache local' },
        { redis: () => info(['# Server', 'redis_version:7.2.4']) },
      ),
    );
    expect(empty).toContain('Keys: none.');
  });

  it('gives a section as its lines, and refuses a section it does not know', () => {
    const driven = drive(
      'redis_server_info',
      { connection: 'Cache local', section: 'replication' },
      {
        redis: () => info(['# Replication', 'role:master', 'connected_slaves:0']),
      },
    );
    expect(sentWords(driven)).toEqual([['INFO', 'replication']]);
    expect(answerOf(driven)).toBe('role: master\nconnected_slaves: 0');
    expect(failureOf(drive('redis_server_info', { connection: 'Cache local', section: 'modules' }))).toBe(
      'section must be one of server, clients, memory, persistence, stats, replication, cpu, keyspace.',
    );
  });

  it('gives the slow log, newest first, with its threshold', () => {
    const entries = Array.from({ length: 20 }, (_, index) => slowEntry(1234 - index, ['HGETALL', 'orders:42']));
    const driven = drive('redis_slow_log', { connection: 'Cache local' }, { redis: slowLog(entries) });
    const text = answerOf(driven);
    expect(sentWords(driven)[0]).toEqual(['SLOWLOG', 'GET', '20']);
    expect(text.split('\n')[0]).toBe(
      'Slow log of Cache local: 20 of 57 entries, newest first (commands slower than 10 ms are logged).',
    );
    expect(text).toContain('- #1234 · 2025-11-17T10:20:30Z · 152.4 ms · HGETALL orders:42 · 10.0.0.5:51234 "api"');
    onlyReads(driven);
  });

  it('cuts a command at 300 characters, and writes ? for its arguments without readData', () => {
    const long = answerOf(
      drive(
        'redis_slow_log',
        { connection: 'Cache local' },
        { redis: slowLog([slowEntry(1, ['SET', 'k', 'v'.repeat(500)])]) },
      ),
    );
    const line = long.split('\n').find((each) => each.startsWith('- #1')) ?? '';
    expect(line).toContain(`SET k ${'v'.repeat(100)}`);
    expect(line).not.toContain('v'.repeat(400));
    const hidden = answerOf(
      drive(
        'redis_slow_log',
        { connection: 'Cache local' },
        { redis: slowLog([slowEntry(1234, ['HGETALL', 'orders:42'])]) },
        mcpState({ settings: { 'datardo.mcp.readData': false } }),
      ),
    );
    expect(hidden).toContain('· HGETALL ? ·');
  });

  it('says an empty slow log, and a threshold the server does not give', () => {
    expect(answerOf(drive('redis_slow_log', { connection: 'Cache local' }, { redis: slowLog([]) }))).toBe(
      'The slow log of Cache local is empty.',
    );
    const managed = answerOf(
      drive(
        'redis_slow_log',
        { connection: 'Cache local' },
        { redis: slowLog([slowEntry(1, ['GET', 'a'])], failed("ERR unknown command 'CONFIG'")) },
      ),
    );
    expect(managed).toContain("(threshold unknown: the server doesn't allow CONFIG GET)");
  });

  it('lists the clients, least idle first', () => {
    const list = [
      'id=78 addr=10.0.0.6:40000 name= age=60 idle=50 flags=N db=0 cmd=ping',
      'id=77 addr=10.0.0.5:51234 name=api age=7200 idle=3 flags=N db=0 cmd=get',
    ].join('\n');
    const text = answerOf(drive('redis_clients', { connection: 'Cache local' }, { redis: () => bytes(`${list}\n`) }));
    expect(text.split('\n')[0]).toBe('Cache local: 2 clients.');
    expect(text).toContain('- id 77 · 10.0.0.5:51234 · "api" · db0 · age 2 h · idle 3 s · last command get');
    expect(text.indexOf('id 77')).toBeLessThan(text.indexOf('id 78'));
    const many = Array.from(
      { length: 3200 },
      (_, index) => `id=${String(index)} addr=a:1 age=1 idle=${String(index)} db=0 cmd=get`,
    ).join('\n');
    expect(
      answerOf(drive('redis_clients', { connection: 'Cache local' }, { redis: () => bytes(many) })).split('\n')[0],
    ).toBe('Cache local: the 50 least idle of 3,200 clients.');
  });

  const memoryInfo = info([
    '# Memory',
    'used_memory:1288490188',
    'used_memory_peak:1610612736',
    'used_memory_rss:1503238553',
    'mem_fragmentation_ratio:1.17',
    'maxmemory:2147483648',
    'maxmemory_policy:allkeys-lru',
  ]);

  it('gives the memory, its limit, and the diagnosis', () => {
    const driven = drive(
      'redis_memory',
      { connection: 'Cache local' },
      {
        redis: (words) => {
          if (words[0] === 'INFO') {
            return memoryInfo;
          }
          return words[1] === 'STATS'
            ? [bytes('overhead.total'), 1000, bytes('dataset.bytes'), 2000, bytes('keys.count'), 3]
            : bytes('Sam, I detected no issues.');
        },
      },
    );
    const text = answerOf(driven);
    expect(text).toContain('Used: 1.2 GB (peak 1.5 GB), resident 1.4 GB, fragmentation 1.17.');
    expect(text).toContain('Limit: 2.0 GB, policy allkeys-lru.');
    expect(text.endsWith('Sam, I detected no issues.')).toBe(true);
    onlyReads(driven);
  });

  it('says a limit of none, and what INFO memory tells without the MEMORY commands', () => {
    const text = answerOf(
      drive(
        'redis_memory',
        { connection: 'Cache local' },
        {
          redis: (words) =>
            words[0] === 'INFO'
              ? info(['# Memory', 'used_memory:100', 'maxmemory:0'])
              : failed("ERR unknown command 'MEMORY'"),
        },
      ),
    );
    expect(text).toContain('Limit: none.');
    expect(text).toContain("The server doesn't have the MEMORY commands: this is what INFO memory tells.");
  });
});
