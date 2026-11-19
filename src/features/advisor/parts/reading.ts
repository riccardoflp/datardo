/**
 * The reads `advisor.show` sends when the page opens, on **Refresh** and after an action of the page that ran: the
 * calls of `advisor.read-indexes`, in order, then `advisor.read-slow-operations` once, each with its arguments. Each
 * call is given what the previous ones answered ({@link AnalysisProgress}); {@link nextRead} says what follows, and
 * nothing once the analysis has every reply.
 */
import type { Json } from '../../../shared/engine-request';
import type { ReadNeed } from '../../../shared/feature';
import { featureId, type ConnectionId } from '../../../shared/ids';
import { collectionBatches, scopeIndexes, type IndexesReply, type ScopeIndexes } from '../read-indexes';
import type { ScopeSlowOperations } from '../read-slow-operations';
import { collectionNamespace, type Scope } from '../types';

/** What the reads have answered so far. */
export interface AnalysisProgress {
  readonly databases?: readonly string[];
  readonly listed?: Extract<IndexesReply, { step: 'collections' }>;
  readonly indexes: readonly Extract<IndexesReply, { step: 'indexes' }>[];
  readonly slow?: ScopeSlowOperations;
}

/** What the reads gave: the indexes and the slow operations, or the message of a failure to list the collections. */
export type AnalysisRead =
  | { readonly kind: 'read'; readonly indexes: ScopeIndexes; readonly slow: ScopeSlowOperations }
  | { readonly kind: 'failed'; readonly message: string };

/** Nothing answered yet. */
export const nothingRead: AnalysisProgress = { indexes: [] };

/** What the reads are for: the connection, its scope, and its default database when listing is refused. */
export interface AnalysisInput {
  readonly connection: ConnectionId;
  readonly scope: Scope;
  readonly fallback: string;
}

function need(key: string, read: string, args: Json): ReadNeed {
  return { key, read: featureId(read), args };
}

function databasesOfScope(input: AnalysisInput, progress: AnalysisProgress): readonly string[] | undefined {
  return input.scope.kind === 'connection' ? progress.databases : [input.scope.database];
}

/** The indexes read once every call has answered, or `undefined` before. */
export function indexesRead(input: AnalysisInput, progress: AnalysisProgress): ScopeIndexes | undefined {
  const databases = databasesOfScope(input, progress);
  const listed = progress.listed;
  if (databases === undefined || listed === undefined) {
    return undefined;
  }
  const batches = collectionBatches(listed.collections);
  return progress.indexes.length < batches.length ? undefined : scopeIndexes(databases, listed, progress.indexes);
}

/** The arguments of `advisor.read-slow-operations` for the indexes read. */
export function slowOperationsArgs(connection: ConnectionId, indexes: ScopeIndexes): Json {
  return {
    connection,
    databases: [...indexes.databases],
    profiled: [...indexes.profiled],
    collections: indexes.collections.map(collectionNamespace),
  };
}

/**
 * The next read of the analysis: the calls of `advisor.read-indexes`, then `advisor.read-slow-operations`, the last;
 * nothing once it answered, or once the collections could not be listed. Nothing is read on a timer: the page asks
 * again only when it opens, on **Refresh**, and after an action of the page that ran, from {@link nothingRead}.
 */
export function nextRead(input: AnalysisInput, progress: AnalysisProgress): ReadNeed | undefined {
  const connection = input.connection;
  const databases = databasesOfScope(input, progress);
  if (databases === undefined) {
    return need('databases', 'advisor.read-indexes', { connection, step: 'databases', fallback: input.fallback });
  }
  if (progress.listed === undefined) {
    const collection = input.scope.kind === 'collection' ? { collection: input.scope.collection } : {};
    return need('collections', 'advisor.read-indexes', {
      connection,
      step: 'collections',
      databases: [...databases],
      ...collection,
    });
  }
  if (progress.listed.error !== undefined || progress.slow !== undefined) {
    return undefined;
  }
  const batch = collectionBatches(progress.listed.collections)[progress.indexes.length];
  if (batch !== undefined) {
    const collections = batch.map((each) => ({ database: each.database, collection: each.collection }));
    return need('indexes', 'advisor.read-indexes', { connection, step: 'indexes', collections });
  }
  const indexes = indexesRead(input, progress);
  return indexes === undefined
    ? undefined
    : need('slow', 'advisor.read-slow-operations', slowOperationsArgs(connection, indexes));
}

/** The progress once a reply of `advisor.read-indexes` arrived. */
export function withReply(progress: AnalysisProgress, reply: IndexesReply): AnalysisProgress {
  switch (reply.step) {
    case 'databases':
      return { ...progress, databases: reply.databases };
    case 'collections':
      return { ...progress, listed: reply };
    case 'indexes':
      return { ...progress, indexes: [...progress.indexes, reply] };
  }
}

/** The progress once the reply of `advisor.read-slow-operations` arrived. */
export function withSlowOperations(progress: AnalysisProgress, slow: ScopeSlowOperations): AnalysisProgress {
  return { ...progress, slow };
}

/** What the page shows once every read answered, or `undefined` before. */
export function analysisOf(input: AnalysisInput, progress: AnalysisProgress): AnalysisRead | undefined {
  const error = progress.listed?.error;
  if (error !== undefined) {
    return { kind: 'failed', message: error };
  }
  const indexes = indexesRead(input, progress);
  return indexes === undefined || progress.slow === undefined
    ? undefined
    : { kind: 'read', indexes, slow: progress.slow };
}
