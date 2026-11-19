/**
 * Feature: explain.summary
 *
 * From the explain as the server returns it, for a find or an aggregate, from a replica set or through mongos, to the
 * verdict (the indexes used, a COLLSCAN, an in-memory sort, the rejected plans), the four numbers, the tree of the
 * winning plan and the stages of the pipeline after the query. It never fails: an output it does not recognize gives
 * an empty summary.
 */
import type { Json } from '../../shared/engine-request';
import { isClassic, logicalPlan, planNode, plannerShardsOf } from './shards';
import {
  explainNumber,
  isJsonDocument,
  type ExplainNumbers,
  type ExplainSummary,
  type JsonDocument,
  type PlannerShards,
  type StageAfterQuery,
  type WinningPlanNode,
} from './types';

/** How deep the query is looked for: an object nested in more than eight others is not looked at (rule 1). */
export const deepestLevel = 8;

/** The first object that has `key`, searching objects and arrays in depth, the value itself at level 0. */
function holderOf(value: Json | undefined, key: string, level = 0): JsonDocument | undefined {
  if (level > deepestLevel || typeof value !== 'object' || value === null) {
    return undefined;
  }
  if (isJsonDocument(value) && key in value) {
    return value;
  }
  const inner: readonly Json[] = Array.isArray(value) ? (value as readonly Json[]) : Object.values(value);
  for (const each of inner) {
    const found = holderOf(each, key, level + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function documentOf(value: Json | undefined): JsonDocument | undefined {
  return isJsonDocument(value) ? value : undefined;
}

function numbersOf(statistics: JsonDocument | undefined): ExplainNumbers {
  const returned = explainNumber(statistics?.['nReturned']);
  const keys = explainNumber(statistics?.['totalKeysExamined']);
  const docs = explainNumber(statistics?.['totalDocsExamined']);
  const milliseconds = explainNumber(statistics?.['executionTimeMillis']);
  return {
    ...(returned === undefined ? {} : { returned }),
    ...(keys === undefined ? {} : { keysExamined: keys }),
    ...(docs === undefined ? {} : { docsExamined: docs }),
    ...(milliseconds === undefined ? {} : { milliseconds }),
  };
}

/** Every node of a tree, the root first. */
function nodesOf(node: WinningPlanNode | undefined): readonly WinningPlanNode[] {
  return node === undefined ? [] : [node, ...node.children.flatMap(nodesOf)];
}

function indexesOf(nodes: readonly WinningPlanNode[]): readonly string[] {
  const names: string[] = [];
  for (const node of nodes) {
    const name = node.details.find((detail) => detail.name === 'indexName')?.value;
    if (typeof name === 'string' && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function lengthOf(value: Json | undefined): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

/** The rejected plans of the planner, or else those of its shards added up (rule 6). */
function rejectedPlansOf(planner: JsonDocument | undefined, shards: PlannerShards): number {
  const own = lengthOf(planner?.['rejectedPlans']);
  if (own !== undefined) {
    return own;
  }
  let sum = 0;
  for (const shard of shards.values()) {
    sum += lengthOf(shard['rejectedPlans']) ?? 0;
  }
  return sum;
}

/** The stages of an aggregate after the query: each stage but `$cursor`, by its key that starts with `$` (rule 7). */
function stagesAfterQueryOf(output: Json): readonly StageAfterQuery[] {
  const stages = isJsonDocument(output) ? output['stages'] : undefined;
  if (!Array.isArray(stages)) {
    return [];
  }
  const after: StageAfterQuery[] = [];
  for (const stage of (stages as readonly Json[]).filter(isJsonDocument)) {
    const name = Object.keys(stage).find((key) => key.startsWith('$'));
    if (name === undefined || name === '$cursor') {
      continue;
    }
    const returned = explainNumber(stage['nReturned']);
    const milliseconds = explainNumber(stage['executionTimeMillisEstimate']);
    after.push({
      name,
      ...(returned === undefined ? {} : { returned }),
      ...(milliseconds === undefined ? {} : { milliseconds }),
    });
  }
  return after;
}

/** The tree: from classic execution stages with their numbers, else from the logical winning plan (rule 3). */
function treeOf(
  statistics: JsonDocument | undefined,
  winning: Json | undefined,
  shards: PlannerShards,
): WinningPlanNode | undefined {
  const stages = statistics?.['executionStages'];
  if (isClassic(stages)) {
    return planNode(stages, shards);
  }
  const logical = logicalPlan(winning);
  return logical === undefined ? undefined : planNode(logical);
}

/** The statistics of an explain: those beside the `queryPlanner`, or else the first found (rule 2). */
export function statisticsOf(output: Json): JsonDocument | undefined {
  const holder = holderOf(output, 'queryPlanner');
  return documentOf(holder?.['executionStats'] ?? holderOf(output, 'executionStats')?.['executionStats']);
}

/** Feature: explain.summary — the summary of an explain, whatever the server returned. */
export function explainSummary(output: Json): ExplainSummary {
  const holder = holderOf(output, 'queryPlanner');
  const planner = documentOf(holder?.['queryPlanner']);
  const statistics = statisticsOf(output);
  const winning = planner?.['winningPlan'];
  const shards = plannerShardsOf(winning);
  const tree = holder === undefined ? undefined : treeOf(statistics, winning, shards);
  const nodes = nodesOf(tree);
  return {
    ...(tree === undefined ? {} : { tree }),
    indexes: indexesOf(nodes),
    collscan: nodes.some((node) => node.stage === 'COLLSCAN'),
    inMemorySort: nodes.some((node) => node.stage === 'SORT'),
    numbers: holder === undefined ? {} : numbersOf(statistics),
    rejectedPlans: rejectedPlansOf(planner, shards),
    stagesAfterQuery: holder === undefined ? [] : stagesAfterQueryOf(output),
  };
}
