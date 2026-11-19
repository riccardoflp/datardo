import { describe, expect, it } from 'vitest';
import { toolsOffered } from '../../../src/features/mcp';
import { expiryLine, scanWords } from '../../../src/features/mcp/redis-key-tools';
import { answerOf, bytes, drive, failureOf, mcpState, now } from './harness';

const reads = new Set([
  'SCAN',
  'TYPE',
  'PTTL',
  'OBJECT',
  'MEMORY',
  'STRLEN',
  'HLEN',
  'LLEN',
  'SCARD',
  'ZCARD',
  'XLEN',
  'GETRANGE',
  'HSCAN',
  'SSCAN',
  'LRANGE',
  'ZRANGE',
  'XRANGE',
]);

type Words = readonly string[];
type Reply = (words: Words) => unknown;

function keyOf(type: string, more: Reply = () => undefined): Reply {
  return (words) => {
    if (words[0] === 'TYPE') {
      return bytes(type);
    }
    return more(words);
  };
}

function sentWords(driven: ReturnType<typeof drive>): readonly Words[] {
  return driven.sent.map((each) => {
    const request = each.request;
    return request.engine === 'redis' ? request.command.map((word) => new TextDecoder().decode(word)) : [];
  });
}

function onlyReads(driven: ReturnType<typeof drive>): void {
  for (const words of sentWords(driven)) {
    expect(reads.has(words[0] ?? '')).toBe(true);
  }
}

const keys = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => bytes(`orders:${String(from + index)}`));

describe('mcp.redis-key-tools', () => {
  it('scans with SCAN, its COUNT the limit up to 500', () => {
    expect(scanWords('0', 'orders:*', 100, 'hash')).toEqual([
      'SCAN',
      '0',
      'MATCH',
      'orders:*',
      'COUNT',
      '100',
      'TYPE',
      'hash',
    ]);
    expect(scanWords('0', 'orders:*', 1000, undefined)).toEqual(['SCAN', '0', 'MATCH', 'orders:*', 'COUNT', '500']);
  });

  it('lists the keys of a page with their type, and the cursor to go on', () => {
    const driven = drive(
      'redis_scan_keys',
      { connection: 'Cache local', pattern: 'orders:*', type: 'hash' },
      {
        redis: () => [bytes('4096'), keys(0, 100)],
      },
    );
    const text = answerOf(driven);
    expect(sentWords(driven)[0]).toEqual(['SCAN', '0', 'MATCH', 'orders:*', 'COUNT', '100', 'TYPE', 'hash']);
    expect(text.split('\n')[0]).toBe('Cache local db0: 100 keys match orders:* (type hash), the scan is not finished.');
    expect(text).toContain('- orders:42 · hash');
    expect(text.endsWith('Cursor: 4096\n(pass it as cursor to go on from here)')).toBe(true);
    onlyReads(driven);
  });

  it('says a complete scan and gives no cursor', () => {
    const text = answerOf(
      drive(
        'redis_scan_keys',
        { connection: 'Cache local', pattern: 'orders:*' },
        {
          redis: (words) => (words[0] === 'SCAN' ? [bytes('0'), keys(0, 2)] : bytes('string')),
        },
      ),
    );
    expect(text).toContain('2 keys match orders:*, the scan is complete.');
    expect(text).toContain('- orders:1 · string');
    expect(text).not.toContain('Cursor');
  });

  it('says an empty answer of 20 calls is not the end', () => {
    const driven = drive(
      'redis_scan_keys',
      { connection: 'Cache local', pattern: 'orders:*' },
      {
        redis: () => [bytes('77'), []],
      },
    );
    const text = answerOf(driven);
    expect(driven.sent).toHaveLength(20);
    expect(text.split('\n')[0]).toBe('Cache local db0: no keys match orders:* so far, the scan is not finished.');
    expect(text).toContain('Cursor: 77');
  });

  it('lists whole pages, and gives back the starting cursor when they do not fit', () => {
    const long = (index: number) => bytes(`orders:${'x'.repeat(2000)}:${String(index)}`);
    const text = answerOf(
      drive(
        'redis_scan_keys',
        { connection: 'Cache local', pattern: 'orders:*', type: 'hash', cursor: '12', limit: 1 },
        {
          redis: () => [bytes('99'), Array.from({ length: 40 }, (_, index) => long(index))],
        },
      ),
    );
    expect(text).toMatch(
      /\d+ more keys didn't fit in the output: scan again from the same cursor with a smaller limit\.\nCursor: 12$/u,
    );
  });

  it('refuses a type it does not know and a cursor that is not digits', () => {
    expect(failureOf(drive('redis_scan_keys', { connection: 'Cache local', type: 'json' }))).toBe(
      'type must be one of string, hash, list, set, zset, stream.',
    );
    expect(failureOf(drive('redis_scan_keys', { connection: 'Cache local', cursor: 'abc' }))).toBe(
      'cursor must be the cursor returned by redis_scan_keys.',
    );
  });

  it('describes a hash: its type, encoding, fields, memory and expiry', () => {
    const driven = drive(
      'redis_key_details',
      { connection: 'Cache local', key: 'orders:42' },
      {
        redis: keyOf(
          'hash',
          (words) =>
            (
              ({ PTTL: 3_552_000, OBJECT: bytes('listpack'), MEMORY: 1229, HLEN: 12 }) as Readonly<
                Record<string, unknown>
              >
            )[words[0] ?? ''],
        ),
      },
    );
    expect(answerOf(driven)).toBe(
      [
        'orders:42 in db0 of Cache local',
        'Type: hash',
        'Encoding: listpack',
        'Fields: 12',
        'Memory: 1.2 KB',
        `Expiry: in 59 m 12 s (${new Date(now + 3_552_000).toISOString().replace(/\.\d{3}Z$/u, 'Z')})`,
      ].join('\n'),
    );
    expect(expiryLine(-1, now)).toBe('Expiry: none (the key is persistent)');
    onlyReads(driven);
  });

  it('refuses a key that does not exist in both tools', () => {
    const sentence = "The key orders:42 doesn't exist in db0 of Cache local: use redis_scan_keys.";
    const none = keyOf('none', (words) => (words[0] === 'PTTL' ? -2 : null));
    expect(
      failureOf(drive('redis_key_details', { connection: 'Cache local', key: 'orders:42' }, { redis: none })),
    ).toBe(sentence);
    expect(failureOf(drive('redis_read_value', { connection: 'Cache local', key: 'orders:42' }, { redis: none }))).toBe(
      sentence,
    );
  });

  it('gives the type of a module as the server names it, without a length, and refuses its value', () => {
    const module = keyOf(
      'ReJSON-RL',
      (words) =>
        (({ PTTL: -1, OBJECT: bytes('raw'), MEMORY: 300 }) as Readonly<Record<string, unknown>>)[words[0] ?? ''],
    );
    const text = answerOf(
      drive('redis_key_details', { connection: 'Cache local', key: 'orders:idx' }, { redis: module }),
    );
    expect(text).toContain('Type: ReJSON-RL');
    expect(text).not.toMatch(/Fields|Elements|Members|Entries|Bytes/u);
    expect(
      failureOf(drive('redis_read_value', { connection: 'Cache local', key: 'orders:idx' }, { redis: module })),
    ).toBe("The value of orders:idx (type ReJSON-RL) can't be read: Datardo doesn't show the values of module types.");
  });

  it('reads a string of 10,240 bytes in parts', () => {
    const value = 'a'.repeat(10_240);
    const string = keyOf('string', (words) => {
      if (words[0] === 'STRLEN') {
        return 10_240;
      }
      const from = Number(words[2]);
      return bytes(value.slice(from, Number(words[3]) + 1));
    });
    const first = answerOf(
      drive('redis_read_value', { connection: 'Cache local', key: 'orders:42:note' }, { redis: string }),
    );
    expect(first.split('\n')[0]).toBe('orders:42:note (string, 10,240 bytes), bytes 0–3,999:');
    expect(first.endsWith('Next: from 4000')).toBe(true);
    const last = answerOf(
      drive('redis_read_value', { connection: 'Cache local', key: 'orders:42:note', from: '8000' }, { redis: string }),
    );
    expect(last.endsWith('That is the end of the value.')).toBe(true);
  });

  it('reads a hash page by page, and shows 100 fields of a page returned whole', () => {
    const hash = keyOf('hash', (words) =>
      words[0] === 'HLEN' ? 512 : [bytes('96'), [bytes('status'), bytes('paid')]],
    );
    const text = answerOf(drive('redis_read_value', { connection: 'Cache local', key: 'orders:42' }, { redis: hash }));
    expect(text).toContain('- status: "paid"');
    expect(text.endsWith('Next: from 96')).toBe(true);
    const whole = keyOf('hash', (words) =>
      words[0] === 'HLEN'
        ? 512
        : [bytes('0'), Array.from({ length: 512 }, (_, index) => [bytes(`f${String(index)}`), bytes('v')]).flat()],
    );
    const all = answerOf(drive('redis_read_value', { connection: 'Cache local', key: 'orders:42' }, { redis: whole }));
    expect(all).toContain('412 more in this page are not shown: narrow them with match.');
    expect(all.endsWith('That is the end of the value.')).toBe(true);
  });

  it('reads a list, a sorted set and a stream', () => {
    const list = keyOf('list', (words) => (words[0] === 'LLEN' ? 1 : [bytes('a')]));
    expect(answerOf(drive('redis_read_value', { connection: 'Cache local', key: 'l' }, { redis: list }))).toContain(
      '- [0] "a"',
    );
    const zset = keyOf('zset', (words) => (words[0] === 'ZCARD' ? 1 : [bytes('ada'), bytes('12.5')]));
    expect(answerOf(drive('redis_read_value', { connection: 'Cache local', key: 'z' }, { redis: zset }))).toContain(
      '- "ada" · score 12.5',
    );
    const stream = keyOf('stream', (words) =>
      words[0] === 'XLEN'
        ? 1
        : [[bytes('1700000000000-0'), [bytes('status'), bytes('paid'), bytes('total'), bytes('42.50')]]],
    );
    expect(answerOf(drive('redis_read_value', { connection: 'Cache local', key: 's' }, { redis: stream }))).toContain(
      '- 1700000000000-0: { status: "paid", total: "42.50" }',
    );
  });

  it('returns a value that is not UTF-8 as hex', () => {
    const list = keyOf('list', (words) => (words[0] === 'LLEN' ? 1 : [new Uint8Array([0xff, 0xfe])]));
    const text = answerOf(drive('redis_read_value', { connection: 'Cache local', key: 'l' }, { redis: list }));
    expect(text).toContain('- [0] hex:fffe');
  });

  it('refuses match on other types and a from it cannot read', () => {
    const list = keyOf('list', () => 0);
    expect(
      failureOf(drive('redis_read_value', { connection: 'Cache local', key: 'l', match: 'a*' }, { redis: list })),
    ).toBe('match is for hashes and sets.');
    expect(
      failureOf(drive('redis_read_value', { connection: 'Cache local', key: 'l', from: 'x' }, { redis: list })),
    ).toBe('from must be a whole number for a string, a list or a sorted set.');
    const stream = keyOf('stream', () => 0);
    expect(
      failureOf(drive('redis_read_value', { connection: 'Cache local', key: 's', from: 'x' }, { redis: stream })),
    ).toBe('from must be an entry ID like 1700000000000-0 for a stream.');
  });

  it('offers the scan and the details without readData, not the value', () => {
    const offered = toolsOffered(mcpState({ settings: { 'datardo.mcp.readData': false } }).settings).map(
      (tool) => tool.name,
    );
    expect(offered).toContain('redis_scan_keys');
    expect(offered).toContain('redis_key_details');
    expect(offered).not.toContain('redis_read_value');
  });
});
