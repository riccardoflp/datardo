import { describe, expect, it } from 'vitest';
import * as list from '../../../src/features/gridfs/list';
import * as preview from '../../../src/features/gridfs/preview';
import { fileOf, type JsonRecord } from '../../../src/features/gridfs/types';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, gridFile, local, logoId, mongoRequests, recorded, refusalOf } from './context';

const context = contextOn('gridfs.list');
const bucket = { connection: local.id, database: 'shop', bucket: 'fs' };

describe('gridfs.list', () => {
  it('sends the first page sorted by the newest first, and the totals', () => {
    const [find, totals] = mongoRequests(list.request(context, { ...bucket, filter: '', page: 0 }));
    expect(find).toMatchObject({
      database: 'shop',
      collection: 'fs.files',
      method: 'find',
      arguments: [
        {},
        {
          sort: { uploadDate: { $numberInt: '-1' }, _id: { $numberInt: '-1' } },
          skip: { $numberInt: '0' },
          limit: { $numberInt: '100' },
        },
      ],
      limit: 100,
    });
    expect(totals).toMatchObject({
      collection: 'fs.files',
      method: 'aggregate',
      arguments: [
        [{ $match: {} }, { $group: { _id: null, n: { $sum: { $numberInt: '1' } }, bytes: { $sum: '$length' } } }],
      ],
    });
  });

  it('sends the second page sorted by name ascending', () => {
    const [find] = mongoRequests(
      list.request(context, { ...bucket, filter: '', sort: 'filename', descending: false, page: 1 }),
    );
    expect(find?.arguments[1]).toEqual({
      sort: { filename: { $numberInt: '1' }, _id: { $numberInt: '1' } },
      skip: { $numberInt: '100' },
      limit: { $numberInt: '100' },
    });
  });

  it('puts the filter in both the find and the $match', () => {
    const [find, totals] = mongoRequests(list.request(context, { ...bucket, filter: 'logo', page: 0 }));
    const filter = { filename: { $regex: 'logo', $options: 'i' } };
    expect(find?.arguments[0]).toEqual(filter);
    expect((totals?.arguments[0] as readonly JsonRecord[])[0]).toEqual({ $match: filter });
  });

  it('refuses a filter that cannot be read', () => {
    expect(refusalOf(list.request(context, { ...bucket, filter: '{ length: ', page: 0 }) as never).code).toBe(
      'gridfs.list/filter',
    );
  });

  it('takes the type from the metadata, else from the top of the document', () => {
    const { files } = list.parse([recorded('files-page'), recorded('files-totals')]);
    expect(files.map((file) => [file.filename, file.contentType])).toEqual([
      ['notes.txt', 'text/plain'],
      ['README', undefined],
      ['old.gif', 'image/gif'],
      ['blob', undefined],
    ]);
    expect(fileOf({ ...files[2]?.document, metadata: { contentType: 'image/png' } }).contentType).toBe('image/png');
  });

  it('returns an _id that is a string, a number or a UUID with its type', () => {
    const { files, total, bytes } = list.parse([recorded('files-page'), recorded('files-totals')]);
    expect(files.map((file) => file.id)).toEqual([
      logoId,
      'readme',
      { $numberInt: '7' },
      { $binary: { base64: 'ASNFZ4mrze8BI0VniavN7w==', subType: '04' } },
    ]);
    expect(files.map((file) => file.idText)).toEqual([
      'ObjectId("65f1c0ffee0000000000a2c1")',
      '"readme"',
      '7',
      'UUID("01234567-89ab-cdef-0123-456789abcdef")',
    ]);
    expect([total, bytes]).toEqual([4, 28]);
    expect(files[0]).toMatchObject({ length: 15, chunkSize: 8, uploadDate: Date.UTC(2026, 10, 18, 13, 2, 11) });
    const [find] = mongoRequests(list.fileRead.request(context, list.fileReadArgs(bucket, files[3]?.id ?? null)));
    expect(find?.arguments).toEqual([{ _id: files[3]?.id }]);
  });

  it('returns no file, 0 files and 0 bytes for an empty bucket', () => {
    expect(list.parse([recorded('empty-files-page'), recorded('empty-totals')])).toEqual({
      files: [],
      total: 0,
      bytes: 0,
    });
  });

  it('reads the last page again when the one asked is beyond the end', () => {
    expect(list.pageToReadAgain(12, { files: [], total: 1200, bytes: 0 })).toBe(11);
    expect(list.pageToReadAgain(0, { files: [], total: 0, bytes: 0 })).toBeUndefined();
  });

  it('reads one file by its _id, and null once it is gone', () => {
    expect(list.fileRead.parse([recorded('findOne')], null)).toMatchObject({ filename: 'notes.txt', id: logoId });
    expect(list.fileRead.parse([recorded('findOne-missing')], null)).toBeNull();
  });
});

/** A files document of `bytes` bytes, with chunks of 255 KB. */
function document(filename: string, length: number, contentType?: string): JsonRecord {
  return {
    _id: logoId,
    filename,
    length: { $numberLong: String(length) },
    chunkSize: { $numberInt: '261120' },
    ...(contentType === undefined ? {} : { metadata: { contentType } }),
  };
}

/** The chunks of bytes, each of 255 KB, as the server returns them. */
function chunksOf(bytes: Uint8Array): readonly Json[] {
  const chunks: Json[] = [];
  for (let n = 0; n * 261_120 < bytes.length; n += 1) {
    const part = bytes.subarray(n * 261_120, (n + 1) * 261_120);
    chunks.push({ n: { $numberInt: String(n) }, data: { $binary: { base64: preview.base64Of(part), subType: '00' } } });
  }
  return chunks;
}

/** The preview of a file of these bytes, through both rounds of the read. */
function previewOf(files: JsonRecord, bytes: Uint8Array): preview.Preview {
  const args = { ...bucket, id: logoId };
  const first = preview.parse([files], args);
  if (first.kind === 'preview') {
    return first.preview;
  }
  const second = preview.chunksRoundArgs(args, first.file);
  const wanted = (mongoRequests(preview.request(context, second))[0]?.limit ?? 0) * 261_120;
  const result = preview.parse([chunksOf(bytes.subarray(0, wanted))], second);
  if (result.kind !== 'preview') {
    throw new Error('Expected a preview');
  }
  return result.preview;
}

function filled(length: number, byte: number): Uint8Array {
  return new Uint8Array(length).fill(byte);
}

describe('gridfs.preview', () => {
  it('reads the files document, then the chunks of the file sorted by n', () => {
    const args = { ...bucket, id: logoId };
    expect(mongoRequests(preview.request(context, args))[0]).toMatchObject({
      collection: 'fs.files',
      method: 'findOne',
      arguments: [{ _id: logoId }],
    });
    const first = preview.parse([recorded('findOne')], args);
    if (first.kind !== 'chunks') {
      throw new Error('Expected the chunks to be read');
    }
    const chunks = mongoRequests(preview.request(context, preview.chunksRoundArgs(args, first.file)))[0];
    expect(chunks).toMatchObject({ collection: 'fs.chunks', method: 'find', limit: 2 });
    expect(chunks?.arguments[0]).toEqual({ files_id: logoId });
    const done = preview.parse([recorded('chunks')], preview.chunksRoundArgs(args, first.file));
    expect(done).toEqual({ kind: 'preview', preview: { kind: 'text', text: 'Hello, GridFS!\n', cut: false } });
  });

  it('says the file no longer exists', () => {
    expect(preview.parse([recorded('findOne-missing')], { ...bucket, id: logoId })).toEqual({
      kind: 'preview',
      preview: { kind: 'gone', message: 'The file no longer exists.' },
    });
  });

  it('gives the results of the examples', () => {
    const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
    expect(previewOf(document('logo.png', 12_288, 'image/png'), filled(12_288, 1)).kind).toBe('image');
    expect(previewOf(document('scan.png', 5 * 1_048_576), new Uint8Array())).toEqual({
      kind: 'too-large',
      message: 'The image is larger than 4.0 MB: Open shows it.',
    });
    expect(previewOf(document('notes.txt', 1024), filled(1024, 0x61))).toMatchObject({ kind: 'text', cut: false });
    expect(previewOf(document('data.json', 3_355_443, 'application/json'), filled(3_355_443, 0x20))).toMatchObject({
      kind: 'text',
      cut: true,
      note: 'The first 256 KB of 3.2 MB: Open shows the whole file.',
    });
    const csv = Uint8Array.from([0x61, 0xff, 0x62]);
    expect(previewOf(document('export.csv', 3, 'text/csv'), csv)).toMatchObject({ kind: 'text', text: 'a�b' });
    expect(previewOf(document('README', 6), utf8('Hello\n'))).toMatchObject({ kind: 'text', text: 'Hello\n' });
    expect(previewOf(document('blob', 4), Uint8Array.from([0, 1, 2, 3]))).toMatchObject({
      kind: 'binary',
      title: 'Binary file',
      cut: false,
    });
    expect(previewOf(document('latin1.dat', 3), Uint8Array.from([0x63, 0xe9, 0x74]))).toMatchObject({ kind: 'binary' });
    const zip = previewOf(document('archive.zip', 2_097_152, 'application/zip'), filled(2_097_152, 0));
    expect(zip).toMatchObject({ kind: 'binary', title: 'Binary file: the first 512 bytes', cut: true });
    expect(zip.kind === 'binary' ? zip.hex.split('\n') : []).toHaveLength(32);
    expect(previewOf(document('empty', 0), new Uint8Array())).toEqual({ kind: 'text', text: '', cut: false });
  });

  it('reads two chunks of data.json of 3.2 MB and no more', () => {
    expect(
      preview.chunksWanted(
        gridFile({
          filename: 'data.json',
          length: { $numberLong: '3355443' },
          metadata: { contentType: 'application/json' },
        }),
      ),
    ).toBe(2);
  });

  it('ends a text cut in the middle of é before it', () => {
    const bytes = new Uint8Array(262_145).fill(0x61);
    bytes[262_143] = 0xc3;
    bytes[262_144] = 0xa9;
    const shown = previewOf(document('notes.txt', 262_145, 'text/plain'), bytes);
    expect(shown.kind === 'text' ? shown.text.endsWith('a') && !shown.text.includes('�') : false).toBe(true);
    expect(shown.kind === 'text' ? shown.text.length : 0).toBe(262_143);
  });

  it('shows an image of exactly 4 MB, and does not read one byte more', () => {
    expect(previewOf(document('big.png', 4_194_304, 'image/png'), filled(4_194_304, 7)).kind).toBe('image');
    expect(previewOf(document('big.png', 4_194_305, 'image/png'), new Uint8Array()).kind).toBe('too-large');
  });

  it('gives an SVG as an image of its type only', () => {
    const svg = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');
    expect(previewOf(document('picture.svg', svg.length), svg)).toMatchObject({
      kind: 'image',
      contentType: 'image/svg+xml',
    });
  });

  it('works on a read-only connection: it is a read', () => {
    expect(preview.feature.kind).toBe('read');
  });
});
