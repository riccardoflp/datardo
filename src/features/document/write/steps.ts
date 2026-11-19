/**
 * The calls the document area sends to MongoDB, and the steps of its writes, written as `runner.step-text` writes them
 * (`db.people.deleteOne({ _id: 7 })`), so that the confirmation shows them exactly as they are sent.
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import type { EngineStep } from '../../../shared/feature';
import { stepText } from '../../runner/step-text';
import { collectionTarget, type DocumentPlace } from '../types';

/** How long a write of one document may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const oneWriteTimeLimitMs = 30_000;

/** How long a write of many documents may take on the server, in milliseconds (Datardo's choice, R9.2). */
export const manyWriteTimeLimitMs = 600_000;

/** A call to a method of the collection of a place: `db.orders.updateOne(…)`. */
export function collectionRequest(
  place: DocumentPlace,
  method: string,
  args: readonly Json[],
  timeLimitMs: number,
): MongoRequest {
  return {
    engine: 'mongodb',
    database: place.database,
    collection: place.collection,
    method,
    arguments: args,
    timeLimitMs,
  };
}

/** The step that sends a write to the collection of a place, with its text as the confirmation and the Log show it. */
export function writeStep(place: DocumentPlace, request: MongoRequest): EngineStep {
  const step = { kind: 'engine', connection: place.connection, request, writes: true } as const;
  return { ...step, text: stepText(step, collectionTarget(place)) };
}

/** The filter of one document by its `_id`. */
export function idFilter(id: Json): Json {
  return { _id: id };
}

/** The filter of the documents with these `_id`s: `{ _id: { $in: [1, 2, 3] } }`. */
export function idsFilter(ids: readonly Json[]): Json {
  return { _id: { $in: ids } };
}

/** The `_id`s once each, in their first order: two sub-rows of one document name it once. */
export function distinctIds(ids: readonly Json[]): readonly Json[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const key = JSON.stringify(id);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
