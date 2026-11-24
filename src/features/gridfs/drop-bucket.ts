/**
 * Feature: gridfs.drop-bucket
 *
 * Drops the two collections of a bucket, with every file in it: `db.fs.files.estimatedDocumentCount()` is read
 * first, for the number of files the confirmation shows, then two steps, `db.fs.files.drop()` and
 * `db.fs.chunks.drop()`, then, only when the connection keeps a color for the bucket or its `.chunks`, the step that
 * forgets it. Destructive: the name of the bucket is typed to confirm. The tabs of the bucket are closed and the tree
 * is read again. Started with `{ connection, database, bucket }`. Ported from Mongoster's `dropBucket`.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  run,
  type Answers,
  type AppStep,
  type Context,
  type OperationFeature,
  type Outcome,
  type ReadFeature,
  type ReadRequest,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { numberOf } from '../document/write/values';
import { listArgs } from './list';
import { text } from './text';
import { forgetStep } from '../tree/parts/forget-step';
import {
  bucketArgs,
  bucketPlace,
  bucketRequest,
  bucketStep,
  refusedReadOnly,
  whereText,
  type BucketPlace,
} from './types';
import { closeBucketTabs, notifySuccess, refreshAfter, writePlan } from './write/plan';

/** The identifier of the read of the number of files. */
export const countReadId = 'gridfs.drop-bucket:count';

/** `gridfs.drop-bucket:count`: `db.fs.files.estimatedDocumentCount()`. */
export const countRead: ReadFeature = {
  kind: 'read',
  id: featureId(countReadId),
  request: (_context: Context, args: Json): ReadRequest => {
    const asked = listArgs(args);
    return {
      kind: 'engine',
      requests: [
        {
          connection: asked.connection,
          request: bucketRequest(asked, 'files', { method: 'estimatedDocumentCount', arguments: [] }),
        },
      ],
    };
  },
  parse: (replies) => numberOf(replies[0] as Json) ?? 0,
};

/** The step that forgets the color of the bucket and of its `.chunks`, when the connection keeps one (`tree.color-of`). */
function forgetOfBucket(context: Context, place: BucketPlace): readonly AppStep[] {
  const connection = savedConnection(context.state.connections, place.connection);
  return connection === undefined
    ? []
    : forgetStep(connection, { kind: 'bucket', database: place.database, bucket: place.bucket });
}

/**
 * Feature: gridfs.drop-bucket — the number of files, then the destructive plan of the two drops, and of forgetting
 * the color of the bucket once both succeeded.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const readOnly = refusedReadOnly(place, 'gridfs.drop-bucket/read-only', text.readOnlyBucket(place.connectionName));
  if (readOnly !== undefined) {
    return readOnly;
  }
  if (!('count' in answers)) {
    return needRead('count', countReadId, bucketArgs(place));
  }
  const count = typeof answers['count'] === 'number' ? answers['count'] : 0;
  const where = whereText(place);
  return run(
    writePlan({
      title: text.dropBucket.plan(where),
      steps: [
        bucketStep(place, bucketRequest(place, 'files', { method: 'drop', arguments: [] })),
        bucketStep(place, bucketRequest(place, 'chunks', { method: 'drop', arguments: [] })),
        ...forgetOfBucket(context, place),
      ],
      danger: {
        kind: 'destructive',
        text: `${text.dropBucket.question(where, count)}\n${text.dropBucket.detail(place.bucket)}`,
        button: text.dropBucket.button,
        name: place.bucket,
      },
      cannotUndo: text.dropBucket.undo,
      after: [...closeBucketTabs(context, place), notifySuccess(text.dropBucket.dropped(where)), refreshAfter(place)],
    }),
  );
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.drop-bucket'), plan };
