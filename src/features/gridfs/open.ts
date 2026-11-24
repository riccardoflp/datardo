/**
 * Feature: gridfs.open
 *
 * Opens a file with the application the system uses for its type, from a temporary copy: one file step, `write
 * <the folder of the copies>\<folder>\logo.png`, whose writer is that of `gridfs.download`, then one app step, `open
 * the copy with the system's application`. The folder of the copies is the main process's own, private to the user
 * (`datardo-gridfs-` and six random characters in the system's temporary folder, T20). Only the types of a list are handed to the system
 * (D42, T20): any other is refused before anything is read. Changes made to the copy are not written back. Allowed on
 * a read-only connection. Started with `{ connection, database, bucket, id, filename }`, the name as the row shows it,
 * which is checked again once the files document is read. Ported from Mongoster's `open` and `save`.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { extensionOf } from './content-type';
import { fileReadArgs, fileReadId, readFileOf } from './list';
import { text } from './text';
import { bucketPlace, fileIdOf, startArgs, textOf, type BucketRef } from './types';
import { writePlan } from './write/plan';
import { downloadStep, temporaryReadId } from './write/file';

/** The extensions of the files handed to the system (D42): documents, pictures, sound and archives. */
export const openedExtensions: ReadonlySet<string> = new Set([
  'txt',
  'log',
  'md',
  'csv',
  'json',
  'xml',
  'yaml',
  'yml',
  'css',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'pdf',
  'mp3',
  'mp4',
  'wav',
  'zip',
  'gz',
]);

/** Whether a file of this name is handed to the system. */
export function isOpened(filename: string): boolean {
  const extension = extensionOf(filename);
  return extension !== undefined && openedExtensions.has(extension);
}

/**
 * The name of the copy: each of `\ / : * ? " < > |` and each control character (codes 0 to 31) replaced by `_`, or
 * `file` when that leaves nothing or dots.
 */
export function copyName(filename: string): string {
  const name = Array.from(filename, (character) =>
    character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? '_' : character,
  ).join('');
  return /^\.*$/u.test(name) ? 'file' : name;
}

/** The bytes of a text in UTF-8. */
function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Base64url of bytes, without padding. */
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** 32 hexadecimal digits of a text, by FNV-1a with four seeds. */
function digitsOf(value: string): string {
  return [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
    .map((seed) => {
      let hash = seed >>> 0;
      for (const byte of utf8(value)) {
        hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, '0');
    })
    .join('');
}

/** The longest name of the folder of a copy. */
export const folderLength = 48;

/**
 * The folder of a file's copy, the same each time the file is opened: the base64url of the connection's identifier,
 * the database, the bucket and the `_id`, when it has no more than 48 characters; else its first 16 followed by 32
 * hexadecimal digits of all of it, so that two files whose `_id` differ never share a folder.
 */
export function copyFolder(place: BucketRef, id: Json): string {
  const key = [place.connection, place.database, place.bucket, JSON.stringify(id)].join('\n');
  const whole = base64Url(utf8(key));
  return whole.length <= folderLength ? whole : `${whole.slice(0, folderLength - 32)}${digitsOf(key)}`;
}

/** The path of the copy in the folder of the copies, with the separator of the system. */
export function copyPath(
  folder: string,
  platform: Context['platform'],
  copy: { readonly folder: string; readonly name: string },
): string {
  const separator = platform === 'windows' ? '\\' : '/';
  const base = folder.endsWith(separator) ? folder.slice(0, -1) : folder;
  return [base, copy.folder, copy.name].join(separator);
}

/** Feature: gridfs.open — the type checked, the file read, the temporary folder, then the copy written and opened. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const id = fileIdOf(context, answers);
  const shownName = textOf(startArgs(answers), 'filename');
  if (shownName !== undefined && !isOpened(shownName)) {
    return refuse('gridfs.open/type', text.open.type);
  }
  if (!('file' in answers)) {
    return needRead('file', fileReadId, fileReadArgs(place, id));
  }
  const file = readFileOf(answers['file']);
  if (file === null) {
    return refuse('gridfs.open/gone', text.gone);
  }
  if (!isOpened(file.filename)) {
    return refuse('gridfs.open/type', text.open.type);
  }
  if (!('folder' in answers)) {
    return needRead('folder', temporaryReadId, null);
  }
  const folder = answers['folder'];
  if (typeof folder !== 'string' || folder === '') {
    throw new Error('gridfs.open needs the temporary folder of the system.');
  }
  const path = copyPath(folder, context.platform, {
    folder: copyFolder(place, file.id),
    name: copyName(file.filename),
  });
  return run(
    writePlan({
      title: text.open.plan(file.filename),
      steps: [
        downloadStep(place, file.id, path, { title: text.open.progress(file.filename), length: file.length }),
        { kind: 'app', action: 'gridfs.open-copy', args: { path }, text: text.open.step },
      ],
      danger: { kind: 'none' },
      cannotUndo: text.open.undo,
      after: [],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.open'), plan };
