/**
 * Feature: advisor.indexes-to-create
 *
 * From the slow operations, the indexes that would serve them and that no existing index already provides, one advice
 * per index. The operations are grouped as the Slow queries section groups them (`monitor.group-slow-queries`), whose
 * suggestion is the index the Explain section suggests (equality, sort, range); a group an index already serves is
 * dropped, groups that ask for the same keys make one advice, and an advice whose keys start another is merged into
 * it. Ported from Mongoster's `src/shared/advisor.ts` (`analyze`, `served`).
 */
import { slowQueryGroups, type SlowQueryGroup } from '../monitor/group-slow-queries';
import { splitNamespace } from '../monitor/parts/requests';
import { indexKeyText, isSameKey, type SlowQuery, type SuggestedIndex } from '../monitor/types';
import { startsWith } from './prefix';
import {
  collectionNamespace,
  type AdvisorCollection,
  type AdvisorIndex,
  type AdvisorQuery,
  type CreateAdvice,
} from './types';

/** The keys asked for on one collection, with the queries that ask for them. */
interface Asked {
  readonly keys: SuggestedIndex;
  readonly queries: AdvisorQuery[];
}

/** Whether an existing index serves the keys: not hidden, not partial, not sparse, no collation, and starts with them. */
export function servingIndex(indexes: readonly AdvisorIndex[], keys: SuggestedIndex): AdvisorIndex | undefined {
  return indexes.find(
    (index) =>
      !index.hidden &&
      index.partialFilterExpression === undefined &&
      !index.sparse &&
      index.collation === undefined &&
      startsWith(index.key, keys),
  );
}

/** A group as a query of an advice (rule 7). */
function queryOf(group: SlowQueryGroup): AdvisorQuery {
  const operations = group.count - group.getMores || group.count;
  return {
    kind: group.kind,
    shape: group.shape,
    operations,
    totalMillis: group.totalMillis,
    averageMillis: group.totalMillis / operations,
    docsExamined: group.docsExamined,
    returned: group.returned,
    collectionScan: group.collectionScan,
    inMemorySort: group.inMemorySort,
    example: group.example,
  };
}

/** The keys asked for per namespace, the groups no index serves (rules 1 to 5). */
function askedPerNamespace(
  collections: readonly AdvisorCollection[],
  operations: readonly SlowQuery[],
): Map<string, Asked[]> {
  const byNamespace = new Map(collections.map((each) => [collectionNamespace(each), each]));
  const asked = new Map<string, Asked[]>();
  for (const group of slowQueryGroups(operations)) {
    const collection = byNamespace.get(group.namespace);
    const keys = group.suggestion;
    if (collection === undefined || keys === undefined || servingIndex(collection.indexes, keys) !== undefined) {
      continue;
    }
    const list = asked.get(group.namespace) ?? [];
    const same = list.find((each) => isSameKey(each.keys, keys));
    if (same === undefined) {
      list.push({ keys, queries: [queryOf(group)] });
    } else {
      same.queries.push(queryOf(group));
    }
    asked.set(group.namespace, list);
  }
  return asked;
}

/** The asked keys of one collection, those that start another merged into it, the longest first (rule 6). */
function merged(list: readonly Asked[]): readonly Asked[] {
  const longestFirst = [...list].sort((one, other) => other.keys.length - one.keys.length);
  const kept: Asked[] = [];
  for (const each of longestFirst) {
    const by = kept.find((keeping) => startsWith(keeping.keys, each.keys));
    if (by === undefined) {
      kept.push({ keys: each.keys, queries: [...each.queries] });
    } else {
      by.queries.push(...each.queries);
    }
  }
  return kept;
}

function adviceOf(namespace: string, asked: Asked): CreateAdvice {
  const { database, collection } = splitNamespace(namespace);
  const queries = [...asked.queries].sort((one, other) => other.totalMillis - one.totalMillis);
  return {
    kind: 'create',
    id: `create:${namespace}:${indexKeyText(asked.keys)}`,
    database,
    collection,
    keys: asked.keys,
    operations: queries.reduce((total, query) => total + query.operations, 0),
    totalMillis: queries.reduce((total, query) => total + query.totalMillis, 0),
    queries,
  };
}

/** Feature: advisor.indexes-to-create — the indexes to create, the one whose queries took the most time first. */
export function indexesToCreate(
  collections: readonly AdvisorCollection[],
  operations: readonly SlowQuery[],
): readonly CreateAdvice[] {
  const advices = [...askedPerNamespace(collections, operations)].flatMap(([namespace, list]) =>
    merged(list).map((asked) => adviceOf(namespace, asked)),
  );
  return advices.sort((one, other) => other.totalMillis - one.totalMillis);
}
