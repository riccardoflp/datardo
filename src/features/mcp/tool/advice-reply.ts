/**
 * The reply of the app action `advisor.analyze`, which the tool `index_advice` writes (`mcp.performance-tools`): the
 * advice of the Index advisor (`advisor.analyze`) for the indexes and the slow operations its reads gave
 * (`advisor.read-indexes`, `advisor.read-slow-operations`), with the sentences of what could not be read. The main
 * process makes the reads; this puts their results in the shape the tool's text is written from.
 */
import { advice as adviceOf } from '../../advisor/analyze';
import { text as advisorText } from '../../advisor/text';
import type { ScopeIndexes } from '../../advisor/read-indexes';
import type { ScopeSlowOperations } from '../../advisor/read-slow-operations';
import type { Advice as AdvisorAdvice, AdvisorIndex, AdvisorQuery } from '../../advisor/types';
import type { IndexKey } from '../../monitor/types';
import type { Advice, AdvisedIndex, AdvisorReply, ServedShape } from './advice';

function keyRecord(key: IndexKey): Readonly<Record<string, number | string>> {
  return Object.fromEntries(key.map((each) => [each.field, each.value]));
}

function advisedIndex(index: AdvisorIndex): AdvisedIndex {
  return {
    name: index.name,
    key: keyRecord(index.key),
    ...(index.size === undefined ? {} : { bytes: index.size }),
    ...(index.uses === undefined ? {} : { ops: index.uses }),
    ...(index.since === undefined ? {} : { since: index.since }),
  };
}

function servedShape(query: AdvisorQuery): ServedShape {
  return {
    kind: query.kind,
    shape: query.shape,
    count: query.operations,
    avgMs: query.averageMillis,
    maxMs: query.example.millis,
    docsExamined: query.docsExamined,
    nreturned: query.returned,
    collscan: query.collectionScan,
    sortStage: query.inMemorySort,
  };
}

function toolAdvice(advice: AdvisorAdvice): Advice {
  const where = { database: advice.database, collection: advice.collection };
  switch (advice.kind) {
    case 'create':
      return {
        kind: 'create',
        ...where,
        keys: Object.fromEntries(advice.keys.map((each) => [each.field, each.value])),
        queries: advice.queries.map(servedShape),
        count: advice.operations,
        totalMs: advice.totalMillis,
      };
    case 'redundant':
      return { kind: 'redundant', ...where, index: advisedIndex(advice.index), by: advisedIndex(advice.by) };
    case 'unused':
    case 'hidden':
      return { kind: advice.kind, ...where, index: advisedIndex(advice.index) };
  }
}

/** Where the slow operations came from, or the server's message when none could be read. */
function operationsOf(slow: ScopeSlowOperations): AdvisorReply['operations'] {
  const fromProfiler = slow.profilers.reduce((total, each) => total + each.operations, 0);
  if (fromProfiler === 0 && slow.log.kind === 'failed') {
    return { error: slow.log.message };
  }
  return {
    count: slow.operations.length,
    source: fromProfiler > 0 ? 'profiler' : 'log',
    ...(slow.oldest === undefined ? {} : { since: slow.oldest }),
  };
}

/** The sentences of what could not be read: the profilers off, the server log, the profilers and the collections. */
function notesOf(indexes: ScopeIndexes, slow: ScopeSlowOperations): readonly string[] {
  const words = advisorText.sources;
  const off = slow.profilers.filter((each) => each.level === 0 && each.operations === 0).map((each) => each.database);
  const [only] = off;
  return [
    ...(slow.log.kind === 'failed' && slow.operations.length > 0 ? [words.logUnreadable(slow.log.message)] : []),
    ...(only === undefined ? [] : [off.length === 1 ? words.profilerOff(only) : words.profilersOff(off.length)]),
    ...slow.profilers.flatMap((each) => (each.error === undefined ? [] : [words.failed(each.database, each.error)])),
    ...indexes.failed.map((each) => words.failed(each.namespace, each.message)),
  ];
}

/** The reply of `advisor.analyze` for what the reads gave, at `now`. */
export function advisorReply(indexes: ScopeIndexes, slow: ScopeSlowOperations, now: number): AdvisorReply {
  const all = indexes.collections.flatMap((collection) => collection.indexes);
  const result = adviceOf(indexes.collections, slow.operations, now);
  return {
    collections: indexes.collections.length,
    indexes: all.length,
    indexBytes: all.reduce((total, index) => total + (index.size ?? 0), 0),
    operations: operationsOf(slow),
    notes: notesOf(indexes, slow),
    advice: result.advices.map(toolAdvice),
    tooRecent: result.tooRecent,
  };
}
