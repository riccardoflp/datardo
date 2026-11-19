import { describe, expect, it } from 'vitest';
import { bucketNames, bucketTooltip } from '../../../src/features/gridfs/buckets';
import { contentTypeOf } from '../../../src/features/gridfs/content-type';
import { filesFilter } from '../../../src/features/gridfs/filter';
import { hexDump } from '../../../src/features/gridfs/hex-dump';
import { sizeText } from '../../../src/features/gridfs/size-text';
import { now } from './context';

describe('gridfs.buckets', () => {
  it.each([
    [['orders', 'fs.files', 'fs.chunks'], ['fs']],
    [
      ['photos.files', 'photos.chunks', 'fs.chunks', 'fs.files'],
      ['fs', 'photos'],
    ],
    [['media.thumbs.files', 'media.thumbs.chunks'], ['media.thumbs']],
    [['fs.files'], []],
    [['fs.chunks', 'files', 'chunks'], []],
  ])('finds in %j the buckets %j', (collections, buckets) => {
    expect(bucketNames(collections)).toEqual(buckets);
  });

  it('describes a bucket in the tree', () => {
    expect(bucketTooltip('shop', 'fs')).toBe('GridFS bucket shop.fs (fs.files and fs.chunks)');
  });
});

describe('gridfs.filter', () => {
  it.each([
    ['', {}],
    ['logo', { filename: { $regex: 'logo', $options: 'i' } }],
    ['logo.png', { filename: { $regex: 'logo\\.png', $options: 'i' } }],
    ['a+b (1)', { filename: { $regex: 'a\\+b \\(1\\)', $options: 'i' } }],
    ['{ "metadata.contentType": "image/png" }', { 'metadata.contentType': 'image/png' }],
    ['{ length: { $gt: 1048576 } }', { length: { $gt: { $numberInt: '1048576' } } }],
    [
      '{ uploadDate: { $gte: ISODate("2026-11-01") } }',
      { uploadDate: { $gte: { $date: { $numberLong: String(Date.UTC(2026, 10, 1)) } } } },
    ],
  ])('reads %s as its filter', (typed, filter) => {
    expect(filesFilter(typed, now)).toEqual({ ok: true, filter });
  });

  it('gives Filter: and the error of the parser for a text that cannot be read', () => {
    const read = filesFilter('{ length: ', now);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.message).toMatch(/^Filter: ./);
  });

  it('finds logo.png and Logo-old.png with LOGO, and not logoXpng with logo.png', () => {
    const regex = (typed: string): RegExp => {
      const read = filesFilter(typed, now);
      const filter = read.ok ? (read.filter as { filename: { $regex: string } }) : undefined;
      return new RegExp(filter?.filename.$regex ?? '', 'i');
    };
    expect(['logo.png', 'Logo-old.png', 'other.png'].filter((name) => regex('LOGO').test(name))).toEqual([
      'logo.png',
      'Logo-old.png',
    ]);
    expect(regex('logo.png').test('logoXpng')).toBe(false);
  });
});

describe('gridfs.size-text', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [10_199, '10.0 KB'],
    [10_240, '10 KB'],
    [261_120, '255 KB'],
    [734_003, '717 KB'],
    [4_194_304, '4.0 MB'],
    [2_254_857_830, '2.1 GB'],
  ])('writes %i bytes as %s', (bytes, shown) => {
    expect(sizeText(bytes)).toBe(shown);
  });
});

describe('gridfs.hex-dump', () => {
  it('writes the 16 bytes of a PNG header on one line', () => {
    const bytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    expect(hexDump(bytes)).toBe('00000000  89 50 4e 47 0d 0a 1a 0a 00 00 00 0d 49 48 44 52  .PNG........IHDR');
  });

  it('pads the bytes of Hi! to 47 characters', () => {
    expect(hexDump(new TextEncoder().encode('Hi!'))).toBe(`00000000  48 69 21${' '.repeat(39)}  Hi!`);
  });

  it('writes 20 bytes on two lines, and 512 bytes on 32, the last at 000001f0', () => {
    const twenty = hexDump(new Uint8Array(20)).split('\n');
    expect(twenty).toHaveLength(2);
    expect(twenty[1]?.startsWith('00000010')).toBe(true);
    const lines = hexDump(new Uint8Array(512)).split('\n');
    expect(lines).toHaveLength(32);
    expect(lines[31]?.startsWith('000001f0')).toBe(true);
    expect(hexDump(new Uint8Array())).toBe('');
  });

  it('shows 31, 32, 126 and 127 as ., a space, ~ and .', () => {
    expect(hexDump(Uint8Array.from([31, 32, 126, 127])).endsWith('  . ~.')).toBe(true);
  });
});

describe('gridfs.content-type', () => {
  it.each([
    ['a.txt', 'text/plain'],
    ['a.log', 'text/plain'],
    ['a.ts', 'text/plain'],
    ['a.md', 'text/markdown'],
    ['a.csv', 'text/csv'],
    ['a.html', 'text/html'],
    ['a.htm', 'text/html'],
    ['a.css', 'text/css'],
    ['a.js', 'text/javascript'],
    ['a.mjs', 'text/javascript'],
    ['a.json', 'application/json'],
    ['a.xml', 'application/xml'],
    ['a.yaml', 'application/yaml'],
    ['a.yml', 'application/yaml'],
    ['a.svg', 'image/svg+xml'],
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.jpeg', 'image/jpeg'],
    ['a.gif', 'image/gif'],
    ['a.webp', 'image/webp'],
    ['a.bmp', 'image/bmp'],
    ['a.ico', 'image/x-icon'],
    ['a.pdf', 'application/pdf'],
    ['a.zip', 'application/zip'],
    ['a.gz', 'application/gzip'],
    ['a.mp3', 'audio/mpeg'],
    ['a.mp4', 'video/mp4'],
    ['a.wav', 'audio/wav'],
    ['logo.PNG', 'image/png'],
    ['backup.tar.gz', 'application/gzip'],
    ['Makefile', undefined],
    ['.gitignore', undefined],
    ['photo.heic', undefined],
    ['constructor.toString', undefined],
  ])('gives %s the type %s', (name, type) => {
    expect(contentTypeOf(name)).toBe(type);
  });
});
