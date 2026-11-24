/**
 * Feature: mcp.refuse-write-stages
 *
 * Pipelines are the one way a read of MongoDB could write, stay open, or reach what the collection does not hold: the
 * `pipeline` argument of a tool is read into stages as the pipeline editor reads it (`aggregate.from-text`,
 * `aggregate.build`), and a pipeline is refused before anything is sent or a tab opens when a stage of it, or of the
 * pipelines nested in `$facet`, `$lookup` and `$unionWith` to any depth, writes (`$out`, `$merge`), is not a plain read
 * of the collection (`$changeStream`, `$currentOp`, `$queryStats`…), or joins a `system.*` collection. Spaces around a
 * stage's name are ignored. These refusals hold whatever `datardo.mcp.readData` says.
 */
import type { Json } from '../../shared/engine-request';
import { builtPipeline } from '../aggregate/build';
import { pipelineStages } from '../aggregate/from-text';
import type { Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { stageName, writeStageNames, type Stage } from '../aggregate/types';
import { isSystemCollection, systemCollectionsWords } from './tool/system-collections';

/** The pipeline of a text: its stages for a tab, and the pipeline sent to MongoDB; or the sentence of its refusal. */
export type ReadPipeline =
  | {
      readonly ok: true;
      readonly stages: readonly Stage[];
      readonly pipeline: readonly Json[];
      /** The names of the stages, in order: `$match`, `$group`. */
      readonly names: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * The stages that are not a plain read of the collection the pipeline runs on: they write, stay open waiting for
 * changes, list what the server and its other sessions are doing, or give the queries other clients ran.
 */
export const notPlainReadStages: readonly string[] = [
  ...writeStageNames,
  '$changeStream',
  '$changeStreamSplitLargeEvent',
  '$currentOp',
  '$listSessions',
  '$listLocalSessions',
  '$queryStats',
  '$listSampledQueries',
  '$planCacheStats',
];

/** How deep pipelines may nest: deeper than any real read, so that a pipeline built to nest without end is refused. */
export const deepestNesting = 20;

/** A pipeline nested deeper than {@link deepestNesting}. */
class TooDeep extends Error {}

type Visit = (name: string, body: Json) => void;

function recordOf(value: Json | undefined): Readonly<Record<string, Json>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)
    : undefined;
}

/** The pipelines nested in a stage: the facets of `$facet`, the `pipeline` of `$lookup` and of `$unionWith`. */
function nestedPipelines(name: string, body: Json): readonly Json[] {
  const record = recordOf(body);
  if (record === undefined) {
    return [];
  }
  if (name === '$facet') {
    return Object.values(record).filter((each) => Array.isArray(each));
  }
  const pipeline = record['pipeline'];
  return (name === '$lookup' || name === '$unionWith') && Array.isArray(pipeline) ? [pipeline] : [];
}

/** Calls `visit` with every stage of a pipeline, its name trimmed, and of the pipelines nested in it. */
function walkStages(pipeline: Json, visit: Visit, depth = 0): void {
  if (depth > deepestNesting) {
    throw new TooDeep();
  }
  const stages: readonly Json[] = Array.isArray(pipeline) ? (pipeline as readonly Json[]) : [pipeline];
  for (const stage of stages) {
    for (const [key, body] of Object.entries(recordOf(stage) ?? {})) {
      const name = key.trim();
      visit(name, body);
      for (const nested of nestedPipelines(name, body)) {
        walkStages(nested, visit, depth + 1);
      }
    }
  }
}

/** The first stage, at any depth, that is not a plain read; `undefined` when there is none. */
export function notPlainReadStage(pipeline: Json): string | undefined {
  let found: string | undefined;
  walkStages(pipeline, (name) => {
    if (found === undefined && notPlainReadStages.includes(name)) {
      found = name;
    }
  });
  return found;
}

/** The first stage, at any depth, that writes (`$out`, `$merge`); `undefined` when there is none or it nests too deep. */
export function writeStageAnywhere(pipeline: Json): string | undefined {
  try {
    const found = notPlainReadStage(pipeline);
    return found !== undefined && writeStageNames.includes(found) ? found : undefined;
  } catch (error: unknown) {
    if (error instanceof TooDeep) {
      return 'a pipeline nested too deeply';
    }
    throw error;
  }
}

/** A collection a stage joins: the string, or the `coll` of `{ db, coll }`. */
function joinedName(value: Json | undefined): string | undefined {
  const name = typeof value === 'string' ? value : recordOf(value)?.['coll'];
  return typeof name === 'string' ? name : undefined;
}

/** The collections a pipeline reads besides its own: the `from` of `$lookup` and `$graphLookup`, `$unionWith`'s. */
export function joinedCollections(pipeline: Json): readonly string[] {
  const names: string[] = [];
  walkStages(pipeline, (name, body) => {
    const joined =
      name === '$unionWith'
        ? joinedName(recordOf(body)?.['coll'] ?? body)
        : name === '$lookup' || name === '$graphLookup'
          ? joinedName(recordOf(body)?.['from'])
          : undefined;
    if (typeof joined === 'string') {
      names.push(joined);
    }
  });
  return names;
}

function refused(message: string): ReadPipeline {
  return { ok: false, message };
}

/** The refusal of a pipeline's stages, at any depth, or `undefined` when it is a plain read of its collection. */
function stagesProblem(value: Json): string | undefined {
  try {
    const stage = notPlainReadStage(value);
    if (stage !== undefined) {
      return writeStageNames.includes(stage)
        ? `${stage} writes to the database: Datardo's MCP server only reads.`
        : `${stage} is refused: Datardo's MCP server runs only pipelines that read the collection (watch_changes follows the changes, current_operations lists the operations, slow_queries gives the query shapes).`;
    }
    const system = joinedCollections(value).find(isSystemCollection);
    return system === undefined
      ? undefined
      : `The pipeline reads ${system}: Datardo's MCP server doesn't read ${systemCollectionsWords}.`;
  } catch (error: unknown) {
    if (error instanceof TooDeep) {
      return 'Pipeline: The pipeline is nested too deeply';
    }
    throw error;
  }
}

/**
 * Feature: mcp.refuse-write-stages — the stages of a pipeline written in mongosh syntax, or why it is refused:
 * `Pipeline: <the parser's message>`, `The pipeline is empty.`, `$out writes to the database: Datardo's MCP server
 * only reads.`, `$currentOp is refused: …`, `The pipeline reads system.users: …`.
 */
export function readPipeline(text: string, makers: Makers = {}): ReadPipeline {
  const parsed = valueOf(text, makers);
  if (!parsed.ok) {
    return refused(`Pipeline: ${parsed.message}`);
  }
  const problem = stagesProblem(parsed.value);
  if (problem !== undefined) {
    return refused(problem);
  }
  const read = pipelineStages(text, makers);
  if (!read.ok) {
    return refused(`Pipeline: ${read.message}`);
  }
  if (read.stages.length === 0) {
    return refused('The pipeline is empty.');
  }
  const built = builtPipeline(read.stages, read.stages.length - 1, makers);
  if (!built.ok) {
    return refused(`Pipeline: ${built.message}`);
  }
  return { ok: true, stages: read.stages, pipeline: built.pipeline, names: read.stages.map(stageName) };
}
