/**
 * Feature: gridfs.create-bucket
 *
 * A bucket exists once it has a file: this asks for its name under *Upload files to GridFS in Local › shop*, starting
 * as `fs`, then is `gridfs.upload` for that bucket. Nothing is created before the first file is sent: with a new name,
 * the first chunk creates the two collections, after the indexes of an empty bucket. With the name of a bucket that
 * exists, the files are added to it and its existing names are asked about. Started with `{ connection, database }`.
 * Ported from Mongoster's upload command started on a database, and `uploadFiles`.
 */
import { ask, refuse, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { text } from './text';
import { databasePlace, refusedReadOnly, startArgs } from './types';
import { plan as uploadPlan } from './upload';

/** A name of a bucket: no space, no `$` and no zero byte, the spaces around it left out. */
export const bucketNamePattern = '^\\s*[^\\s$\\u0000]+\\s*$';

/** Whether a name typed is accepted for a bucket. */
export function isBucketName(typed: string): boolean {
  return new RegExp(bucketNamePattern, 'u').test(typed);
}

/** Feature: gridfs.create-bucket — the name of the bucket, then everything `gridfs.upload` asks and plans. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = databasePlace(context, answers);
  const readOnly = refusedReadOnly(place, 'gridfs.create-bucket/read-only', text.readOnlyBucket(place.connectionName));
  if (readOnly !== undefined) {
    return readOnly;
  }
  const typed = answers['bucket'];
  if (typeof typed !== 'string') {
    return ask({
      title: text.createBucket.title(`${place.connectionName} › ${place.database}`),
      text: text.createBucket.note('<bucket>'),
      button: text.createBucket.button,
      fields: [
        {
          kind: 'text',
          key: 'bucket',
          label: text.createBucket.name,
          default: 'fs',
          rules: [{ kind: 'pattern', pattern: bucketNamePattern, message: text.createBucket.badName }],
        },
      ],
    });
  }
  if (!isBucketName(typed)) {
    return refuse('gridfs.create-bucket/bucket-name', text.createBucket.badName);
  }
  return uploadPlan(context, {
    ...answers,
    args: { ...startArgs(answers), database: place.database, bucket: typed.trim() },
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.create-bucket'), plan };
