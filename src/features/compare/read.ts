/**
 * Feature: compare.read
 *
 * Reads the documents of the two collections and pairs them by `_id`: on both sides and equal, on both sides and
 * different, or on one side only. `request` sends `db.orders.find(<filter>)` to each side, in batches of 1,000, with
 * no sort, no projection and no time limit; the filter is the page's **Filter** (`{}` when empty), the same for both
 * sides. The read is bounded by the number of documents: one more than 1,000,000 is asked, so that the 1,000,001st
 * stops it with `compare.read/too-many`.
 *
 * A worker thread runs it as the documents stream in, with the functions of `./pairing/pairing.ts` (`startPairing`,
 * `addLeft`, `addRight`, `finishPairing`), which say its interface; `parse` is the same pairing over both replies
 * whole, for a read that is not streamed.
 *
 * Started with `{ left, right, options }`: the two sides `{ connection, database, collection, view }` and the options
 * as the page shows them `{ filter, ignore, ignoreOrder, numbersByValue }`.
 */
import type { ConnectionRequest, Json } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { objectOfText } from '../query/mongosh/object-text';
import { addLeft, addRight, finishPairing, startPairing, type PairingInput } from './pairing/pairing';
import {
  batchSize,
  isJsonRecord,
  mostDocuments,
  readOptions,
  readSide,
  sideInfo,
  type CompareResult,
  type ComparisonOptions,
  type SideRef,
} from './types';

/** What `compare.read` is started with. */
export interface ReadArgs {
  readonly left: SideRef;
  readonly right: SideRef;
  readonly options: ComparisonOptions;
}

/** The arguments, which every caller gives: a start without the two sides is a fault of the caller. */
export function readArgs(args: Json): ReadArgs {
  const fields = isJsonRecord(args) ? args : {};
  const left = readSide(fields['left']);
  const right = readSide(fields['right']);
  if (left === undefined || right === undefined) {
    throw new Error('compare.read is started with the two sides of the comparison.');
  }
  return { left, right, options: readOptions(fields['options']) };
}

/** The filter of both sides, or the refusal that says why the text of **Filter** is not one. */
export function filterOf(options: ComparisonOptions, now: number): { readonly filter: Json } | Outcome {
  const read = objectOfText(options.filter, now);
  return read.ok ? { filter: read.value } : refuse('compare.read/filter', `Filter: ${read.error}`);
}

function sideRequest(side: SideRef, filter: Json): ConnectionRequest {
  return {
    connection: side.connection,
    request: {
      engine: 'mongodb',
      database: side.database,
      collection: side.collection,
      method: 'find',
      arguments: [filter, { batchSize }],
      limit: mostDocuments + 1,
    },
  };
}

/** Feature: compare.read — the `find` of the left side, then of the right side; or the refusal of the filter. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const asked = readArgs(args);
  const filter = filterOf(asked.options, context.now);
  if ('kind' in filter) {
    return filter;
  }
  return {
    kind: 'engine',
    requests: [sideRequest(asked.left, filter.filter), sideRequest(asked.right, filter.filter)],
  };
}

/** The input of the pairing, with the sides as the connections are now. */
export function pairingInput(context: Context, args: ReadArgs): PairingInput {
  return { options: args.options, left: sideInfo(context, args.left), right: sideInfo(context, args.right) };
}

function documentsOf(reply: unknown): readonly Json[] {
  return Array.isArray(reply) ? (reply as readonly Json[]) : [];
}

/**
 * Feature: compare.read — the pairing of both replies whole: the counts and the differences (different and only on
 * the right in the order of the right side, then only on the left in the order of the left side), or the refusal of
 * a side with more than 1,000,000 documents. The sides are named as the arguments give them.
 */
export function parse(replies: readonly unknown[], args: Json): CompareResult | Outcome {
  const asked = readArgs(args);
  const named = (side: SideRef) => ({ ...side, connectionName: side.connection });
  const pairing = startPairing({ options: asked.options, left: named(asked.left), right: named(asked.right) });
  const left = addLeft(pairing, documentsOf(replies[0]));
  if (left.kind === 'refuse') {
    return left;
  }
  const right = addRight(pairing, documentsOf(replies[1]));
  return right.kind === 'refuse' ? right : finishPairing(pairing);
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('compare.read'), request, parse };
