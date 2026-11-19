/**
 * The text of `index_advice` (`mcp.performance-tools`). The advisor (`advisor.analyze`, `advisor.show`) is not on this
 * branch: the main process answers the app action `advisor.analyze` `{ connection, database, collection? }` with an
 * {@link AdvisorReply} once it is built (it reads the indexes, their uses, their sizes and the slow operations, and
 * analyses them), and this writes it.
 */
import { counted } from '../output-limits';
import { createIndexCommand } from './explain';
import { shellText } from './mongo';
import { sizeText } from './units';

/** An index as the advice names it. */
export interface AdvisedIndex {
  readonly name: string;
  readonly key: Readonly<Record<string, unknown>>;
  readonly bytes?: number;
  readonly ops?: number;
  /** When its statistics started, in milliseconds. */
  readonly since?: number;
}

/** A query shape an index to create serves. */
export interface ServedShape {
  readonly kind: string;
  readonly shape: string;
  readonly count: number;
  readonly avgMs: number;
  readonly maxMs: number;
  readonly docsExamined: number;
  readonly nreturned: number;
  readonly collscan: boolean;
  readonly sortStage: boolean;
}

/** One piece of advice. */
export type Advice =
  | {
      readonly kind: 'create';
      readonly database: string;
      readonly collection: string;
      readonly keys: Readonly<Record<string, 1 | -1>>;
      readonly queries: readonly ServedShape[];
      readonly count: number;
      readonly totalMs: number;
    }
  | {
      readonly kind: 'redundant';
      readonly database: string;
      readonly collection: string;
      readonly index: AdvisedIndex;
      readonly by: AdvisedIndex;
    }
  | {
      readonly kind: 'unused' | 'hidden';
      readonly database: string;
      readonly collection: string;
      readonly index: AdvisedIndex;
    };

/** The reply of `advisor.analyze`. */
export interface AdvisorReply {
  readonly collections: number;
  readonly indexes: number;
  readonly indexBytes: number;
  /** Where the slow operations were read, or why they could not be. */
  readonly operations:
    | { readonly count: number; readonly source: 'profiler' | 'log'; readonly since?: number }
    | { readonly error: string };
  /** The sentences of the reading: the profiler off, `$indexStats` refused, collections not read. */
  readonly notes: readonly string[];
  readonly advice: readonly Advice[];
  /** Indexes not used yet whose statistics started less than 24 hours ago. */
  readonly tooRecent: number;
}

function ms(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} ms`;
}

function indexLabel(index: AdvisedIndex): string {
  const extra = [
    ...(index.bytes === undefined ? [] : [sizeText(index.bytes)]),
    ...(index.ops === undefined
      ? []
      : [
          `${counted(index.ops, 'use')}${index.since === undefined ? '' : ` since ${new Date(index.since).toISOString()}`}`,
        ]),
  ];
  return `${index.name} ${shellText(index.key)}${extra.length === 0 ? '' : ` (${extra.join(', ')})`}`;
}

function createLines(advice: readonly Extract<Advice, { kind: 'create' }>[]): readonly string[] {
  if (advice.length === 0) {
    return [];
  }
  return [
    '',
    'Indexes to create (for the slow operations; equality fields, then the sort, then range fields):',
    ...advice.flatMap((each, index) => [
      `${String(index + 1)}. ${each.database}.${each.collection} ${shellText(each.keys)}: serves ${counted(each.queries.length, 'query shape')}, ${counted(each.count, 'operation')}, ${ms(each.totalMs)} in total`,
      `   ${createIndexCommand(each.collection, each.keys)}`,
      ...each.queries.map((query) => {
        const flags = [...(query.collscan ? ['COLLSCAN'] : []), ...(query.sortStage ? ['in-memory sort'] : [])];
        return `${`   - ${query.kind} ${query.shape}`.trimEnd()}: ${counted(query.count, 'operation')}, avg ${ms(query.avgMs)}, max ${ms(query.maxMs)}, ${counted(query.docsExamined, 'document')} examined for ${query.nreturned.toLocaleString('en-US')} returned${flags.length === 0 ? '' : `, ${flags.join(', ')}`}`;
      }),
    ]),
  ];
}

function listLines(title: string, advice: readonly Advice[], line: (each: Advice) => string): readonly string[] {
  return advice.length === 0 ? [] : ['', title, ...advice.map(line)];
}

/** The advice as text; empty when there is none. */
export function adviceLines(advice: readonly Advice[], tooRecent: number): readonly string[] {
  const where = (each: Advice): string => `- ${each.database}.${each.collection}`;
  const lines = [
    ...createLines(advice.filter((each): each is Extract<Advice, { kind: 'create' }> => each.kind === 'create')),
    ...listLines(
      'Redundant indexes (another index starts with the same keys and serves the same queries; dropping one saves writes and memory):',
      advice.filter((each) => each.kind === 'redundant'),
      (each) =>
        each.kind === 'redundant'
          ? `${where(each)} ${indexLabel(each.index)}: served by ${each.by.name} ${shellText(each.by.key)}`
          : '',
    ),
    ...listLines(
      'Unused indexes (no query used them since their statistics started; check periodic jobs and other members before dropping):',
      advice.filter((each) => each.kind === 'unused'),
      (each) => (each.kind === 'unused' ? `${where(each)} ${indexLabel(each.index)}` : ''),
    ),
    ...listLines(
      'Hidden indexes (kept up to date but not used by queries: unhide or drop them):',
      advice.filter((each) => each.kind === 'hidden'),
      (each) => (each.kind === 'hidden' ? `${where(each)} ${indexLabel(each.index)}` : ''),
    ),
  ];
  if (tooRecent > 0) {
    lines.push(
      '',
      `${counted(tooRecent, 'index', 'indexes')} not used yet, whose statistics started less than 24 hours ago (a new index or a server restart): too early to call them unused.`,
    );
  }
  return lines;
}

/** The text of `index_advice`. */
export function adviceText(scope: string, reply: AdvisorReply): string {
  const operations = reply.operations;
  const read =
    'error' in operations
      ? `Slow operations not read: ${operations.error}`
      : `Slow operations read: ${counted(operations.count, 'operation')} on these collections from ${operations.source === 'profiler' ? 'the profiler' : 'the server log'}${operations.since === undefined ? '' : ` since ${new Date(operations.since).toISOString()}`}.`;
  const body = adviceLines(reply.advice, reply.tooRecent);
  return [
    `Index advice for ${scope}: ${counted(reply.collections, 'collection')}, ${counted(reply.indexes, 'index', 'indexes')}, ${sizeText(reply.indexBytes)} of indexes.`,
    read,
    ...reply.notes,
    ...(body.length === 0 ? ['', 'No advice: no missing, redundant, unused or hidden index found.'] : body),
  ].join('\n');
}
