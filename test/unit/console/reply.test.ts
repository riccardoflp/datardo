import { describe, expect, it } from 'vitest';
import { commandArguments } from '../../../src/features/console/parse-line';
import { replyLines, type ReplyLine } from '../../../src/features/console/reply';
import type { Protocol, Reply } from '../../../src/features/console/types';
import { bulk, bytes, simple, words } from './context';

function texts(reply: Reply, command = 'GET k', protocol: Protocol = 3): readonly string[] {
  const read = commandArguments(command);
  return replyLines(reply, read.kind === 'arguments' ? read.arguments : [], protocol).map((line) => line.text);
}

function kinds(lines: readonly ReplyLine[]): readonly string[] {
  return lines.map((line) => line.kind);
}

const integer = (value: bigint): Reply => ({ kind: 'integer', value });

describe('console.reply', () => {
  it('gives each row of the table its lines', () => {
    expect(texts({ kind: 'null' }, 'GET missing')).toEqual(['(nil)']);
    expect(texts(bulk(''), 'GET empty')).toEqual(['""']);
    expect(texts(bulk('nil'), 'GET word')).toEqual(['"nil"']);
    expect(texts(integer(42n), 'INCR counter')).toEqual(['(integer) 42']);
    expect(texts(simple('OK'), 'SET greeting hi')).toEqual(['OK']);
    expect(texts(bulk('hello world'), 'GET greeting')).toEqual(['"hello world"']);
    expect(texts(bulk('café'), 'GET name')).toEqual(['"café"']);
    expect(texts(bulk('line1\nline2'), 'GET text')).toEqual(['"line1\\nline2"']);
    expect(texts(bulk('{"a":"b"}'), 'GET json')).toEqual(['"{\\"a\\":\\"b\\"}"']);
    expect(texts({ kind: 'bulk', bytes: bytes(0x00, 0xff, 0x41) }, 'GET bin')).toEqual(['"\\x00\\xffA"']);
    expect(texts({ kind: 'array', items: [bulk('a'), bulk('b')] }, 'LRANGE queue 0 -1')).toEqual(['1) "a"', '2) "b"']);
    expect(texts({ kind: 'array', items: [] }, 'LRANGE queue 0 -1')).toEqual(['(empty array)']);
    const customer: Reply = {
      kind: 'map',
      entries: [
        [bulk('name'), bulk('Ada')],
        [bulk('age'), bulk('36')],
      ],
    };
    expect(texts(customer, 'HGETALL customer:1')).toEqual(['1# "name" => "Ada"', '2# "age" => "36"']);
    const flat: Reply = { kind: 'array', items: [bulk('name'), bulk('Ada'), bulk('age'), bulk('36')] };
    expect(texts(flat, 'HGETALL customer:1', 2)).toEqual(['1) "name"', '2) "Ada"', '3) "age"', '4) "36"']);
    expect(texts({ kind: 'set', items: [bulk('red'), bulk('blue')] }, 'SMEMBERS tags')).toEqual([
      '1~ "red"',
      '2~ "blue"',
    ]);
    expect(texts({ kind: 'double', value: 12.5 }, 'ZSCORE board ada')).toEqual(['(double) 12.5']);
    expect(texts(bulk('12.5'), 'ZSCORE board ada', 2)).toEqual(['"12.5"']);
    expect(texts({ kind: 'array', items: [simple('OK'), integer(2n)] }, 'EXEC')).toEqual(['1) OK', '2) (integer) 2']);
    const wrongType = 'WRONGTYPE Operation against a key holding the wrong kind of value';
    expect(texts({ kind: 'error', message: wrongType }, 'LPUSH greeting x')).toEqual([`(error) ${wrongType}`]);
    const info = '# Server\r\nredis_version:7.2.4\r\n';
    expect(texts({ kind: 'verbatim', format: 'txt', text: info }, 'INFO server')).toEqual([
      '# Server',
      'redis_version:7.2.4',
    ]);
  });

  it('writes the bulk string of INFO on RESP2 as a verbatim string, and other bulk strings in quotes', () => {
    const info = bulk('# Server\r\nredis_version:6.2.14\r\n');
    expect(texts(info, 'INFO server', 2)).toEqual(['# Server', 'redis_version:6.2.14']);
    expect(texts(bulk('id=3 addr=x\n'), 'client list', 2)).toEqual(['id=3 addr=x']);
    expect(texts(bulk('a\nb'), 'GET k', 2)).toEqual(['"a\\nb"']);
  });

  it('writes the RESP3 types apart: booleans, big numbers, infinities, nan, push', () => {
    expect(texts({ kind: 'boolean', value: true })).toEqual(['(true)']);
    expect(texts({ kind: 'boolean', value: false })).toEqual(['(false)']);
    expect(texts({ kind: 'big-number', digits: '3492890328409238509324850943850943825024385' })).toEqual([
      '(big number) 3492890328409238509324850943850943825024385',
    ]);
    expect(texts({ kind: 'double', value: Infinity })).toEqual(['(double) inf']);
    expect(texts({ kind: 'double', value: -Infinity })).toEqual(['(double) -inf']);
    expect(texts({ kind: 'double', value: NaN })).toEqual(['(double) nan']);
    expect(texts({ kind: 'push', items: [bulk('message'), bulk('orders'), bulk('hi')] })).toEqual([
      '(push) 1) "message"',
      '       2) "orders"',
      '       3) "hi"',
    ]);
    expect(texts({ kind: 'map', entries: [] })).toEqual(['(empty map)']);
    expect(texts({ kind: 'set', items: [] })).toEqual(['(empty set)']);
  });

  it('nests an element under the value of its parent', () => {
    const scan: Reply = {
      kind: 'array',
      items: [{ kind: 'array', items: [bulk('orders:1'), integer(3n)] }, { kind: 'null' }],
    };
    expect(texts(scan)).toEqual(['1) 1) "orders:1"', '   2) (integer) 3', '2) (nil)']);
  });

  it('reads back the same bytes from the line of a bulk string, through console.parse-line', () => {
    const values = [bytes(0x00, 0xff, 0x41), bytes(0x22, 0x5c, 0x0a, 0x7f), new TextEncoder().encode('é\u0001\t"\\')];
    for (const value of values) {
      const [line = ''] = texts({ kind: 'bulk', bytes: value });
      const read = commandArguments(`SET copy ${line}`);
      expect(read.kind === 'arguments' ? read.arguments : []).toEqual([...words('SET', 'copy'), value]);
    }
  });

  it('writes an integer of 64 bits exactly', () => {
    expect(texts(integer(9223372036854775807n), 'INCRBY big 9223372036854775806')).toEqual([
      '(integer) 9223372036854775807',
    ]);
  });

  it('numbers an array of 12 elements from " 1)" to "12)", aligned to the right', () => {
    const lines = texts({ kind: 'array', items: Array.from({ length: 12 }, (_, index) => integer(BigInt(index))) });
    expect(lines[0]).toBe(' 1) (integer) 0');
    expect(lines[11]).toBe('12) (integer) 11');
  });

  it('writes an error inside the array of EXEC as (error) on its line, in the error color', () => {
    const exec: Reply = {
      kind: 'array',
      items: [simple('OK'), { kind: 'error', message: 'ERR value is not an integer or out of range' }, integer(1n)],
    };
    const read = commandArguments('EXEC');
    const lines = replyLines(exec, read.kind === 'arguments' ? read.arguments : [], 3);
    expect(lines.map((line) => line.text)).toEqual([
      '1) OK',
      '2) (error) ERR value is not an integer or out of range',
      '3) (integer) 1',
    ]);
    expect(kinds(lines)).toEqual(['value', 'error', 'value']);
  });

  it('gives each line the strings it shows, for Copy value', () => {
    const read = commandArguments('HGETALL customer:1');
    const lines = replyLines(
      { kind: 'map', entries: [[bulk('name'), bulk('Ada')]] },
      read.kind === 'arguments' ? read.arguments : [],
      3,
    );
    expect(lines[0]?.strings.map((each) => new TextDecoder().decode(each))).toEqual(['name', 'Ada']);
  });
});
