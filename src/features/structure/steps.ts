/**
 * Feature: structure.steps
 *
 * For each difference between two databases, the steps that make the right side like the left one, which of them
 * drop something, and what no command can do: **Apply…** runs the steps, the script writes them. The collections
 * are compared in order of name: one only on a side, a view against a collection, then the options, the shard key
 * (both sharded clusters), the indexes and the search indexes (both with search). Ported from Mongoster's
 * `src/shared/structure.ts › diffStructure`.
 */
import type { Json } from '../../shared/engine-request';
import { text } from './text';
import type {
  CollectionStructure,
  DatabaseStructure,
  DifferenceCounts,
  DifferenceKind,
  StructureComparison,
  StructureDifference,
} from './types';
import { createSteps, optionSteps, type CreateWith } from './model/collection-steps';
import { differingFields } from './model/fields';
import { indexDocument, indexDifferences, searchDifferences, shardKeyDifference } from './model/index-differences';
import { isSame } from './model/values';

function searchCount(database: DatabaseStructure): number {
  return database.collections.reduce((count, each) => count + (each.searchIndexes?.length ?? 0), 0);
}

/** What was not compared, and why: search indexes without search on both sides, shard keys without two clusters. */
function notesOf(left: DatabaseStructure, right: DatabaseStructure): readonly string[] {
  const notes: string[] = [];
  if (left.search !== 'ok' || right.search !== 'ok') {
    const sides = [
      ['left', left, right, 'right'],
      ['right', right, left, 'left'],
    ] as const;
    for (const [side, database, other, otherSide] of sides) {
      if (database.search === 'error') {
        notes.push(text.notes.searchUnreadable(side, database.searchError ?? text.notes.unknownError));
      } else if (database.search === 'unsupported' && other.search === 'ok' && searchCount(other) > 0) {
        notes.push(text.notes.noSearch(side, searchCount(other), otherSide));
      }
    }
  }
  if (left.sharded !== right.sharded) {
    const [side, database] = left.sharded ? (['left', left] as const) : (['right', right] as const);
    if (database.collections.some((each) => each.shardKey !== undefined)) {
      notes.push(text.notes.shardKeys(side));
    }
  }
  return notes;
}

/** A collection as its definition is shown for a difference of a whole collection. */
function collectionDocument(collection: CollectionStructure): Json {
  return {
    type: collection.type,
    ...(Object.keys(collection.options).length > 0 ? { options: collection.options } : {}),
    ...(collection.type === 'view' ? {} : { indexes: collection.indexes.map(indexDocument) }),
    ...((collection.searchIndexes?.length ?? 0) > 0
      ? {
          searchIndexes: (collection.searchIndexes ?? []).map((each) => ({
            name: each.name,
            type: each.type,
            definition: each.definition,
          })),
        }
      : {}),
    ...(collection.shardKey === undefined
      ? {}
      : {
          shardKey: { key: collection.shardKey.key, ...(collection.shardKey.unique === true ? { unique: true } : {}) },
        }),
  };
}

function viewOnOf(collection: CollectionStructure): { readonly viewOn?: string } {
  const on = collection.options['viewOn'];
  return collection.type === 'view' && typeof on === 'string' ? { viewOn: on } : {};
}

function objectOf(collection: CollectionStructure): 'collection' | 'view' {
  return collection.type === 'view' ? 'view' : 'collection';
}

function onlyLeft(left: CollectionStructure, wanted: CreateWith): StructureDifference {
  const on = viewOnOf(left);
  return {
    id: `${left.name}\u0000collection\u0000`,
    collection: left.name,
    collectionType: left.type,
    object: objectOf(left),
    kind: 'only-left',
    summary:
      on.viewOn === undefined
        ? text.summaries.missingOnRight(left.type, left.indexes.length)
        : text.summaries.viewMissingOnRight(on.viewOn),
    left: collectionDocument(left),
    steps: createSteps(left, wanted),
    ...on,
  };
}

function onlyRight(right: CollectionStructure): StructureDifference {
  const dropsDocuments = right.type !== 'view';
  return {
    id: `${right.name}\u0000collection\u0000`,
    collection: right.name,
    collectionType: right.type,
    object: objectOf(right),
    kind: 'only-right',
    summary: text.summaries.onlyOnRight(right.type),
    right: collectionDocument(right),
    steps: [
      {
        operation: { type: 'drop', collection: right.name, dropsDocuments },
        destructive: true,
        ...(dropsDocuments ? { note: text.stepNotes.documentsDeleted } : {}),
      },
    ],
  };
}

function otherType(left: CollectionStructure, right: CollectionStructure, wanted: CreateWith): StructureDifference {
  const dropsDocuments = right.type !== 'view';
  return {
    id: `${left.name}\u0000collection\u0000`,
    collection: left.name,
    collectionType: left.type,
    object: objectOf(left),
    kind: 'different',
    summary: text.summaries.otherType(left.type, right.type),
    left: collectionDocument(left),
    right: collectionDocument(right),
    steps: [
      {
        operation: { type: 'drop', collection: left.name, dropsDocuments },
        destructive: true,
        note: text.stepNotes.recreated(right.type, left.type),
      },
      ...createSteps(left, wanted).map((step) => ({ ...step, destructive: true })),
    ],
    ...viewOnOf(left),
  };
}

function optionNames(left: CollectionStructure, right: CollectionStructure): readonly string[] {
  const names = [...new Set([...Object.keys(left.options), ...Object.keys(right.options)])];
  return names.filter((name) => !isSame(left.options[name], right.options[name]));
}

function optionsDifference(left: CollectionStructure, right: CollectionStructure): StructureDifference {
  const same = isSame(left.options, right.options);
  const on = viewOnOf(left);
  const sameSummary =
    on.viewOn === undefined ? text.summaries.sameOptions(Object.keys(left.options)) : text.summaries.viewOn(on.viewOn);
  return {
    id: `${left.name}\u0000options\u0000`,
    collection: left.name,
    collectionType: left.type,
    object: left.type === 'view' ? 'view' : 'options',
    kind: same ? 'same' : 'different',
    summary: same ? sameSummary : text.summaries.different(optionNames(left, right)),
    left: left.options,
    right: right.options,
    ...(same ? {} : { fields: differingFields(left.options, right.options) }),
    steps: same ? [] : optionSteps(left.name, left.type, left.options, right.options),
    ...on,
  };
}

function bothSides(
  left: CollectionStructure,
  right: CollectionStructure,
  wanted: CreateWith,
): readonly StructureDifference[] {
  const isView = (each: CollectionStructure): boolean => each.type === 'view';
  const isSeries = (each: CollectionStructure): boolean => each.type === 'timeseries';
  if (isView(left) !== isView(right) || isSeries(left) !== isSeries(right)) {
    return [otherType(left, right, wanted)];
  }
  const differences: StructureDifference[] = [optionsDifference(left, right)];
  if (left.type === 'view') {
    return differences;
  }
  const where = { collection: left.name, collectionType: left.type };
  const shardKey = wanted.shardKeys ? shardKeyDifference(where, left.shardKey, right.shardKey) : undefined;
  if (shardKey !== undefined) {
    differences.push(shardKey);
  }
  differences.push(...indexDifferences(where, left.indexes, right.indexes));
  if (wanted.search && left.searchIndexes !== undefined && right.searchIndexes !== undefined) {
    differences.push(...searchDifferences(where, left.searchIndexes, right.searchIndexes));
  }
  return differences;
}

function countsOf(differences: readonly StructureDifference[]): DifferenceCounts {
  const counts: Record<DifferenceKind, number> = { same: 0, different: 0, 'only-left': 0, 'only-right': 0 };
  for (const difference of differences) {
    counts[difference.kind] += 1;
  }
  return counts;
}

/** Feature: structure.steps — every difference (and what is the same) of two databases, by collection. */
export function diffStructure(left: DatabaseStructure, right: DatabaseStructure): StructureComparison {
  const wanted: CreateWith = {
    search: left.search === 'ok' && right.search === 'ok',
    shardKeys: left.sharded && right.sharded,
  };
  const leftByName = new Map(left.collections.map((each) => [each.name, each]));
  const rightByName = new Map(right.collections.map((each) => [each.name, each]));
  const names = [...new Set([...leftByName.keys(), ...rightByName.keys()])].sort((a, b) => a.localeCompare(b));
  const differences = names.flatMap((name): readonly StructureDifference[] => {
    const a = leftByName.get(name);
    const b = rightByName.get(name);
    if (a !== undefined && b !== undefined) {
      return bothSides(a, b, wanted);
    }
    return a === undefined ? (b === undefined ? [] : [onlyRight(b)]) : [onlyLeft(a, wanted)];
  });
  return { differences, counts: countsOf(differences), notes: notesOf(left, right) };
}
