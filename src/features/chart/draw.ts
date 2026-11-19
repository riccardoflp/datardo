/**
 * Feature: chart.draw
 *
 * Runs the aggregation of a chart: the documents chosen by **Data**, then the stages of `chart.pipeline`. It writes
 * nothing, runs the same through a read-only connection, and is given up after 120 seconds.
 */
import type { MongoServerInfo } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadRequest } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { isVersionAtLeast, shortVersion } from '../connection/server-info';
import { chartData, type ChartData } from './data';
import { chartOptions } from './options';
import { chartStages } from './pipeline';
import { text } from './text';
import {
  isJsonDocument,
  type ChartInput,
  type ChartOptions,
  type ChartSource,
  type EditorStage,
  type JsonDocument,
} from './types';

/** How long the server may work on the aggregation of a chart, in milliseconds. */
export const chartTimeLimitMs = 120_000;

/** The version a histogram and dates grouped by a unit need (`$setWindowFields`, `$dateTrunc`). */
const leastVersion = [5, 0];

/** What a chart is drawn of: the collection or view of the tab, what the controls hold, and **Data**. */
export interface DrawArgs {
  readonly connection: string;
  readonly database: string;
  readonly collection: string;
  readonly input: ChartInput;
  readonly source: ChartSource;
}

/** The stages of the editor that are sent: the enabled ones up to the stage shown, or the first that does not parse. */
export type BuiltStages =
  | { readonly kind: 'stages'; readonly stages: readonly JsonDocument[] }
  | { readonly kind: 'invalid'; readonly message: string };

/** The enabled stages up to the stage shown, each as one document with the name of the stage and its body. */
export function builtStages(stages: readonly EditorStage[], shown: number): BuiltStages {
  const built: JsonDocument[] = [];
  for (const stage of stages.slice(0, shown + 1).filter((each) => each.enabled)) {
    if (stage.body.kind === 'invalid') {
      return { kind: 'invalid', message: `${stage.name}: ${stage.body.message}` };
    }
    built.push({ [stage.name]: stage.body.kind === 'value' ? stage.body.value : {} });
  }
  return { kind: 'stages', stages: built };
}

/** The stages before the chart's, or the refusal of what is chosen by **Data**. */
function sourceStages(source: ChartSource): readonly JsonDocument[] | Outcome {
  if (source.kind === 'filter') {
    const { filter } = source;
    if (filter.kind === 'invalid' || (filter.kind === 'value' && !isJsonDocument(filter.value))) {
      return refuse('chart.draw/invalid-filter', text.refusals.invalidFilter);
    }
    const empty = filter.kind === 'empty' || Object.keys(filter.value as JsonDocument).length === 0;
    return empty ? [] : [{ $match: filter.value }];
  }
  const built = builtStages(source.stages, source.shown);
  if (built.kind === 'invalid') {
    return refuse('chart.draw/invalid-stage', built.message);
  }
  const last = Object.keys(built.stages.at(-1) ?? {})[0];
  if (last === '$out' || last === '$merge') {
    return refuse('chart.draw/writes', text.refusals.writes(last));
  }
  return built.stages;
}

function serverOf(context: Context, connection: ConnectionId): MongoServerInfo | undefined {
  const server = context.state.connections.live[connection]?.server;
  return server?.engine === 'mongodb' ? server : undefined;
}

/** The refusal of a histogram, or of dates grouped by a unit, on a deployment older than 5.0. */
function versionRefusal(options: ChartOptions, server: MongoServerInfo | undefined): Outcome | undefined {
  if (server === undefined || server.version === '' || isVersionAtLeast(server.version, leastVersion)) {
    return undefined;
  }
  const version = shortVersion(server.version);
  if (options.type === 'histogram') {
    return refuse('chart.draw/unsupported', text.refusals.histogramVersion(version));
  }
  return options.unit === undefined
    ? undefined
    : refuse('chart.draw/unsupported', text.refusals.unitVersion(options.unit, version));
}

/** The arguments of a draw, as the section sends them. */
export function drawArgs(args: Json): DrawArgs {
  if (!isJsonDocument(args) || !isJsonDocument(args['input']) || !isJsonDocument(args['source'])) {
    throw new Error('chart.draw needs { connection, database, collection, input, source }.');
  }
  return args as unknown as DrawArgs;
}

/** Feature: chart.draw — the aggregation of the chart, or why it cannot be drawn. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const draw = drawArgs(args);
  const result = chartOptions(draw.input);
  if (result.kind === 'wrong') {
    return refuse('chart.draw/options', result.message);
  }
  const { options } = result;
  const before = sourceStages(draw.source);
  if (!Array.isArray(before)) {
    return before as Outcome;
  }
  const connection = connectionId(draw.connection);
  const refused = versionRefusal(options, serverOf(context, connection));
  if (refused !== undefined) {
    return refused;
  }
  const pipeline: Json = [...(before as readonly JsonDocument[]), ...chartStages(options)];
  return {
    kind: 'engine',
    requests: [
      {
        connection,
        request: {
          engine: 'mongodb',
          database: draw.database,
          collection: draw.collection,
          method: 'aggregate',
          arguments: [pipeline, { allowDiskUse: true, maxTimeMS: chartTimeLimitMs }],
          limit: options.limit,
          timeLimitMs: chartTimeLimitMs,
        },
      },
    ],
  };
}

/** Feature: chart.draw — what is drawn, from the documents the aggregation returned. */
export function parse(replies: readonly unknown[], args: Json): ChartData {
  const result = chartOptions(drawArgs(args).input);
  if (result.kind === 'wrong') {
    throw new Error(result.message);
  }
  const [rows] = replies;
  return chartData(result.options, Array.isArray(rows) ? (rows as readonly Json[]) : []);
}
