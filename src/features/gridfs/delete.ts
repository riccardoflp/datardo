/**
 * Feature: gridfs.delete
 *
 * Deletes one file of a bucket after a confirmation: the files document is read first (`gridfs.list:file`), for the
 * name and the size the confirmation shows, then two steps, `db.fs.files.deleteOne({ _id: … })` and
 * `db.fs.chunks.deleteMany({ files_id: … })`. Of two revisions of one name, only the one started on is deleted: it
 * is named by its `_id`, with its type. Started with `{ connection, database, bucket, id }`. Ported from Mongoster's
 * `receive` and `delete`.
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
import { bucketPlace, fileIdOf, refusedReadOnly, whereText } from './types';
import { deleteFileSteps, notifySuccess, refreshAfter, writePlan } from './write/plan';

/** Feature: gridfs.delete — the file read, then the confirmed plan of its two deletes. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'gridfs.delete/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const id = fileIdOf(context, answers);
  if (!('file' in answers)) {
    return needRead('file', fileReadId, fileReadArgs(place, id));
  }
  const file = readFileOf(answers['file']);
  if (file === null) {
    return refuse('gridfs.delete/gone', text.gone);
  }
  return run(
    writePlan({
      title: text.deleteFile.plan(file.filename),
      steps: deleteFileSteps(place, file.id),
      danger: {
        kind: 'confirm',
        text: `${text.deleteFile.question(file.filename, sizeText(file.length), whereText(place))}\n${text.deleteFile.detail}`,
        button: text.deleteFile.button,
      },
      cannotUndo: text.deleteFile.undo,
      after: [notifySuccess(text.deleteFile.deleted(file.filename)), refreshAfter(place)],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.delete'), plan };
