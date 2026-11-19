/**
 * The differences of the indexes, the search indexes and the shard key of a collection that is on both sides
 * (`structure.steps`). Indexes are paired first by name and identity, then by identity, then by name; the identity
 * is the keys with the collation and the partial filter. Ported from Mongoster's `src/shared/structure.ts ›
 * pairIndexes`, `compareIndexes`, `compareSearchIndexes`, `compareShardKeys`.
 */
import type { Json } from '../../../shared/engine-request';
import { formattedValue } from '../../query/format';
import { text } from '../text';
import type {
  CollectionType,
  IndexDefinition,
  SearchIndexDefinition,
  ShardKey,
  StructureDifference,
  StructureStep,
} from '../types';
import { plain } from './collection-steps';
import { differingFields } from './fields';
import { createOptions, planIndexChange, type IndexChange } from './index-change';
import { isSame, orderedText, stableText } from './values';

/** What every difference of a collection carries. */
export interface CollectionOf {
  readonly collection: string;
  readonly collectionType: CollectionType;
}

/** Keys and other values on one line, as the summaries write them: `{ status: 1 }`. */
export function keysText(value: Json): string {
  return formattedValue(value, 'one-line');
}

/** An index as its definition is shown: `{ name, key, …options }`. */
export function indexDocument(index: IndexDefinition): Json {
  return { name: index.name, key: index.keys, ...index.options };
}

function identity(index: IndexDefinition): string {
  const options = index.options;
  return `${orderedText(index.keys)}|${stableText(options['collation'])}|${stableText(options['partialFilterExpression'])}`;
}

interface Paired {
  readonly pairs: readonly (readonly [IndexDefinition, IndexDefinition])[];
  readonly onlyLeft: readonly IndexDefinition[];
  readonly onlyRight: readonly IndexDefinition[];
}

function pairIndexes(left: readonly IndexDefinition[], right: readonly IndexDefinition[]): Paired {
  const lefts = [...left];
  const rights = [...right];
  const pairs: (readonly [IndexDefinition, IndexDefinition])[] = [];
  const take = (match: (a: IndexDefinition, b: IndexDefinition) => boolean): void => {
    for (const a of [...lefts]) {
      const at = rights.findIndex((b) => match(a, b));
      const b = rights[at];
      if (b !== undefined) {
        pairs.push([a, b]);
        rights.splice(at, 1);
        lefts.splice(lefts.indexOf(a), 1);
      }
    }
  };
  take((a, b) => a.name === b.name && identity(a) === identity(b));
  take((a, b) => identity(a) === identity(b));
  take((a, b) => a.name === b.name);
  return { pairs, onlyLeft: lefts, onlyRight: rights };
}

function createIndexStep(collection: string, index: IndexDefinition, destructive: boolean): StructureStep {
  return {
    operation: { type: 'createIndex', collection, keys: index.keys, options: createOptions(index) },
    destructive,
  };
}

function pairSummary(left: IndexDefinition, right: IndexDefinition, change: IndexChange): string {
  const keysDiffer = orderedText(left.keys) !== orderedText(right.keys);
  const changed =
    change.kind === 'recreate'
      ? change.changed
      : Object.keys(change).filter((name) => name !== 'kind' && name !== 'changed');
  if (left.name !== right.name && !keysDiffer) {
    const others = change.kind === 'recreate' ? changed.filter((name) => name !== 'name') : [];
    return text.summaries.sameKeysOtherName(keysText(left.keys), right.name, others);
  }
  if (keysDiffer && left.name === right.name) {
    return text.summaries.sameNameOtherKeys(keysText(left.keys), keysText(right.keys));
  }
  return text.summaries.different(changed);
}

function pairSteps(where: CollectionOf, left: IndexDefinition, right: IndexDefinition, change: IndexChange) {
  if (change.kind === 'modify') {
    const index = {
      name: right.name,
      ...(change.hidden === undefined ? {} : { hidden: change.hidden }),
      ...(change.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: change.expireAfterSeconds }),
    };
    return [plain({ operation: { type: 'collMod', collection: where.collection, changes: { index } } })];
  }
  const changed = change.kind === 'recreate' ? change.changed : [];
  return [
    {
      operation: { type: 'dropIndex', collection: where.collection, name: right.name },
      destructive: true,
      note: text.stepNotes.rebuilt(changed),
    } satisfies StructureStep,
    createIndexStep(where.collection, left, true),
  ];
}

function pairDifference(where: CollectionOf, left: IndexDefinition, right: IndexDefinition): StructureDifference {
  const base = { ...where, object: 'index', name: left.name, id: `${where.collection}\u0000index\u0000${left.name}` };
  const shown = { left: indexDocument(left), right: indexDocument(right) };
  const change = planIndexChange(right, left);
  if (change.kind === 'none') {
    return { ...base, ...shown, object: 'index', kind: 'same', summary: keysText(left.keys), steps: [] };
  }
  return {
    ...base,
    ...shown,
    object: 'index',
    kind: 'different',
    summary: pairSummary(left, right, change),
    fields: differingFields(shown.left, shown.right),
    steps: pairSteps(where, left, right, change),
  };
}

/** The differences of the indexes of a collection, sorted by name. */
export function indexDifferences(
  where: CollectionOf,
  left: readonly IndexDefinition[],
  right: readonly IndexDefinition[],
): readonly StructureDifference[] {
  const { pairs, onlyLeft, onlyRight } = pairIndexes(left, right);
  const differences: StructureDifference[] = pairs.map(([a, b]) => pairDifference(where, a, b));
  for (const a of onlyLeft) {
    differences.push({
      ...where,
      id: `${where.collection}\u0000index\u0000${a.name}`,
      object: 'index',
      name: a.name,
      kind: 'only-left',
      summary: text.summaries.indexMissing(keysText(a.keys)),
      left: indexDocument(a),
      steps: [createIndexStep(where.collection, a, false)],
    });
  }
  for (const b of onlyRight) {
    differences.push({
      ...where,
      id: `${where.collection}\u0000index-right\u0000${b.name}`,
      object: 'index',
      name: b.name,
      kind: 'only-right',
      summary: text.summaries.indexOnlyRight(keysText(b.keys)),
      right: indexDocument(b),
      steps: [{ operation: { type: 'dropIndex', collection: where.collection, name: b.name }, destructive: true }],
    });
  }
  return differences.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

function searchDocument(index: SearchIndexDefinition): Json {
  return { name: index.name, type: index.type, definition: index.definition };
}

function createSearchStep(collection: string, index: SearchIndexDefinition, destructive: boolean): StructureStep {
  return {
    operation: {
      type: 'createSearchIndex',
      collection,
      name: index.name,
      searchType: index.type,
      definition: index.definition,
    },
    destructive,
  };
}

function searchPair(where: CollectionOf, a: SearchIndexDefinition, b: SearchIndexDefinition): StructureDifference {
  const base = { ...where, id: `${where.collection}\u0000search\u0000${a.name}`, object: 'search-index' as const };
  const shown = { left: searchDocument(a), right: searchDocument(b) };
  if (a.type === b.type && isSame(a.definition, b.definition)) {
    return { ...base, ...shown, name: a.name, kind: 'same', summary: a.type, steps: [] };
  }
  const steps: readonly StructureStep[] =
    a.type === b.type
      ? [
          plain({
            operation: {
              type: 'updateSearchIndex',
              collection: where.collection,
              name: a.name,
              definition: a.definition,
            },
          }),
        ]
      : [
          {
            operation: { type: 'dropSearchIndex', collection: where.collection, name: b.name },
            destructive: true,
            note: text.stepNotes.searchType,
          },
          createSearchStep(where.collection, a, true),
        ];
  const summary = a.type === b.type ? text.summaries.searchDefinition : text.summaries.searchTypes(a.type, b.type);
  const fields = differingFields(shown.left, shown.right);
  return { ...base, ...shown, name: a.name, kind: 'different', summary, fields, steps };
}

/** The differences of the search indexes of a collection, in the left's order and then those only on the right. */
export function searchDifferences(
  where: CollectionOf,
  left: readonly SearchIndexDefinition[],
  right: readonly SearchIndexDefinition[],
): readonly StructureDifference[] {
  const differences: StructureDifference[] = [];
  for (const a of left) {
    const b = right.find((each) => each.name === a.name);
    differences.push(
      b === undefined
        ? {
            ...where,
            id: `${where.collection}\u0000search\u0000${a.name}`,
            object: 'search-index',
            name: a.name,
            kind: 'only-left',
            summary: text.summaries.searchMissing(a.type),
            left: searchDocument(a),
            steps: [createSearchStep(where.collection, a, false)],
          }
        : searchPair(where, a, b),
    );
  }
  for (const b of right.filter((each) => !left.some((a) => a.name === each.name))) {
    differences.push({
      ...where,
      id: `${where.collection}\u0000search-right\u0000${b.name}`,
      object: 'search-index',
      name: b.name,
      kind: 'only-right',
      summary: text.summaries.searchOnlyRight(b.type),
      right: searchDocument(b),
      steps: [
        { operation: { type: 'dropSearchIndex', collection: where.collection, name: b.name }, destructive: true },
      ],
    });
  }
  return differences;
}

function shardKeyDocument(key: ShardKey): Json {
  return { key: key.key, ...(key.unique === true ? { unique: true } : {}) };
}

/** The difference of the shard keys of a collection of two sharded clusters; `undefined` when neither is sharded. */
export function shardKeyDifference(
  where: CollectionOf,
  left: ShardKey | undefined,
  right: ShardKey | undefined,
): StructureDifference | undefined {
  const base = { ...where, id: `${where.collection}\u0000shard-key\u0000`, object: 'shard-key' as const };
  if (left === undefined && right === undefined) {
    return undefined;
  }
  if (right === undefined && left !== undefined) {
    const operation = {
      type: 'shardCollection',
      collection: where.collection,
      key: left.key,
      ...(left.unique === true ? { unique: true } : {}),
    } as const;
    const steps = [plain({ operation, note: text.stepNotes.shardIndex })];
    return {
      ...base,
      left: shardKeyDocument(left),
      kind: 'only-left',
      summary: text.summaries.shardedLeft(keysText(left.key)),
      steps,
    };
  }
  if (left === undefined && right !== undefined) {
    const steps = [plain({ note: text.stepNotes.unshard })];
    return {
      ...base,
      right: shardKeyDocument(right),
      kind: 'only-right',
      summary: text.summaries.shardedRight(keysText(right.key)),
      steps,
    };
  }
  return bothShardKeys(base, left, right);
}

function bothShardKeys(
  base: Omit<StructureDifference, 'kind' | 'summary' | 'steps'>,
  left: ShardKey | undefined,
  right: ShardKey | undefined,
): StructureDifference | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }
  const shown = { left: shardKeyDocument(left), right: shardKeyDocument(right) };
  if (isSame(shown.left, shown.right) && orderedText(left.key) === orderedText(right.key)) {
    return { ...base, ...shown, kind: 'same', summary: keysText(left.key), steps: [] };
  }
  return {
    ...base,
    ...shown,
    kind: 'different',
    summary: text.summaries.shardKeys(keysText(left.key), keysText(right.key)),
    fields: differingFields(shown.left, shown.right),
    steps: [plain({ note: text.stepNotes.reshard(keysText(left.key)) })],
  };
}
