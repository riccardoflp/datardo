import { describe, expect, it } from 'vitest';
import { exportFileText, exportText } from '../../../src/features/key/export-text';
import { name } from './context';
import { exampleFile, exampleKeys } from './example';

describe('key.export-text', () => {
  it('gives the keys of the example exactly the six lines of the card', () => {
    expect(exportFileText(exampleKeys)).toBe(`${exampleFile}\n`);
  });

  it('writes a hash of 250 fields as three HSET lines, of 100, 100 and 50 pairs', () => {
    const pairs = Array.from({ length: 250 }, (_, index) => [name(`f${String(index)}`), name('v')] as const);
    const lines = exportText({ name: name('h'), value: { type: 'hash', pairs } });
    expect(lines.map((line) => (line.split(' ').length - 2) / 2)).toEqual([100, 100, 50]);
    expect(lines.every((line) => line.startsWith('HSET h '))).toBe(true);
  });

  it('writes a string of 2,500,000 bytes as one SET and two APPEND lines', () => {
    const lines = exportText({ name: name('big'), value: { type: 'string', bytes: new Uint8Array(2_500_000) } });
    expect(lines.map((line) => line.split(' ')[0])).toEqual(['SET', 'APPEND', 'APPEND']);
  });

  it('writes a value with a line feed with \\n, on one line', () => {
    const lines = exportText({ name: name('s'), value: { type: 'string', bytes: name('one\ntwo') } });
    expect(lines).toEqual(['SET s "one\\ntwo"']);
  });

  it('writes no PEXPIREAT line for a persistent key', () => {
    const lines = exportText({ name: name('s'), value: { type: 'string', bytes: name('x') } });
    expect(lines.some((line) => line.startsWith('PEXPIREAT'))).toBe(false);
  });

  it('writes a member with the score inf as ZADD board inf ada', () => {
    const lines = exportText({ name: name('board'), value: { type: 'zset', members: [[name('ada'), 'inf']] } });
    expect(lines).toEqual(['ZADD board inf ada']);
  });

  it('writes a key of a module type, and a stream without entries, as RESTORE with the payload of DUMP', () => {
    const lines = exportText({ name: name('doc'), value: { type: 'dump', payload: Uint8Array.of(7, 0x41) } });
    expect(lines).toEqual(['RESTORE doc 0 "\\x07A"']);
  });
});
