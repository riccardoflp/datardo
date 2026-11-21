/**
 * The console's own reading of RESP2 and RESP3 (`console.reply`, `console.connect`): every type kept apart, a reply
 * read across chunks, a string cut at 16 MB, and a command written as an array of bulk strings.
 */
import { describe, expect, it } from 'vitest';
import { encodeCommand, keptReplyBytes, RespReader } from '../../../src/engines/redis/resp';
import { redisReplyOf, type TypedReply } from '../../../src/shared/typed-reply';

const encoder = new TextEncoder();

function read(...chunks: readonly string[]): readonly TypedReply[] {
  const reader = new RespReader();
  return chunks.flatMap((chunk) => reader.push(Buffer.from(chunk, 'latin1')).map((each) => each.reply));
}

function bulk(text: string): TypedReply {
  return { kind: 'bulk', bytes: encoder.encode(text) };
}

describe('console.reply', () => {
  it('keeps a simple string apart from a bulk string, and an integer as a 64-bit integer', () => {
    expect(read('+OK\r\n$2\r\nOK\r\n:9007199254740993\r\n')).toEqual([
      { kind: 'simple', text: 'OK' },
      bulk('OK'),
      { kind: 'integer', value: 9007199254740993n },
    ]);
  });

  it('reads the nil of RESP2 and RESP3, an error, a double, a boolean and a big number', () => {
    expect(read('$-1\r\n*-1\r\n_\r\n-ERR no\r\n,3.5\r\n,inf\r\n#t\r\n(12345678901234567890\r\n')).toEqual([
      { kind: 'null' },
      { kind: 'null' },
      { kind: 'null' },
      { kind: 'error', message: 'ERR no' },
      { kind: 'double', value: 3.5 },
      { kind: 'double', value: Infinity },
      { kind: 'boolean', value: true },
      { kind: 'big-number', digits: '12345678901234567890' },
    ]);
  });

  it('keeps a set apart from an array, and a map as its entries in order', () => {
    expect(read('*2\r\n$1\r\na\r\n:1\r\n~1\r\n$1\r\nb\r\n%1\r\n$1\r\nk\r\n$1\r\nv\r\n')).toEqual([
      { kind: 'array', items: [bulk('a'), { kind: 'integer', value: 1n }] },
      { kind: 'set', items: [bulk('b')] },
      { kind: 'map', entries: [[bulk('k'), bulk('v')]] },
    ]);
  });

  it('reads a verbatim string with its format, and a reply cut across chunks', () => {
    expect(read('=15\r\ntxt:Some string\r\n')).toEqual([{ kind: 'verbatim', format: 'txt', text: 'Some string' }]);
    expect(read('*2\r\n$5\r\nhel', 'lo\r\n:4', '2\r\n')).toEqual([
      { kind: 'array', items: [bulk('hello'), { kind: 'integer', value: 42n }] },
    ]);
  });

  it('keeps the bytes of a string that is not text as they are', () => {
    const [reply] = read('$3\r\n\u0000ÿA\r\n');
    expect(reply).toEqual({ kind: 'bulk', bytes: new Uint8Array([0, 255, 65]) });
  });

  it('cuts a string longer than 16 MB, and says how many bytes the server sent', () => {
    const size = keptReplyBytes + 10;
    const reader = new RespReader();
    const replies = reader.push(
      Buffer.concat([Buffer.from(`$${String(size)}\r\n`), Buffer.alloc(size, 120), Buffer.from('\r\n')]),
    );
    expect(replies).toHaveLength(1);
    const [first] = replies;
    expect(first?.bytes).toBeGreaterThan(keptReplyBytes);
    expect(first?.reply.kind === 'bulk' ? first.reply.bytes.length : 0).toBe(keptReplyBytes);
  });

  it('writes a command as an array of bulk strings, never as a line', () => {
    expect(encodeCommand([encoder.encode('SET'), encoder.encode('a b')]).toString('latin1')).toBe(
      '*2\r\n$3\r\nSET\r\n$3\r\na b\r\n',
    );
  });

  it('gives what reads through the console the shape of the ordinary clients', () => {
    expect(
      redisReplyOf({
        kind: 'array',
        items: [
          { kind: 'simple', text: 'OK' },
          { kind: 'integer', value: 2n },
        ],
      }),
    ).toEqual([encoder.encode('OK'), 2]);
    expect(redisReplyOf({ kind: 'error', message: 'NOPERM' })).toEqual({ kind: 'error', message: 'NOPERM' });
  });
});
