/**
 * The steps that create a collection as it is on the left, and those that give the right collection the options of
 * the left one (`structure.steps`, the rules of collections and options). Ported from Mongoster's
 * `src/shared/structure.ts › createSteps`, `optionSteps`.
 */
import type { Json } from '../../../shared/engine-request';
import { text } from '../text';
import type { CollectionStructure, CollectionType, JsonObject, StructureStep } from '../types';
import { createOptions } from './index-change';
import { int, isDocument, isSame, numberValue } from './values';

/** What the creation of a collection includes besides its indexes: the shard key, the search indexes. */
export interface CreateWith {
  readonly search: boolean;
  readonly shardKeys: boolean;
}

/** A step that runs a command and drops nothing. */
export function plain(step: Omit<StructureStep, 'destructive'>): StructureStep {
  return { ...step, destructive: false };
}

/** The steps that create the collection `left` as it is, with its indexes, shard key and search indexes. */
export function createSteps(left: CollectionStructure, wanted: CreateWith): readonly StructureStep[] {
  const create = plain({ operation: { type: 'createCollection', collection: left.name, options: left.options } });
  if (left.type === 'view') {
    return [create];
  }
  const indexes = left.indexes.map((index) =>
    plain({
      operation: { type: 'createIndex', collection: left.name, keys: index.keys, options: createOptions(index) },
    }),
  );
  const shard =
    wanted.shardKeys && left.shardKey !== undefined
      ? [
          plain({
            operation: {
              type: 'shardCollection',
              collection: left.name,
              key: left.shardKey.key,
              ...(left.shardKey.unique === true ? { unique: true } : {}),
            },
          }),
        ]
      : [];
  const search = wanted.search
    ? (left.searchIndexes ?? []).map((index) =>
        plain({
          operation: {
            type: 'createSearchIndex',
            collection: left.name,
            name: index.name,
            searchType: index.type,
            definition: index.definition,
          },
        }),
      )
    : [];
  return [create, ...indexes, ...shard, ...search];
}

function viewSteps(name: string, left: JsonObject, right: JsonObject): readonly StructureStep[] {
  if (!isSame(left['collation'], right['collation'])) {
    // collMod cannot change a view's collation: it is created again, and a view holds no data.
    return [
      plain({
        operation: { type: 'drop', collection: name, dropsDocuments: false },
        note: text.stepNotes.viewCollation,
      }),
      plain({ operation: { type: 'createCollection', collection: name, options: left } }),
    ];
  }
  if (!isSame(left['viewOn'], right['viewOn']) || !isSame(left['pipeline'], right['pipeline'])) {
    const changes = { viewOn: left['viewOn'] ?? null, pipeline: left['pipeline'] ?? [] };
    return [plain({ operation: { type: 'collMod', collection: name, changes } })];
  }
  return [];
}

function timeseriesChange(left: JsonObject, right: JsonObject): JsonObject | undefined {
  const leftSeries = isDocument(left['timeseries']) ? left['timeseries'] : {};
  const rightSeries = isDocument(right['timeseries']) ? right['timeseries'] : {};
  const names = new Set([...Object.keys(leftSeries), ...Object.keys(rightSeries)]);
  const onlyGranularity = [...names].every(
    (name) => name === 'granularity' || isSame(leftSeries[name], rightSeries[name]),
  );
  const granularity = leftSeries['granularity'];
  return onlyGranularity && typeof granularity === 'string' ? { granularity } : undefined;
}

interface OptionChanges {
  readonly changes: Readonly<Record<string, Json>>;
  readonly manual: readonly string[];
}

function collModChanges(type: CollectionType, left: JsonObject, right: JsonObject): OptionChanges {
  const differs = (name: string): boolean => !isSame(left[name], right[name]);
  const changes: Record<string, Json> = {};
  const manual: string[] = [];
  if (differs('validator')) changes['validator'] = left['validator'] ?? {};
  if (differs('validationLevel')) changes['validationLevel'] = left['validationLevel'] ?? 'strict';
  if (differs('validationAction')) changes['validationAction'] = left['validationAction'] ?? 'error';
  if (differs('changeStreamPreAndPostImages')) {
    changes['changeStreamPreAndPostImages'] = left['changeStreamPreAndPostImages'] ?? { enabled: false };
  }
  const clustered = left['clusteredIndex'] !== undefined || right['clusteredIndex'] !== undefined;
  if (differs('expireAfterSeconds') && (type === 'timeseries' || clustered)) {
    changes['expireAfterSeconds'] = left['expireAfterSeconds'] ?? 'off';
  }
  if (differs('timeseries')) {
    const series = timeseriesChange(left, right);
    if (series === undefined) manual.push(text.stepNotes.timeseries);
    else changes['timeseries'] = series;
  }
  if (left['capped'] === true && right['capped'] === true) {
    if (differs('size')) changes['cappedSize'] = left['size'] ?? null;
    if (differs('max')) changes['cappedMax'] = left['max'] ?? int(0);
  }
  return { changes, manual };
}

function cappedSteps(name: string, left: JsonObject, right: JsonObject): OptionChanges & { steps: StructureStep[] } {
  const steps: StructureStep[] = [];
  const manual: string[] = [];
  if (left['capped'] === true && right['capped'] !== true && numberValue(left['size']) !== undefined) {
    steps.push({
      operation: { type: 'convertToCapped', collection: name, size: left['size'] ?? null },
      destructive: true,
      note: text.stepNotes.convertToCapped,
    });
  } else if (left['capped'] !== true && right['capped'] === true) {
    manual.push(text.stepNotes.uncapped);
  }
  return { changes: {}, manual, steps };
}

/** The steps that give the right collection or view `name` the options of the left one. */
export function optionSteps(
  name: string,
  type: CollectionType,
  left: JsonObject,
  right: JsonObject,
): readonly StructureStep[] {
  if (type === 'view') {
    return viewSteps(name, left, right);
  }
  const { changes, manual } = collModChanges(type, left, right);
  const steps: StructureStep[] = [];
  if (Object.keys(changes).length > 0) {
    steps.push(plain({ operation: { type: 'collMod', collection: name, changes } }));
  }
  const capped = cappedSteps(name, left, right);
  steps.push(...capped.steps);
  const notes = [...manual, ...capped.manual];
  if (!isSame(left['collation'], right['collation'])) notes.push(text.stepNotes.collation);
  if (!isSame(left['clusteredIndex'], right['clusteredIndex'])) notes.push(text.stepNotes.clustered);
  return [...steps, ...notes.map((note) => plain({ note }))];
}
