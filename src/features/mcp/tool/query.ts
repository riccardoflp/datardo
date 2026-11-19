/**
 * The filters, sorts, projections and pipelines a tool is given, in mongosh syntax (`mcp.arguments`,
 * `mcp.refuse-write-stages`): read, never evaluated, with the time of the context for `ISODate()` and ids made from it
 * for `ObjectId()`, so that nothing is drawn at random.
 */
import type { Json } from '../../../shared/engine-request';
import { makersOf } from '../../aggregate/types';
import { isJsonObject, type JsonObject } from '../../query/mongosh/ejson';
import { idOfTime, parsedValue } from '../../query/parse';
import { stringArg } from '../arguments';
import { readPipeline } from '../refuse-write-stages';
import type { Stage } from '../../aggregate/types';
import type { ToolArguments } from '../types';
import { ToolProblem, type ToolSession } from './program';

/** A query as the tool was given it: the texts, and their values. */
export interface QueryArgs {
  readonly text: { readonly filter: string; readonly sort: string; readonly projection: string };
  readonly filter: JsonObject;
  readonly sort?: JsonObject;
  readonly projection?: JsonObject;
}

/** The value of an argument in mongosh syntax, which must be an object; `undefined` when absent. */
export function mongoshObject(args: ToolArguments, key: string, now: number): JsonObject | undefined {
  const text = stringArg(args, key);
  if (text === undefined) {
    return undefined;
  }
  const parsed = parsedValue(text, now, () => idOfTime(now));
  if (!parsed.ok) {
    throw new ToolProblem(`${key}: ${parsed.error.message}`);
  }
  if (!isJsonObject(parsed.value)) {
    throw new ToolProblem(`${key} must be an object in mongosh syntax, like { status: "active" }.`);
  }
  return parsed.value;
}

/** `filter`, `sort` and `projection`, in mongosh syntax. */
export function queryArgs(session: ToolSession): QueryArgs {
  const { args, context } = session;
  const sort = mongoshObject(args, 'sort', context.now);
  const projection = mongoshObject(args, 'projection', context.now);
  return {
    text: {
      filter: stringArg(args, 'filter') ?? '',
      sort: stringArg(args, 'sort') ?? '',
      projection: stringArg(args, 'projection') ?? '',
    },
    filter: mongoshObject(args, 'filter', context.now) ?? {},
    ...(sort === undefined ? {} : { sort }),
    ...(projection === undefined ? {} : { projection }),
  };
}

/** A pipeline read for a tool: its stages and what is sent. */
export interface PipelineArgs {
  readonly stages: readonly Stage[];
  readonly pipeline: readonly Json[];
  readonly names: readonly string[];
}

/** `pipeline`, refused with `$out` or `$merge`, empty, or not a pipeline (`mcp.refuse-write-stages`). */
export function pipelineArg(session: ToolSession): PipelineArgs {
  const text = stringArg(session.args, 'pipeline') ?? '';
  const read = readPipeline(text, makersOf(session.context));
  if (!read.ok) {
    throw new ToolProblem(read.message);
  }
  return { stages: read.stages, pipeline: read.pipeline, names: read.names };
}
