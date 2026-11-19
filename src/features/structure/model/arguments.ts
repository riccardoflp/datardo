/**
 * What the operations of the structure comparison page are started with: the two sides the page shows now, and the
 * last comparison (its two sides and every difference it found, also those the list hides), as the window keeps them.
 *
 * `{ left, right, comparison?: { left, right, differences }, comparing?, drops?, chosen?, difference? }`, the sides as
 * `{ connection, database }`; `chosen` lists the identifiers of the differences to apply (every difference when it is
 * absent); `difference` is the one whose steps **Copy script** of the inspector island copies.
 */
import type { Answers, Context } from '../../../shared/feature';
import { connectionId } from '../../../shared/ids';
import { savedConnection } from '../../../shared/state/connections';
import { startArgs } from '../../nav/types';
import { sideText, type StructureDifference, type StructureSide } from '../types';

/** The last comparison: the sides it was made for and what it found. */
export interface LastComparison {
  readonly left: StructureSide;
  readonly right: StructureSide;
  readonly differences: readonly StructureDifference[];
}

/** What an operation of the page is started with. */
export interface PageArgs {
  readonly left?: StructureSide;
  readonly right?: StructureSide;
  readonly comparison?: LastComparison;
  readonly comparing: boolean;
  readonly drops: boolean;
  readonly chosen?: readonly string[];
  readonly difference?: string;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sideOf(value: unknown): StructureSide | undefined {
  return isObject(value) && typeof value['connection'] === 'string' && typeof value['database'] === 'string'
    ? { connection: value['connection'], database: value['database'] }
    : undefined;
}

function isDifference(value: unknown): value is StructureDifference {
  return (
    isObject(value) &&
    typeof value['id'] === 'string' &&
    typeof value['collection'] === 'string' &&
    typeof value['kind'] === 'string' &&
    Array.isArray(value['steps'])
  );
}

function comparisonOf(value: unknown): LastComparison | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const left = sideOf(value['left']);
  const right = sideOf(value['right']);
  const differences = value['differences'];
  return left === undefined || right === undefined || !Array.isArray(differences)
    ? undefined
    : { left, right, differences: (differences as readonly unknown[]).filter(isDifference) };
}

/** The arguments of an operation of the page, read from what it was started with. */
export function pageArgs(answers: Answers): PageArgs {
  const args = startArgs(answers);
  const left = sideOf(args['left']);
  const right = sideOf(args['right']);
  const comparison = comparisonOf(args['comparison']);
  const chosen = args['chosen'];
  const difference = args['difference'];
  return {
    comparing: args['comparing'] === true,
    drops: args['drops'] === true,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
    ...(comparison === undefined ? {} : { comparison }),
    ...(Array.isArray(chosen) ? { chosen: chosen.filter((id): id is string => typeof id === 'string') } : {}),
    ...(typeof difference === 'string' ? { difference } : {}),
  };
}

/** The name of a side's connection: its saved name, or its identifier when it is no longer saved. */
export function connectionName(context: Context, side: StructureSide): string {
  return savedConnection(context.state.connections, connectionId(side.connection))?.name ?? side.connection;
}

/** Whether a side's connection is read-only. */
export function isReadOnly(context: Context, side: StructureSide): boolean {
  return savedConnection(context.state.connections, connectionId(side.connection))?.readOnly ?? false;
}

/** `Production › shop`. */
export function whereText(context: Context, side: StructureSide): string {
  return sideText(connectionName(context, side), side.database);
}

/** Whether two sides are the same database of the same connection. */
export function isSameSide(a: StructureSide | undefined, b: StructureSide | undefined): boolean {
  return a !== undefined && b !== undefined && a.connection === b.connection && a.database === b.database;
}
