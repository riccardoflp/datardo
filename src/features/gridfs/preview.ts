/**
 * Feature: gridfs.preview
 *
 * Reads as much of a file as a preview needs, and decides whether it is an image, a text or binary. It is read in two
 * rounds: first `db.fs.files.findOne({ _id: … })`, the files document as it is now, then, started again with that
 * document as `args.file`, `db.fs.chunks.find({ files_id: … }).sort({ n: 1 })` limited to the chunks that hold the
 * bytes wanted: all of them for an image, those of the first 262,144 bytes otherwise. Nothing is read of a file of 0
 * bytes, nor of an image of more than 4,194,304 bytes; the first round then gives the preview at once. Started with
 * `{ connection, database, bucket, id, file }`. Ported from Mongoster's `preview`, `trimUtf8`, `IMAGE_TYPES` and
 * `isTextType`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { numberOf } from '../document/write/values';
import { contentTypeOf } from './content-type';
import { hexDump } from './hex-dump';
import { listArgs } from './list';
import { sizeText } from './size-text';
import { text } from './text';
import { bucketRequest, fileOf, isRecord, textOf, type GridFile, type JsonRecord } from './types';

/** The bytes of a text or a binary file that are read: 256 KB. */
export const previewBytes = 262_144;

/** The largest image that is read whole: 4 MB. */
export const largestImage = 4_194_304;

/** The bytes looked at for a zero byte, to tell a text from binary when the type does not say. */
export const sniffedBytes = 8_192;

/** The bytes of a binary file shown as hex. */
export const hexBytes = 512;

/** The types shown as an image: an SVG among them is shown as a picture only, nothing in it is run or loaded. */
export const imageTypes: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
  'image/svg+xml',
]);

/** What the inspector shows of a file. */
export type Preview =
  | { readonly kind: 'gone'; readonly message: string }
  | { readonly kind: 'too-large'; readonly message: string }
  /** The whole image, its bytes as base64, to be shown as a picture of its type and nothing else. */
  | { readonly kind: 'image'; readonly contentType: string; readonly base64: string }
  /** A text, cut after the bytes read when the file has more; `note` says so. */
  | { readonly kind: 'text'; readonly text: string; readonly cut: boolean; readonly note?: string }
  /** The hex dump of the first 512 bytes, under its title. */
  | { readonly kind: 'binary'; readonly title: string; readonly hex: string; readonly cut: boolean };

/** What a round answers: the preview, or the files document to read the chunks of. */
export type PreviewRead =
  { readonly kind: 'preview'; readonly preview: Preview } | { readonly kind: 'chunks'; readonly file: JsonRecord };

/** The type of a file: the one its files document declares, else the one of its extension (`gridfs.content-type`). */
export function previewType(file: GridFile): string | undefined {
  return file.contentType ?? contentTypeOf(file.filename);
}

/** Whether a type is a text type: it starts with `text/`, or has `json`, `xml`, `yaml` or `javascript` in it. */
export function isTextType(type: string | undefined): boolean {
  return type !== undefined && (type.startsWith('text/') || /json|xml|yaml|javascript/u.test(type));
}

/** How many bytes of the file are read: all of an image, the first 256 KB of anything else. */
export function bytesWanted(file: GridFile): number {
  const type = previewType(file);
  return type !== undefined && imageTypes.has(type) ? file.length : Math.min(file.length, previewBytes);
}

/** How many chunks hold the bytes wanted: for a file with chunks of 255 KB, 2 for its first 256 KB. */
export function chunksWanted(file: GridFile): number {
  const wanted = bytesWanted(file);
  return wanted === 0 || file.chunkSize <= 0 ? 0 : Math.ceil(wanted / file.chunkSize);
}

/** The preview the files document gives without its chunks: none of a file of 0 bytes, none of a large image. */
export function previewWithoutChunks(file: GridFile): Preview | undefined {
  if (file.length === 0) {
    return { kind: 'text', text: '', cut: false };
  }
  const type = previewType(file);
  if (type !== undefined && imageTypes.has(type) && file.length > largestImage) {
    return { kind: 'too-large', message: text.inspector.tooLarge(sizeText(largestImage)) };
  }
  return undefined;
}

function fileOfArgs(args: Json): JsonRecord | undefined {
  const file = isRecord(args) ? args['file'] : undefined;
  return isRecord(file) ? file : undefined;
}

/** Feature: gridfs.preview — the files document, or the chunks that hold the bytes wanted. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = listArgs(args);
  const document = fileOfArgs(args);
  if (document === undefined) {
    const id = isRecord(args) ? (args['id'] ?? null) : null;
    return {
      kind: 'engine',
      requests: [
        {
          connection: asked.connection,
          request: bucketRequest(asked, 'files', { method: 'findOne', arguments: [{ _id: id }] }),
        },
      ],
    };
  }
  const file = fileOf(document);
  const wanted = chunksWanted(file);
  const options = { sort: { n: { $numberInt: '1' } }, limit: { $numberInt: String(wanted) } };
  return {
    kind: 'engine',
    requests: [
      {
        connection: asked.connection,
        request: bucketRequest(asked, 'chunks', {
          method: 'find',
          arguments: [{ files_id: file.id }, options],
          limit: wanted,
        }),
      },
    ],
  };
}

/** The bytes of a chunk's `data`, canonical Extended JSON binary. */
export function chunkBytes(chunk: JsonRecord): Uint8Array {
  const data = chunk['data'];
  const binary = isRecord(data) && isRecord(data['$binary']) ? data['$binary'] : undefined;
  const base64 = binary === undefined ? undefined : textOf(binary, 'base64');
  return base64 === undefined
    ? new Uint8Array()
    : Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** The bytes of the chunks, in the order of `n`, joined, and no more than `most`. */
export function joinedChunks(chunks: readonly JsonRecord[], most: number): Uint8Array {
  const ordered = [...chunks].sort((one, other) => (numberOf(one['n']) ?? 0) - (numberOf(other['n']) ?? 0));
  const parts = ordered.map(chunkBytes);
  const all = new Uint8Array(
    Math.min(
      most,
      parts.reduce((sum, part) => sum + part.length, 0),
    ),
  );
  let at = 0;
  for (const part of parts) {
    const taken = part.subarray(0, all.length - at);
    all.set(taken, at);
    at += taken.length;
  }
  return all;
}

/** The bytes without the last character when the cut fell in the middle of it, so that no `�` ends the text. */
export function trimmedUtf8(bytes: Uint8Array): Uint8Array {
  let start = bytes.length - 1;
  while (start >= 0 && start > bytes.length - 4 && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
    start -= 1;
  }
  const lead = bytes[start];
  if (start < 0 || lead === undefined || lead < 0xc0) {
    return bytes;
  }
  const length = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
  return start + length > bytes.length ? bytes.subarray(0, start) : bytes;
}

const lenient = new TextDecoder('utf-8', { ignoreBOM: true });
const strict = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The bytes as UTF-8, or `undefined` when they are not valid. */
function strictText(bytes: Uint8Array): string | undefined {
  try {
    return strict.decode(bytes);
  } catch {
    return undefined;
  }
}

/** The bytes as base64. */
export function base64Of(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

function textPreview(file: GridFile, decoded: string, cut: boolean): Preview {
  return cut
    ? { kind: 'text', text: decoded, cut, note: text.inspector.cut(sizeText(previewBytes), sizeText(file.length)) }
    : { kind: 'text', text: decoded, cut };
}

/** Feature: gridfs.preview — what the bytes read of a file are: an image, a text or binary. */
export function previewOf(file: GridFile, bytes: Uint8Array): Preview {
  const type = previewType(file);
  if (type !== undefined && imageTypes.has(type)) {
    return { kind: 'image', contentType: type, base64: base64Of(bytes) };
  }
  const cut = file.length > bytes.length;
  const kept = cut ? trimmedUtf8(bytes) : bytes;
  if (isTextType(type)) {
    return textPreview(file, lenient.decode(kept), cut);
  }
  const decoded = bytes.subarray(0, sniffedBytes).includes(0) ? undefined : strictText(kept);
  if (decoded !== undefined) {
    return textPreview(file, decoded, cut);
  }
  const more = file.length > hexBytes;
  return {
    kind: 'binary',
    title: more ? text.inspector.binaryCut(hexBytes) : text.inspector.binary,
    hex: hexDump(bytes.subarray(0, hexBytes)),
    cut: more,
  };
}

/** Feature: gridfs.preview — the preview of a round, or the files document whose chunks are read next. */
export function parse(replies: readonly unknown[], args: Json): PreviewRead {
  const document = fileOfArgs(args);
  const [reply] = replies;
  if (document === undefined) {
    if (!isRecord(reply)) {
      return { kind: 'preview', preview: { kind: 'gone', message: text.gone } };
    }
    const file = fileOf(reply);
    const at = previewWithoutChunks(file);
    return at === undefined ? { kind: 'chunks', file: reply } : { kind: 'preview', preview: at };
  }
  const file = fileOf(document);
  const chunks = Array.isArray(reply) ? (reply as readonly unknown[]).filter(isRecord) : [];
  return { kind: 'preview', preview: previewOf(file, joinedChunks(chunks, bytesWanted(file))) };
}

/** The arguments of the second round, the files document of the first. */
export function chunksRoundArgs(first: Json, file: JsonRecord): Json {
  return { ...(isRecord(first) ? first : {}), file };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('gridfs.preview'), request, parse };
