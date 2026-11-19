/**
 * Feature: gridfs.edit-metadata
 *
 * Opens the files document of a file in a document tab (`document.open`), where its metadata, or anything else of it,
 * is edited and saved as any document: one app step, `open the tab ObjectId("65f1c0ffee0000000000a2c1")`, the
 * document of `shop.fs.files` found by its `_id` with its type. It writes nothing itself, so it is allowed on a
 * read-only connection, where the button is **Show document** and the document tab does not save. Started with `{
 * connection, database, bucket, id }`. Ported from Mongoster's `receive` and `editMetadata`.
 */
import type { Answers, Context, OperationFeature, Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { planOf } from '../tab/open';
import { bucketPlace, fileIdOf, filesCollection, oneLine } from './types';

/** Feature: gridfs.edit-metadata — the document tab of the files document. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = bucketPlace(context, answers);
  const id = fileIdOf(context, answers);
  return planOf(context.state, {
    shows: {
      kind: 'document',
      connection: place.connection,
      database: place.database,
      collection: filesCollection(place.bucket),
      id: oneLine(id),
      idJson: JSON.stringify(id),
    },
    background: false,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('gridfs.edit-metadata'), plan };
