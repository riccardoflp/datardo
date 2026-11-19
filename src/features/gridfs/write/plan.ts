/**
 * What the plans of the GridFS area are made of: steps on the two collections of a bucket, never recorded in the undo
 * history nor published for redis-oplog (their confirmations say why), the page and the tree read again after them,
 * and the tabs of a bucket closed once it is dropped.
 */
import type { Json } from '../../../shared/engine-request';
import type { After, Context, Danger, EngineStep, NotificationAction, Plan, Step } from '../../../shared/feature';
import { featureId } from '../../../shared/ids';
import { bucketRequest, bucketStep, type BucketRef } from '../types';

/** What a write of this area says besides its steps. */
export interface WritePlan {
  readonly title: string;
  readonly steps: readonly Step[];
  readonly danger: Danger;
  /** Why it cannot be undone, as its card says: the confirmation says so. */
  readonly cannotUndo: string;
  readonly after: readonly After[];
}

/** The plan of a write: not recorded, not published. */
export function writePlan(write: WritePlan): Plan {
  return {
    title: write.title,
    steps: write.steps,
    danger: write.danger,
    undo: { cannot: write.cannotUndo },
    publishes: false,
    after: write.after,
  };
}

/** Reads the page of the bucket and the tree again. */
export function refreshAfter(place: BucketRef): After {
  return { kind: 'refresh', connection: place.connection };
}

/** The notification of a write that ran. */
export function notifySuccess(message: string, actions?: readonly NotificationAction[]): After {
  return actions === undefined || actions.length === 0
    ? { kind: 'notify', level: 'success', text: message }
    : { kind: 'notify', level: 'success', text: message, actions };
}

/** `db.fs.files.deleteOne({ _id: … })` and `db.fs.chunks.deleteMany({ files_id: … })`: a file and its chunks. */
export function deleteFileSteps(place: BucketRef, id: Json): readonly EngineStep[] {
  return [
    bucketStep(place, bucketRequest(place, 'files', { method: 'deleteOne', arguments: [{ _id: id }] })),
    deleteChunksStep(place, id),
  ];
}

/** `db.fs.chunks.deleteMany({ files_id: … })`: the chunks of a file. */
export function deleteChunksStep(place: BucketRef, id: Json): EngineStep {
  return bucketStep(place, bucketRequest(place, 'chunks', { method: 'deleteMany', arguments: [{ files_id: id }] }));
}

/** The open tabs of the bucket, to close once it is dropped (`tab.close`). */
export function closeBucketTabs(context: Context, place: BucketRef): readonly After[] {
  return context.state.tabs.tabs.flatMap((tab): After[] => {
    const shows = tab.shows;
    const isBucket =
      shows.kind === 'page' &&
      shows.page === 'gridfs' &&
      shows.connection === place.connection &&
      shows.database === place.database &&
      shows.of?.[0] === place.bucket;
    return isBucket
      ? [{ kind: 'start', feature: featureId('tab.close'), target: { kind: 'app' }, args: { tab: tab.id } }]
      : [];
  });
}
