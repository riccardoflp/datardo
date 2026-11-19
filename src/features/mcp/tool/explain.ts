/**
 * The summary of `explain("executionStats")` that `explain_query` writes (`mcp.performance-tools`), and the index the
 * ESR rule suggests. The cards `explain.show` and `explain.suggest-index` are not on this branch: this is a stand-in
 * that reads the same fields (the plan, its stages and their numbers), to be replaced by theirs once they are built.
 */
import type { Json } from '../../../shared/engine-request';
import { isJsonObject, isOperatorObject, type JsonObject } from '../../query/mongosh/ejson';
import { counted } from '../output-limits';
import { listOf, numberIn, recordOf, shellText, textIn } from './mongo';

type Entry = Readonly<Record<string, unknown>>;

/** A stage of the plan, with its numbers. */
export interface PlanNode {
  readonly stage: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly children: readonly PlanNode[];
  readonly nReturned?: number;
  readonly keysExamined?: number;
  readonly docsExamined?: number;
  readonly timeMs?: number;
}

/** What the explanation says. */
export interface ExplainSummary {
  readonly plan?: PlanNode;
  readonly indexes: readonly string[];
  readonly collscan: boolean;
  readonly inMemorySort: boolean;
  readonly nReturned?: number;
  readonly keysExamined?: number;
  readonly docsExamined?: number;
  readonly timeMs?: number;
  readonly rejectedPlans: number;
  /** The aggregation stages run after the query layer. */
  readonly pipeline: readonly { readonly stage: string; readonly nReturned?: number; readonly timeMs?: number }[];
}

const detailKeys = ['indexName', 'keyPattern', 'filter', 'sortPattern', 'limitAmount', 'skipAmount', 'direction'];

function findWith(root: unknown, key: string, depth = 0): Entry | undefined {
  if (depth > 8 || typeof root !== 'object' || root === null) {
    return undefined;
  }
  if (!Array.isArray(root) && key in root) {
    return root as Entry;
  }
  for (const value of Array.isArray(root) ? (root as unknown[]) : Object.values(root)) {
    const found = findWith(value, key, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function numbersOf(stage: Entry): Omit<PlanNode, 'stage' | 'details' | 'children'> {
  const pairs = [
    ['nReturned', numberIn(stage['nReturned'])],
    ['keysExamined', numberIn(stage['keysExamined'] ?? stage['totalKeysExamined'])],
    ['docsExamined', numberIn(stage['docsExamined'] ?? stage['totalDocsExamined'])],
    ['timeMs', numberIn(stage['executionTimeMillisEstimate'] ?? stage['executionTimeMillis'])],
  ] as const;
  return Object.fromEntries(pairs.filter(([, value]) => value !== undefined));
}

function nodeOf(stage: Entry): PlanNode {
  const inputs = [
    stage['inputStage'],
    ...listOf(stage['inputStages']),
    stage['queryPlan'],
    ...listOf(stage['shards']).map((shard) => recordOf(shard)['executionStages'] ?? recordOf(shard)['winningPlan']),
  ].filter((each) => typeof each === 'object' && each !== null);
  const details = Object.fromEntries(
    detailKeys.filter((key) => stage[key] !== undefined).map((key) => [key, stage[key]]),
  );
  return {
    stage: textIn(stage['stage']) ?? '?',
    details,
    children: inputs.map((each) => nodeOf(recordOf(each))),
    ...numbersOf(stage),
  };
}

function walk(node: PlanNode | undefined, visit: (node: PlanNode) => void): void {
  if (node !== undefined) {
    visit(node);
    node.children.forEach((child) => {
      walk(child, visit);
    });
  }
}

function classic(stage: unknown): boolean {
  const name = textIn(recordOf(stage)['stage']);
  return name !== undefined && name === name.toUpperCase();
}

/** The summary of an explanation, of a find or of an aggregation. */
export function summarizeExplain(raw: unknown): ExplainSummary {
  const holder = findWith(raw, 'queryPlanner');
  const planner = recordOf(holder?.['queryPlanner']);
  const stats = recordOf(holder?.['executionStats'] ?? findWith(raw, 'executionStats')?.['executionStats']);
  const winning = recordOf(planner['winningPlan']);
  const logical = winning['queryPlan'] === undefined ? winning : recordOf(winning['queryPlan']);
  const executed = stats['executionStages'];
  const plan = classic(executed)
    ? nodeOf(recordOf(executed))
    : Object.keys(logical).length > 0
      ? nodeOf(logical)
      : undefined;
  const indexes = new Set<string>();
  let collscan = false;
  let inMemorySort = false;
  walk(plan, (node) => {
    const index = textIn(node.details['indexName']);
    if (index !== undefined) {
      indexes.add(index);
    }
    collscan ||= node.stage === 'COLLSCAN';
    inMemorySort ||= node.stage === 'SORT';
  });
  const pipeline = listOf(recordOf(raw)['stages'])
    .map(recordOf)
    .flatMap((stage) => {
      const name = Object.keys(stage).find((key) => key.startsWith('$'));
      return name === undefined || name === '$cursor' ? [] : [{ stage: name, ...numbersOf(stage) }];
    });
  return {
    ...(plan === undefined ? {} : { plan }),
    indexes: [...indexes],
    collscan,
    inMemorySort,
    ...numbersOf(stats),
    rejectedPlans: listOf(planner['rejectedPlans']).length,
    pipeline,
  };
}

const rangeOperators = new Set(['$gt', '$gte', '$lt', '$lte', '$ne', '$nin', '$regex', '$exists', '$not']);

function equalityOrRange(value: Json): 'equality' | 'range' | undefined {
  if (isJsonObject(value) && '$regularExpression' in value) {
    return 'range';
  }
  if (!isOperatorObject(value)) {
    return 'equality';
  }
  const operators = Object.keys(value);
  if (operators.some((each) => each === '$eq' || each === '$in' || each === '$elemMatch')) {
    return 'equality';
  }
  return operators.some((each) => rangeOperators.has(each)) ? 'range' : undefined;
}

/** The index of a filter and a sort by the ESR rule: equality fields, then the sort, then range fields. */
export function suggestIndex(
  filter: JsonObject,
  sort: JsonObject | undefined,
): Readonly<Record<string, 1 | -1>> | undefined {
  const fields = Object.entries(filter).filter(([key]) => !key.startsWith('$'));
  const index: Record<string, 1 | -1> = {};
  for (const [key] of fields.filter(([, value]) => equalityOrRange(value) === 'equality')) {
    index[key] = 1;
  }
  for (const [key, direction] of Object.entries(sort ?? {})) {
    index[key] ??= numberIn(direction) === -1 ? -1 : 1;
  }
  for (const [key] of fields.filter(([, value]) => equalityOrRange(value) === 'range')) {
    index[key] ??= 1;
  }
  return Object.keys(index).length === 0 ? undefined : index;
}

/** `db.getCollection("orders").createIndex({ status: 1, createdAt: -1 })`. */
export function createIndexCommand(collection: string, keys: Readonly<Record<string, unknown>>): string {
  return `db.getCollection(${JSON.stringify(collection)}).createIndex(${shellText(keys)})`;
}

function countText(value: number | undefined): string {
  return value === undefined ? '?' : value.toLocaleString('en-US');
}

function planLines(node: PlanNode, depth = 0): readonly string[] {
  const counts = [
    ...(node.nReturned === undefined ? [] : [`${countText(node.nReturned)} out`]),
    ...(node.keysExamined === undefined ? [] : [`${countText(node.keysExamined)} keys`]),
    ...(node.docsExamined === undefined ? [] : [`${countText(node.docsExamined)} docs`]),
    ...(node.timeMs === undefined ? [] : [`~${String(node.timeMs)} ms`]),
  ];
  const details = Object.entries(node.details).map(([key, value]) => `${key}: ${shellText(value)}`);
  const line = `${'  '.repeat(depth)}${depth > 0 ? '└ ' : ''}${node.stage}${counts.length === 0 ? '' : ` (${counts.join(', ')})`}${details.length === 0 ? '' : `  ${details.join('  ')}`}`;
  return [line, ...node.children.flatMap((child) => planLines(child, depth + 1))];
}

function verdictOf(summary: ExplainSummary): string {
  const verdict = [
    ...(summary.collscan ? ['COLLSCAN (every document of the collection is read: no index serves the filter)'] : []),
    ...(summary.indexes.length === 0 ? [] : [`index ${summary.indexes.join(', ')}`]),
    ...(!summary.collscan && summary.indexes.length === 0 && summary.plan !== undefined ? [summary.plan.stage] : []),
    ...(summary.inMemorySort ? ['in-memory sort (no index gives the order)'] : []),
    ...(summary.rejectedPlans === 0 ? [] : [counted(summary.rejectedPlans, 'rejected plan')]),
  ];
  return `Plan: ${verdict.length === 0 ? 'unknown' : verdict.join('; ')}.`;
}

function numbersLines(summary: ExplainSummary): readonly string[] {
  const numbers = [
    ...(summary.nReturned === undefined ? [] : [`returned ${countText(summary.nReturned)}`]),
    ...(summary.keysExamined === undefined ? [] : [`keys examined ${countText(summary.keysExamined)}`]),
    ...(summary.docsExamined === undefined ? [] : [`documents examined ${countText(summary.docsExamined)}`]),
    ...(summary.timeMs === undefined ? [] : [`time ${countText(summary.timeMs)} ms`]),
  ];
  const examined = summary.docsExamined ?? 0;
  const returned = summary.nReturned ?? 0;
  const ratio =
    examined > 0 && examined >= Math.max(returned, 1) * 10
      ? [
          returned > 0
            ? `${countText(Math.round(examined / returned))} documents examined for each one returned.`
            : `${countText(examined)} documents examined, none returned.`,
        ]
      : [];
  return [...(numbers.length === 0 ? [] : [`${numbers.join(', ')}.`]), ...ratio];
}

/** The text of `explain_query`: the verdict, the numbers, the suggested index, the plan and the later stages. */
export function explainText(
  head: string,
  collection: string,
  summary: ExplainSummary,
  suggestion: Readonly<Record<string, 1 | -1>> | undefined,
): string {
  const lines = [head, verdictOf(summary), ...numbersLines(summary)];
  if (suggestion !== undefined) {
    lines.push(
      `Suggested index (equality fields, then the sort, then range fields: the ESR rule): ${shellText(suggestion)}`,
      `  ${createIndexCommand(collection, suggestion)}`,
    );
  }
  if (summary.plan !== undefined) {
    lines.push('', 'Query plan:', ...planLines(summary.plan));
  }
  if (summary.pipeline.length > 0) {
    lines.push(
      '',
      'Pipeline stages after the query:',
      ...summary.pipeline.map((stage) => {
        const counts = [
          ...(stage.nReturned === undefined ? [] : [`${countText(stage.nReturned)} out`]),
          ...(stage.timeMs === undefined ? [] : [`~${String(stage.timeMs)} ms`]),
        ];
        return `- ${stage.stage}${counts.length === 0 ? '' : ` (${counts.join(', ')})`}`;
      }),
    );
  }
  return lines.join('\n');
}
