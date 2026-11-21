/**
 * The app action `advisor.analyze` the tool `index_advice` asks (`mcp.performance-tools`): the reads of the Index
 * advisor for a database or one collection, one after the other as `advisor.show` sends them (`parts/reading.ts ›
 * nextRead`), each started by `read` as the MCP server starts a feature, then the advice of what they gave
 * (`advice-reply.ts`). Every read only reads; nothing is changed. The MCP area gives the runner (`mcp/index.ts`).
 */
import {
  analysisOf,
  nextRead,
  nothingRead,
  withReply,
  withSlowOperations,
  type AnalysisInput,
  type AnalysisProgress,
} from '../features/advisor/parts/reading';
import type { IndexesReply } from '../features/advisor/read-indexes';
import type { ScopeSlowOperations } from '../features/advisor/read-slow-operations';
import type { Scope } from '../features/advisor/types';
import { advisorReply } from '../features/mcp/tool/advice-reply';
import type { AdvisorReply } from '../features/mcp/tool/advice';
import type { IntentResult } from '../shared/bridge';
import type { Json } from '../shared/engine-request';
import type { ReadNeed } from '../shared/feature';
import { connectionId, type ConnectionId } from '../shared/ids';

/** Starts a read of the analysis on a connection, as the MCP server starts a feature. */
export type StartRead = (need: ReadNeed, connection: ConnectionId) => Promise<IntentResult>;

type Fields = Readonly<Record<string, Json>>;

function textOf(args: Json, name: string): string | undefined {
  const fields: Fields = typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Fields) : {};
  const value = fields[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The analysis input of `{ connection, database, collection? }`. */
function inputOf(args: Json): AnalysisInput {
  const connection = textOf(args, 'connection');
  const database = textOf(args, 'database');
  if (connection === undefined || database === undefined) {
    throw new Error('advisor.analyze needs { connection, database }.');
  }
  const collection = textOf(args, 'collection');
  const scope: Scope =
    collection === undefined ? { kind: 'database', database } : { kind: 'collection', database, collection };
  return { connection: connectionId(connection), scope, fallback: database };
}

/** `advisor.analyze` `{ connection, database, collection? }`: the reads of the scope, then its advice. */
export async function analyzeForTool(args: Json, read: StartRead): Promise<AdvisorReply> {
  const input = inputOf(args);
  let progress: AnalysisProgress = nothingRead;
  for (let need = nextRead(input, progress); need !== undefined; need = nextRead(input, progress)) {
    const result = await read(need, input.connection);
    if (result.kind !== 'read') {
      throw new Error(result.kind === 'failed' || result.kind === 'refused' ? result.message : 'nothing was read');
    }
    progress =
      need.key === 'slow'
        ? withSlowOperations(progress, result.result as ScopeSlowOperations)
        : withReply(progress, result.result as IndexesReply);
  }
  const analysis = analysisOf(input, progress);
  if (analysis === undefined) {
    throw new Error('the indexes and the slow operations could not all be read');
  }
  if (analysis.kind === 'failed') {
    throw new Error(analysis.message);
  }
  return advisorReply(analysis.indexes, analysis.slow, Date.now());
}
