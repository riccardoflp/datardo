/**
 * What `gridfs.download` and `gridfs.open` share: the system's dialogs and the temporary folder, as app reads the main
 * process answers, and the file step whose writer, `gridfs.download`, reads the chunks of a file in order and writes
 * them as they arrive, never the whole file in memory, deleting the part written when it is cancelled or fails.
 */
import type { Json } from '../../../shared/engine-request';
import type { Context, FileStep, ReadFeature } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import { stepText } from '../../runner/step-text';
import { isRecord, textOf, type BucketRef } from '../types';

/** The identifier of the read of a place on the disk, with the system's dialog. */
export const chooseReadId = 'gridfs.download:file';

/**
 * `gridfs.download:file`: the system's dialog, an app read (`gridfs.choose-file`). Asked with `{ mode: 'save', title,
 * name }` it answers the path chosen; with `{ mode: 'open', title, button, many: true }` the files chosen, each
 * `{ path, name, size, id }`, `id` being a new ObjectId the main process makes for its files document; `null` when the
 * dialog was closed.
 */
export const chooseRead: ReadFeature = {
  kind: 'read',
  id: featureId(chooseReadId),
  request: (_context: Context, args: Json) => ({ kind: 'app', action: 'gridfs.choose-file', args }),
  parse: (replies) => replies[0] ?? null,
};

/** The identifier of the read of the system's temporary folder. */
export const temporaryReadId = 'gridfs.open:folder';

/** `gridfs.open:folder`: the system's temporary folder, an app read (`gridfs.temporary-folder`). */
export const temporaryRead: ReadFeature = {
  kind: 'read',
  id: featureId(temporaryReadId),
  request: () => ({ kind: 'app', action: 'gridfs.temporary-folder', args: null }),
  parse: (replies) => (typeof replies[0] === 'string' ? replies[0] : null),
};

/** The name of the writer of a file's bytes. */
export const downloadWriter = 'gridfs.download';

/**
 * What the writer of a download says while it runs and when it is cancelled: the title of its work in progress
 * (*Downloading logo.png*), the size of the file for its `1.2 MB of 4.5 MB`, and the notification of a cancel
 * (*Download cancelled.*), when the card names one.
 */
export interface DownloadSaid {
  readonly title: string;
  readonly length: number;
  readonly cancelled?: string;
}

/** `write C:\Users\ada\logo.png`: the file step whose writer reads the chunks of the file in order. */
export function downloadStep(place: BucketRef, id: Json, path: string, said: DownloadSaid): FileStep {
  const step = {
    kind: 'file' as const,
    action: 'write' as const,
    path,
    content: {
      writer: downloadWriter,
      args: {
        connection: place.connection,
        database: place.database,
        bucket: place.bucket,
        id,
        title: said.title,
        length: said.length,
        ...(said.cancelled === undefined ? {} : { cancelled: said.cancelled }),
      },
    },
  };
  return { ...step, text: stepText(step) };
}

/** The file name after its last `/` or `\`, as a dialog proposes it: `q1.pdf` of `reports/2026/q1.pdf`. */
export function lastPart(filename: string): string {
  return filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
}

/** A file the open dialog answered. */
export interface ChosenFile {
  readonly path: string;
  readonly name: string;
  readonly size: number;
  /** The `_id` of its files document, as canonical Extended JSON. */
  readonly id: Json;
}

/** The files the open dialog answered; `undefined` when it was closed. */
export function chosenFiles(value: unknown): readonly ChosenFile[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return (value as readonly unknown[]).filter(isRecord).flatMap((each) => {
    const path = textOf(each, 'path');
    const size = each['size'];
    if (path === undefined || typeof size !== 'number') {
      return [];
    }
    return [{ path, name: textOf(each, 'name') ?? lastPart(path), size, id: each['id'] ?? null }];
  });
}
