/**
 * Feature: explain.shards
 *
 * On a sharded collection the explain has one plan per shard: a stage that has `shards` (`SINGLE_SHARD`,
 * `SHARD_MERGE`, `SHARD_MERGE_SORT`) gets one `SHARD` node per shard, with the shard's own numbers and its plan under
 * it. The nodes of the winning plan are made here, because a shard's plan is made of nodes and a node may have shards;
 * `explain.summary` makes its tree with {@link planNode}.
 */
import type { Json } from '../../shared/engine-request';
import {
  explainNumber,
  isJsonDocument,
  type JsonDocument,
  type NodeDetail,
  type PlannerShards,
  type WinningPlanNode,
} from './types';

/** The details of a node, in this order and only those present (`explain.summary`, rule 4). */
export const detailNames: readonly string[] = [
  'indexName',
  'keyPattern',
  'indexBounds',
  'filter',
  'sortPattern',
  'transformBy',
  'limitAmount',
  'skipAmount',
  'direction',
  'isMultiKey',
];

/** Whether stages are those of the classic engine: a stage whose name is in capitals, with numbers of its own. */
export function isClassic(stage: Json | undefined): stage is JsonDocument {
  if (!isJsonDocument(stage)) {
    return false;
  }
  const name = stage['stage'];
  return typeof name === 'string' && name === name.toUpperCase();
}

/** The logical plan of a `winningPlan`: the `queryPlan` inside it when there is one, else the plan itself. */
export function logicalPlan(winning: Json | undefined): JsonDocument | undefined {
  if (!isJsonDocument(winning)) {
    return undefined;
  }
  const inner = winning['queryPlan'];
  return isJsonDocument(inner) ? inner : winning;
}

/** The key of a shard's name in {@link PlannerShards}. */
export function shardKey(name: Json | undefined): string {
  return JSON.stringify(name ?? null);
}

/** The entries of the shards of a `winningPlan` of the query planner, by name. */
export function plannerShardsOf(winning: Json | undefined): PlannerShards {
  const shards = isJsonDocument(winning) ? winning['shards'] : undefined;
  const entries = Array.isArray(shards) ? (shards as readonly Json[]).filter(isJsonDocument) : [];
  return new Map(entries.map((shard) => [shardKey(shard['shardName']), shard]));
}

function detailsOf(stage: JsonDocument): readonly NodeDetail[] {
  const details: NodeDetail[] = [];
  for (const name of detailNames) {
    const value = stage[name];
    if (value !== undefined) {
      details.push({ name, value });
    }
  }
  return details;
}

/** The numbers of a node, each only when it is a number. */
function withNumbers(
  node: Omit<WinningPlanNode, 'returned' | 'keysExamined' | 'docsExamined' | 'milliseconds'>,
  numbers: readonly [Json | undefined, Json | undefined, Json | undefined, Json | undefined],
): WinningPlanNode {
  const [returned, keys, docs, milliseconds] = numbers.map(explainNumber);
  return {
    ...node,
    ...(returned === undefined ? {} : { returned }),
    ...(keys === undefined ? {} : { keysExamined: keys }),
    ...(docs === undefined ? {} : { docsExamined: docs }),
    ...(milliseconds === undefined ? {} : { milliseconds }),
  };
}

/** The inputs of a stage, in order: its `inputStage`, its `inputStages`, its `queryPlan`. */
function inputsOf(stage: JsonDocument): readonly JsonDocument[] {
  const inputs: JsonDocument[] = [];
  const input = stage['inputStage'];
  if (isJsonDocument(input)) {
    inputs.push(input);
  }
  const several = stage['inputStages'];
  if (Array.isArray(several)) {
    inputs.push(...(several as readonly Json[]).filter(isJsonDocument));
  }
  const queryPlan = stage['queryPlan'];
  if (isJsonDocument(queryPlan)) {
    inputs.push(queryPlan);
  }
  return inputs;
}

/** A node of the winning plan from a stage of the explain, its inputs and then its shards under it. */
export function planNode(stage: JsonDocument, plannerShards: PlannerShards = new Map()): WinningPlanNode {
  const name = stage['stage'];
  const children = [
    ...inputsOf(stage).map((input) => planNode(input, plannerShards)),
    ...shardNodes(stage, plannerShards),
  ];
  return withNumbers({ stage: typeof name === 'string' ? name : '?', details: detailsOf(stage), children }, [
    stage['nReturned'],
    stage['keysExamined'],
    stage['docsExamined'],
    stage['executionTimeMillisEstimate'],
  ]);
}

/** The node of one shard: its name, its numbers, and its plan as its only child. */
function shardNode(shard: JsonDocument, plannerShards: PlannerShards): WinningPlanNode {
  const name = shard['shardName'];
  const winning = shard['winningPlan'] ?? plannerShards.get(shardKey(name))?.['winningPlan'];
  const stages = shard['executionStages'];
  const inner = isClassic(stages) ? stages : logicalPlan(winning);
  return withNumbers(
    {
      stage: 'SHARD',
      details: name === undefined ? [] : [{ name: 'shardName', value: name }],
      children: inner === undefined ? [] : [planNode(inner)],
    },
    [shard['nReturned'], shard['totalKeysExamined'], shard['totalDocsExamined'], shard['executionTimeMillis']],
  );
}

/**
 * Feature: explain.shards — the `SHARD` nodes of a stage that has `shards`, in the order of the output; none for any
 * other stage. `plannerShards` are the shards of the query planner's winning plan, whose logical plans the statistics
 * do not repeat.
 */
export function shardNodes(stage: JsonDocument, plannerShards: PlannerShards): readonly WinningPlanNode[] {
  const shards = stage['shards'];
  if (!Array.isArray(shards)) {
    return [];
  }
  return (shards as readonly Json[]).filter(isJsonDocument).map((shard) => shardNode(shard, plannerShards));
}
