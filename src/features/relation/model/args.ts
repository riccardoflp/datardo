/**
 * What the operations of the relation area are started with (`Intent.args`): the connection and database, the
 * references of the diagram as the page holds them, its boxes where they are, **Keys only**. The window sends them as
 * the page shows them; a start without them is a fault of the caller, not something the user can cause.
 */
import type { Json } from '../../../shared/engine-request';
import type { Answers, Context } from '../../../shared/feature';
import { connectionId, type ConnectionId } from '../../../shared/ids';
import { startArgs } from '../../nav/types';
import type { Box, ReferenceGraph, Relation } from '../types';

/** A record of the arguments. */
export type ArgsRecord = Readonly<Record<string, unknown>>;

/** Whether a value is an object that is not an array. */
export function isRecord(value: unknown): value is ArgsRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The connection and database a feature works on: from the arguments, or from the target. */
export interface DatabasePlace {
  readonly connection: ConnectionId;
  readonly database: string;
}

/** The connection and database of the arguments or of the target; `undefined` when neither names one. */
export function databasePlaceOf(context: Context, args: ArgsRecord): DatabasePlace | undefined {
  const { connection, database } = args;
  if (typeof connection === 'string' && typeof database === 'string') {
    return { connection: connectionId(connection), database };
  }
  const target = context.target;
  return target.kind === 'database' || target.kind === 'collection'
    ? { connection: target.connection, database: target.database }
    : undefined;
}

/** The references a page holds, as given in the arguments. */
export function graphArg(args: ArgsRecord): ReferenceGraph | undefined {
  const graph = args['graph'];
  if (!isRecord(graph) || typeof graph['database'] !== 'string') {
    return undefined;
  }
  return Array.isArray(graph['collections']) && Array.isArray(graph['relations'])
    ? (graph as unknown as ReferenceGraph)
    : undefined;
}

/** The relations given in the arguments under `name`; none when absent. */
export function relationsArg(args: ArgsRecord, name: string): readonly Relation[] {
  const value = args[name];
  return Array.isArray(value) ? (value as readonly Relation[]) : [];
}

/** The boxes of the page, where they are. */
export function boxesArg(args: ArgsRecord): readonly Box[] | undefined {
  const boxes = args['boxes'];
  return Array.isArray(boxes) ? (boxes as readonly Box[]) : undefined;
}

/** The arguments of an operation, and the place it works on, which every control that starts it names. */
export function requiredStart(context: Context, answers: Answers): { args: ArgsRecord; place: DatabasePlace } {
  const args = startArgs(answers);
  const place = databasePlaceOf(context, args);
  if (place === undefined) {
    throw new Error(`${context.feature} is started on a database.`);
  }
  return { args, place };
}

/** A value of the arguments as JSON, `undefined` when absent. */
export function jsonArg(args: ArgsRecord, name: string): Json | undefined {
  return args[name] as Json | undefined;
}
