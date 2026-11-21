/**
 * Feature: gridfs.rename
 *
 * Renames a file: the files document is read first (`gridfs.list:file`), the new name is asked under **Rename
 * logo.png**, then one step, `db.fs.files.updateOne({ _id: ObjectId("65f1c0ffee0000000000a2c1") }, { $set: {
 * filename: "brand.png" } })`. The chunks, the metadata and the content type do not change; the name of another file
 * of the bucket is accepted, the two becoming revisions of one name. With the name unchanged nothing is sent and
 * nothing is said. Started with `{ connection, database, bucket, id }`. Ported from Mongoster's `receive` and
 * `rename`.
 */
import {
  ask,
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
import { text } from './text';
import { bucketPlace, bucketRequest, bucketStep, fileIdOf, refusedReadOnly } from './types';
import { notifySuccess, refreshAfter, writePlan } from './write/plan';

/** The part of the name the field selects as it opens: the name up to its extension, `logo` of `logo.png`. */
export function selectedPart(filename: string): { readonly start: number; readonly end: number } {
  const dot = filename.lastIndexOf('.');
  return { start: 0, end: dot > 0 ? dot : filename.length };
}

/** Feature: gridfs.rename — the file read, the new name, then the plan of `updateOne`. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'gridfs.rename/read-only');
  if (readOnly !== undefined) {
    return readOnly;
  }
  const id = fileIdOf(context, answers);
  if (!('file' in answers)) {
    return needRead('file', fileReadId, fileReadArgs(place, id));
  }
  const file = readFileOf(answers['file']);
  if (file === null) {
    return refuse('gridfs.rename/gone', text.gone);
  }
  const typed = answers['name'];
  if (typeof typed !== 'string') {
    return ask({
      title: text.rename.title(file.filename),
      button: text.rename.button,
      fields: [
        {
          kind: 'text',
          key: 'name',
          label: text.rename.name,
          default: file.filename,
          selection: selectedPart(file.filename),
          rules: [{ kind: 'not-empty', message: text.rename.empty }],
        },
      ],
    });
  }
  const name = typed.trim();
  if (name === '') {
    return refuse('gridfs.rename/no-name', text.rename.empty);
  }
  if (name === file.filename) {
    return run(
      writePlan({
        title: text.rename.plan(file.filename, name),
        steps: [],
        danger: { kind: 'none' },
        cannotUndo: text.rename.undo,
        after: [],
      }),
    );
  }
  const update = bucketRequest(place, 'files', {
    method: 'updateOne',
    arguments: [{ _id: file.id }, { $set: { filename: name } }],
  });
  return run(
    writePlan({
      title: text.rename.plan(file.filename, name),
      steps: [bucketStep(place, update)],
      danger: { kind: 'none' },
      cannotUndo: text.rename.undo,
      after: [notifySuccess(text.rename.renamed(file.filename, name)), refreshAfter(place)],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.rename'), plan };
