/**
 * The arguments the tools share, as `tools/list` declares them, and how a tool is declared: the MongoDB tools keep the
 * names, arguments and bounds they have in Mongoster.
 */
import type { Context } from '../../../shared/feature';
import type { InputSchema, PropertySchema, ToolCall, ToolDefinition, ToolEnd, ToolGroup, ToolStep } from '../types';
import { stepOf, type ToolRun } from './program';

/** `connection`: a name or an id. */
export const connectionProp: PropertySchema = {
  type: 'string',
  description: 'Connection name or id, from list_connections.',
};

/** `database` of MongoDB. */
export const databaseProp: PropertySchema = { type: 'string', description: 'Database name.' };

/** `collection` of MongoDB. */
export const collectionProp: PropertySchema = { type: 'string', description: 'Collection or view name.' };

/** `filter`, in mongosh syntax. */
export const filterProp: PropertySchema = {
  type: 'string',
  description:
    'Filter in mongosh syntax, e.g. { status: "active", createdAt: { $gte: ISODate("2024-01-01") }, _id: ObjectId("…") }. Empty for all documents.',
};

/** `sort`, in mongosh syntax. */
export const sortProp: PropertySchema = {
  type: 'string',
  description: 'Sort in mongosh syntax, e.g. { createdAt: -1 }.',
};

/** `projection`, in mongosh syntax. */
export const projectionProp: PropertySchema = {
  type: 'string',
  description: 'Projection in mongosh syntax, e.g. { name: 1, email: 1 }.',
};

/** `pipeline`, in mongosh syntax. */
export const pipelineProp: PropertySchema = {
  type: 'string',
  description:
    'Aggregation pipeline in mongosh syntax, e.g. [ { $match: { status: "active" } }, { $group: { _id: "$city", n: { $sum: 1 } } } ]. $out and $merge are refused.',
};

/** `database` of Redis: the index. */
export const redisDatabaseProp: PropertySchema = {
  type: 'integer',
  minimum: 0,
  description: 'Database index (0 for db0). Default: the database of the connection string, else 0.',
};

/** `key` of Redis. */
export const keyProp: PropertySchema = {
  type: 'string',
  description: 'Key name; a byte that is not UTF-8 is written \\x and two hexadecimal digits, a backslash \\\\.',
};

/** A whole number between bounds, with its default. */
export function integerProp(lowest: number, highest: number, otherwise: number, description: string): PropertySchema {
  return { type: 'integer', minimum: lowest, maximum: highest, default: otherwise, description };
}

/** A switch with its default. */
export function booleanProp(otherwise: boolean, description?: string): PropertySchema {
  return { type: 'boolean', default: otherwise, ...(description === undefined ? {} : { description }) };
}

/** One of a fixed set of names. */
export function namesProp(names: readonly string[], description: string): PropertySchema {
  return { type: 'string', enum: names, description };
}

/** The schema of the arguments: these properties, these required. */
export function schemaOf(
  properties: Readonly<Record<string, PropertySchema>>,
  required: readonly string[],
): InputSchema {
  return { type: 'object', properties, ...(required.length === 0 ? {} : { required }), additionalProperties: false };
}

/** What a tool is declared with, its group aside. */
export interface ToolDeclaration {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly properties: Readonly<Record<string, PropertySchema>>;
  readonly required: readonly string[];
  readonly readsData?: boolean;
  readonly run: ToolRun;
}

/** The tools of a group, and how each runs. */
export interface ToolGroupOf {
  readonly tools: readonly ToolDefinition[];
  /** What the tool of a call needs next, or how it ended. */
  readonly step: (context: Context, call: ToolCall) => ToolStep;
}

/** The tools of a group, declared. */
export function groupOf(group: ToolGroup, declarations: readonly ToolDeclaration[]): ToolGroupOf {
  const tools = declarations.map((each): ToolDefinition => ({
    name: each.name,
    title: each.title,
    description: each.description,
    inputSchema: schemaOf(each.properties, each.required),
    readsData: each.readsData ?? false,
    group,
  }));
  return {
    tools,
    step: (context, call) => {
      const declared = declarations.find((each) => each.name === call.tool);
      return declared === undefined
        ? { kind: 'fail', message: `Unknown tool: ${call.tool}` }
        : stepOf(declared.run, context, call);
    },
  };
}

/** The end of a call once every round's replies are in; `undefined` while it still needs a round. */
export function endOf(step: ToolStep): ToolEnd | undefined {
  return step.kind === 'answer' || step.kind === 'fail' ? step : undefined;
}
