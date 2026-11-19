/**
 * Feature: mcp.refuse-write-stages
 *
 * Pipelines are the one way a read of MongoDB could write: the `pipeline` argument of a tool is read into stages as
 * the pipeline editor reads it (`aggregate.from-text`, `aggregate.build`), and a pipeline with a stage named `$out` or
 * `$merge`, spaces around the name ignored, is refused before anything is sent or a tab opens.
 */
import type { Json } from '../../shared/engine-request';
import { builtPipeline } from '../aggregate/build';
import { pipelineStages } from '../aggregate/from-text';
import type { Makers } from '../aggregate/mongosh/helpers';
import { valueOf } from '../aggregate/mongosh/parse';
import { stageName, writeStageNames, type Stage } from '../aggregate/types';

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

function refused(message: string): ReadPipeline {
  return { ok: false, message };
}

/** The first stage, among the items of the text, whose only key is `$out` or `$merge` once trimmed. */
function writeStageOf(value: Json): string | undefined {
  const items: readonly Json[] = Array.isArray(value) ? (value as readonly Json[]) : [value];
  for (const item of items) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      continue;
    }
    const name = Object.keys(item).find((key) => writeStageNames.includes(key.trim()));
    if (name !== undefined) {
      return name.trim();
    }
  }
  return undefined;
}

/**
 * Feature: mcp.refuse-write-stages — the stages of a pipeline written in mongosh syntax, or why it is refused:
 * `Pipeline: <the parser's message>`, `The pipeline is empty.`, `$out writes to the database: Datardo's MCP server
 * only reads.`
 */
export function readPipeline(text: string, makers: Makers = {}): ReadPipeline {
  const parsed = valueOf(text, makers);
  if (!parsed.ok) {
    return refused(`Pipeline: ${parsed.message}`);
  }
  const writes = writeStageOf(parsed.value);
  if (writes !== undefined) {
    return refused(`${writes} writes to the database: Datardo's MCP server only reads.`);
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
