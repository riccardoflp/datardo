/**
 * `relation.read` carried out against MongoDB, phase after phase (its module says which): the collections listed, each
 * collection counted, its indexes read and sampled, 6 at a time, then the values that could be references looked up
 * in their targets, 6 lookups at a time, and the references of the database worked out from all of it. The progress
 * is told as the card writes it: *Sampling 12 collections…*, *Sampled 3 of 12 collections…*, *Checking 9 possible
 * references in 4 collections…*. What fails is as the card says: a count or the indexes leave the collection without
 * them, a sample leaves it unreadable, a lookup finds nothing, and only the listing fails the whole read.
 */
import { candidatesOf, lookupsOf, referenceGraph, sampledCollection } from '../features/relation/model/graph';
import type { CollectionReading, ListedCollection, Lookup } from '../features/relation/model/graph';
import {
  collectionsAtOnce,
  parseCollections,
  parseCount,
  parseLookup,
  parseUnique,
  phaseRequests,
} from '../features/relation/read';
import { text } from '../features/relation/text';
import type { FoundValues, ReferenceGraph } from '../features/relation/types';
import { withoutSecrets } from '../features/runner/error';
import type { ConnectionRequest, Json } from '../shared/engine-request';
import type { ConnectionId } from '../shared/ids';

/** What the read needs: the engines, and who follows its progress. */
export interface ReferencesPorts {
  readonly send: (request: ConnectionRequest, signal: AbortSignal) => Promise<unknown>;
  readonly progress: (text: string) => void;
}

/** The database to read and the size of the sample. */
export interface ReferencesAsked {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly size: number;
}

/** Runs `work` on every item, at most `atOnce` at the same time, the results in the order of the items. */
export async function inGroups<Item, Result>(
  items: readonly Item[],
  atOnce: number,
  work: (item: Item) => Promise<Result>,
): Promise<readonly Result[]> {
  const results: Result[] = new Array<Result>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      const item = items[index] as Item;
      results[index] = await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
  return results;
}

async function phase(
  ports: ReferencesPorts,
  asked: ReferencesAsked,
  args: Readonly<Record<string, Json>>,
  signal: AbortSignal,
): Promise<unknown[]> {
  const requests = phaseRequests({ database: asked.database, ...args });
  const replies: unknown[] = [];
  for (const request of requests) {
    replies.push(await ports.send({ connection: asked.connection, request }, signal));
  }
  return replies;
}

function message(error: unknown): string {
  return withoutSecrets(error instanceof Error ? error.message : String(error));
}

/** A collection counted, its indexes read, then sampled. */
async function readCollection(
  ports: ReferencesPorts,
  asked: ReferencesAsked,
  name: string,
  signal: AbortSignal,
): Promise<CollectionReading> {
  const [counted, indexed] = await Promise.allSettled([
    phase(ports, asked, { phase: 'count', collection: name }, signal),
    phase(ports, asked, { phase: 'indexes', collection: name }, signal),
  ]);
  signal.throwIfAborted();
  const documents = counted.status === 'fulfilled' ? parseCount(counted.value[0]) : undefined;
  const unique = indexed.status === 'fulfilled' ? parseUnique(indexed.value[0]) : [];
  const sampleArgs = {
    phase: 'sample',
    collection: name,
    size: asked.size,
    ...(documents === undefined ? {} : { documents }),
  };
  try {
    const [reply] = await phase(ports, asked, sampleArgs, signal);
    const sampled = Array.isArray(reply) ? (reply as readonly Json[]) : [];
    return { ...(documents === undefined ? {} : { documents }), unique, sample: { documents: sampled } };
  } catch (error: unknown) {
    signal.throwIfAborted();
    return { ...(documents === undefined ? {} : { documents }), unique, sample: { unreadable: message(error) } };
  }
}

async function lookedUp(
  ports: ReferencesPorts,
  asked: ReferencesAsked,
  lookup: Lookup,
  signal: AbortSignal,
): Promise<FoundValues> {
  const args = { phase: 'lookup', collection: lookup.collection, field: lookup.field, values: [...lookup.values] };
  try {
    return parseLookup(await phase(ports, asked, args, signal), args);
  } catch {
    signal.throwIfAborted();
    // A lookup that fails finds nothing in that target: no reference to it (the card's "What can go wrong").
    return { collection: lookup.collection, field: lookup.field, values: [] };
  }
}

/** Reads the references of a database; fails only when its collections cannot be listed, or when cancelled. */
export async function readReferences(
  ports: ReferencesPorts,
  asked: ReferencesAsked,
  signal: AbortSignal,
): Promise<ReferenceGraph> {
  const [listing] = await phase(ports, asked, { phase: 'collections' }, signal);
  const listed: readonly ListedCollection[] = parseCollections(listing);
  const sampled = listed.filter((each) => !each.view);
  ports.progress(text.progress.sampling(sampled.length));
  let done = 0;
  const readings = await inGroups(sampled, collectionsAtOnce, async (each) => {
    const reading = await readCollection(ports, asked, each.name, signal);
    done += 1;
    ports.progress(text.progress.sampled(done, sampled.length));
    return [each.name, reading] as const;
  });
  const byName = new Map(readings);
  const collections = listed.map((each) => sampledCollection(each, byName.get(each.name)));
  const candidates = candidatesOf(collections);
  const lookups = lookupsOf(candidates);
  ports.progress(text.progress.checking(candidates.length, new Set(lookups.map((each) => each.collection)).size));
  const found = await inGroups(lookups, collectionsAtOnce, (lookup) => lookedUp(ports, asked, lookup, signal));
  return referenceGraph({ name: asked.database, sample: asked.size }, collections, found);
}
