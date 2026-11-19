/**
 * The reading of the four replies of one collection for `advisor.read-indexes`: `getIndexes` (sent as
 * `listIndexes`), `$indexStats`, `$collStats` and `estimatedDocumentCount`. When one of the last three failed, the
 * indexes have no uses, no sizes, or the collection no number of documents; only a failure of the first fails the
 * collection, and the caller says so.
 */
import type { Json } from '../../../shared/engine-request';
import {
  dateOf,
  listOf,
  numberField,
  numberOf,
  plainNumbers,
  recordOf,
  textField,
  textOf,
} from '../../monitor/parts/ejson';
import { failureOf } from '../../monitor/parts/failure';
import { indexKeyOf } from '../../monitor/types';
import type { AdvisorCollection, AdvisorIndex } from '../types';

/** What `$indexStats` says of one index: its uses, their start, whether it is being built. */
interface IndexUsage {
  readonly uses?: number;
  readonly since?: number;
  readonly building: boolean;
}

/** The usage of each index, from the first document `$indexStats` returns for it. */
function usagesOf(reply: unknown): ReadonlyMap<string, IndexUsage> {
  const usages = new Map<string, IndexUsage>();
  if (failureOf(reply) !== undefined) {
    return usages;
  }
  for (const each of listOf(reply)) {
    const name = textField(each, 'name');
    if (name === undefined || usages.has(name)) {
      continue;
    }
    const accesses = recordOf(recordOf(each)['accesses']);
    const uses = numberOf(accesses['ops']);
    const since = dateOf(accesses['since']);
    usages.set(name, {
      ...(uses === undefined ? {} : { uses }),
      ...(since === undefined ? {} : { since }),
      building: recordOf(each)['building'] === true,
    });
  }
  return usages;
}

/** The size of each index, from `storageStats.indexSizes` of the first document of `$collStats`. */
function sizesOf(reply: unknown): Readonly<Record<string, Json>> {
  if (failureOf(reply) !== undefined) {
    return {};
  }
  const [first] = listOf(reply);
  return recordOf(recordOf(recordOf(first)['storageStats'])['indexSizes']);
}

function optional(name: string, value: unknown): object {
  return value === undefined ? {} : { [name]: value };
}

/** One index of `getIndexes`, with its usage and its size. */
function indexOf(
  definition: Json,
  usages: ReadonlyMap<string, IndexUsage>,
  sizes: Readonly<Record<string, Json>>,
): AdvisorIndex {
  const fields = recordOf(definition);
  const name = textOf(fields['name']) ?? '';
  const usage = usages.get(name);
  const partial = fields['partialFilterExpression'];
  return {
    name,
    key: indexKeyOf(fields['key']),
    unique: fields['unique'] === true,
    sparse: fields['sparse'] === true,
    hidden: fields['hidden'] === true,
    ...optional('expireAfterSeconds', numberField(definition, 'expireAfterSeconds')),
    ...optional('partialFilterExpression', partial === undefined ? undefined : plainNumbers(partial)),
    ...optional('collation', textField(fields['collation'], 'locale')),
    ...optional('size', numberOf(sizes[name])),
    ...optional('uses', usage?.uses),
    ...optional('since', usage?.since),
    building: usage?.building ?? false,
  };
}

/** A collection from its four replies; the reply of `getIndexes` has not failed. */
export function readIndexesOf(
  name: { readonly database: string; readonly collection: string },
  replies: readonly unknown[],
): AdvisorCollection {
  const [definitions, stats, collStats, count] = replies;
  const usages = usagesOf(stats);
  const sizes = sizesOf(collStats);
  const documents = failureOf(count) === undefined ? numberOf(count) : undefined;
  return {
    database: name.database,
    collection: name.collection,
    indexes: listOf(definitions).map((each) => indexOf(each, usages, sizes)),
    ...(documents === undefined ? {} : { documents }),
  };
}
