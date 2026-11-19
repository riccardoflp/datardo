/**
 * What the explain area decides from and gives: the explain as the server returns it (canonical Extended JSON), the
 * nodes of the winning plan, the summary of `explain.summary`, and the keys of a suggested index.
 *
 * In these modules *the explain* is what the server returns and *the winning plan* is the plan the server chose; a
 * node is one stage of the winning plan, never a step of the plan of an operation (glossary).
 */
import type { Json } from '../../shared/engine-request';

/** A document of Extended JSON. */
export type JsonDocument = { readonly [key: string]: Json };

/** Whether a value is a document of Extended JSON (not an array, not null). */
export function isJsonDocument(value: Json | undefined): value is JsonDocument {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One detail of a node, `indexName: "status_1"`: its name and its value as the server gave it. */
export interface NodeDetail {
  readonly name: string;
  readonly value: Json;
}

/** One stage of the winning plan, with its details, its numbers when the explain has them, and its inputs. */
export interface WinningPlanNode {
  /** The name of the stage, `?` without one; `SHARD` for the plan of one shard. */
  readonly stage: string;
  /** In the order of `explain.summary`'s rule 4 (`shardName` alone for a shard). */
  readonly details: readonly NodeDetail[];
  readonly children: readonly WinningPlanNode[];
  /** `nReturned`. */
  readonly returned?: number;
  /** `keysExamined` (`totalKeysExamined` for a shard). */
  readonly keysExamined?: number;
  /** `docsExamined` (`totalDocsExamined` for a shard). */
  readonly docsExamined?: number;
  /** `executionTimeMillisEstimate` (`executionTimeMillis` for a shard). */
  readonly milliseconds?: number;
}

/** The four numbers of the explain, each absent when the explain does not have it as a number. */
export interface ExplainNumbers {
  readonly returned?: number;
  readonly keysExamined?: number;
  readonly docsExamined?: number;
  readonly milliseconds?: number;
}

/** A stage of a pipeline that runs after the query: its name (`$group`) and what the explain gives for it. */
export interface StageAfterQuery {
  readonly name: string;
  readonly returned?: number;
  readonly milliseconds?: number;
}

/** What `explain.summary` gives: the tree of the winning plan, the verdict, the numbers, the stages after the query. */
export interface ExplainSummary {
  /** The tree of the winning plan; absent when nothing is recognized. */
  readonly tree?: WinningPlanNode;
  /** The different `indexName` values of the tree, in the order met. */
  readonly indexes: readonly string[];
  /** Whether a stage is named `COLLSCAN`. */
  readonly collscan: boolean;
  /** Whether a stage is named `SORT`. */
  readonly inMemorySort: boolean;
  readonly numbers: ExplainNumbers;
  readonly rejectedPlans: number;
  readonly stagesAfterQuery: readonly StageAfterQuery[];
}

/** One key of an index: its field and its direction. */
export interface IndexKey {
  readonly field: string;
  readonly direction: 1 | -1;
}

/** Each shard's entry of the query planner, by its name as JSON: the statistics do not repeat its logical plan. */
export type PlannerShards = ReadonlyMap<string, JsonDocument>;

/**
 * A number as the explain gives it: a number of JSON, an `Int32` or a `Double` of canonical Extended JSON. Anything
 * else, a `Long` among them, is not a number here and is left out rather than shown as 0 (`explain.summary`).
 */
export function explainNumber(value: Json | undefined): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (!isJsonDocument(value)) {
    return undefined;
  }
  const keys = Object.keys(value);
  const inner = value['$numberInt'] ?? value['$numberDouble'];
  if (keys.length !== 1 || typeof inner !== 'string') {
    return undefined;
  }
  const number = Number(inner);
  return Number.isFinite(number) ? number : undefined;
}

/** The explain an explain is about: a find, or a pipeline (`explain.show`'s title). */
export type ExplainKind = 'find' | 'pipeline';
