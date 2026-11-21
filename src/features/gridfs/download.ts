/**
 * Feature: gridfs.download
 *
 * Saves a file of a bucket to the disk: the files document is read first (`gridfs.list:file`), then where to save it
 * is asked in the system's save dialog titled *Download logo.png*, proposing the name after its last `/` or `\`, or
 * `download`; then one file step, `write C:\Users\ada\logo.png`, whose writer reads the chunks in order, `db.fs.chunks
 * .find({ files_id: … }).sort({ n: 1 })`, and writes them as they arrive. Closing the dialog reads no chunk and writes
 * nothing. Allowed on a read-only connection: it writes nothing to a deployment. Started with `{ connection, database,
 * bucket, id }`. Ported from Mongoster's `download`, `save` and `counter`.
 */
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
import { fileReadArgs, fileReadId, readFileOf } from './list';
import { sizeText } from './size-text';
import { text } from './text';
import { bucketPlace, fileIdOf } from './types';
import { notifySuccess, writePlan } from './write/plan';
import { chooseReadId, downloadStep, lastPart } from './write/file';

/** The name the save dialog proposes: the file name after its last `/` or `\`, or `download` when that is empty. */
export function proposedName(filename: string): string {
  const name = lastPart(filename);
  return name === '' ? 'download' : name;
}

/** Feature: gridfs.download — the file read, the save dialog, then `write <path>`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const id = fileIdOf(context, answers);
  if (!('file' in answers)) {
    return needRead('file', fileReadId, fileReadArgs(place, id));
  }
  const file = readFileOf(answers['file']);
  if (file === null) {
    return refuse('gridfs.download/gone', text.gone);
  }
  const name = proposedName(file.filename);
  if (!('path' in answers)) {
    return needRead('path', chooseReadId, { mode: 'save', title: text.download.dialog(name), name });
  }
  const path = answers['path'];
  const chosen = typeof path === 'string' && path !== '';
  return run(
    writePlan({
      title: text.download.plan(name),
      steps: chosen
        ? [
            downloadStep(place, file.id, path, {
              title: text.download.progress(name),
              length: file.length,
              cancelled: text.download.cancelled,
            }),
          ]
        : [],
      danger: { kind: 'none' },
      cannotUndo: text.download.undo,
      after: chosen ? [notifySuccess(text.download.done(name, sizeText(file.length), path))] : [],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.download'), plan };
