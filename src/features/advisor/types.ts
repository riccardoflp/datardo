/**
 * What the features of the Index advisor share: the scope of a page, the collections with their indexes as
 * `advisor.read-indexes` returns them, and the advices (glossary, "advice", "scope"). The indexes are read here with
 * their usage and sizes; `index.list` (M22) reads the same for the Indexes section, and these types are the advisor's
 * own until both are built.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { targetConnection } from '../../shared/target';
import { recordOf } from '../monitor/parts/ejson';
import { namespaceOf } from '../monitor/parts/requests';
import type { IndexKey, SlowQuery, SuggestedIndex } from '../monitor/types';

/** The databases a scope of a connection never analyzes. */
export const skippedDatabases: readonly string[] = ['admin', 'local', 'config'];

/** What a page of the advisor works on: the connection, one database, or one collection (glossary, "scope"). */
export type Scope =
  | { readonly kind: 'connection' }
  | { readonly kind: 'database'; readonly database: string }
  | { readonly kind: 'collection'; readonly database: string; readonly collection: string };

/** An index of a collection, as the advisor needs it. */
export interface AdvisorIndex {
  readonly name: string;
  /** Its keys, in order. */
  readonly key: IndexKey;
  readonly unique: boolean;
  readonly sparse: boolean;
  readonly hidden: boolean;
  readonly expireAfterSeconds?: number;
  /** Its partial filter, as relaxed Extended JSON. */
  readonly partialFilterExpression?: Json;
  /** The locale of its collation. */
  readonly collation?: string;
  /** Its size in bytes, when `$collStats` gave it. */
  readonly size?: number;
  /** Its uses (`accesses.ops`), when `$indexStats` gave them. */
  readonly uses?: number;
  /** When its uses started being counted (`accesses.since`), in milliseconds since 1970. */
  readonly since?: number;
  readonly building: boolean;
}

/** A collection of the scope with its indexes. */
export interface AdvisorCollection {
  readonly database: string;
  readonly collection: string;
  readonly indexes: readonly AdvisorIndex[];
  /** Its number of documents (`estimatedDocumentCount`), when it could be read. */
  readonly documents?: number;
}

/** A collection whose indexes could not be read, with the server's message. */
export interface FailedCollection {
  /** `shop.orders`. */
  readonly namespace: string;
  readonly message: string;
}

/** One query shape behind an index to create. */
export interface AdvisorQuery {
  readonly kind: string;
  readonly shape: string;
  /** The operations, the `getMore` batches left out unless there is nothing else. */
  readonly operations: number;
  /** The time of every run, `getMore` batches included. */
  readonly totalMillis: number;
  readonly averageMillis: number;
  readonly docsExamined: number;
  readonly returned: number;
  readonly collectionScan: boolean;
  readonly inMemorySort: boolean;
  /** The slowest operation of the shape, which **Open** and **Explain** open. */
  readonly example: SlowQuery;
}

/** An index to create. */
export interface CreateAdvice {
  readonly kind: 'create';
  /** `create:shop.orders:{ customerId: 1, createdAt: -1 }`. */
  readonly id: string;
  readonly database: string;
  readonly collection: string;
  readonly keys: SuggestedIndex;
  readonly operations: number;
  readonly totalMillis: number;
  /** The slowest in total first. */
  readonly queries: readonly AdvisorQuery[];
}

/** An index whose every query another index serves. */
export interface RedundantAdvice {
  readonly kind: 'redundant';
  /** `redundant:shop.orders:status_1`. */
  readonly id: string;
  readonly database: string;
  readonly collection: string;
  readonly index: AdvisorIndex;
  /** The index that serves the same queries. */
  readonly by: AdvisorIndex;
}

/** An index no query used, or a hidden one. */
export interface UnusedAdvice {
  readonly kind: 'unused' | 'hidden';
  /** `unused:shop.orders:status_1`, `hidden:shop.orders:status_1`. */
  readonly id: string;
  readonly database: string;
  readonly collection: string;
  readonly index: AdvisorIndex;
}

/** One suggestion of the advisor (glossary, "advice"). */
export type Advice = CreateAdvice | RedundantAdvice | UnusedAdvice;

/** The namespace of a collection: `shop.orders`. */
export function collectionNamespace(collection: { readonly database: string; readonly collection: string }): string {
  return namespaceOf(collection.database, collection.collection);
}

/** The connection a page of the advisor works on, and how it is now (D14). */
export interface AdvisorConnection {
  readonly id: ConnectionId;
  readonly name: string;
  readonly readOnly: boolean;
}

/** The arguments a feature was started with (`Intent.args`), as an object. */
export function startArgs(answers: Answers): Readonly<Record<string, Json>> {
  return recordOf(answers['args']);
}

/** A text argument, or `undefined`. */
export function textArg(args: unknown, name: string): string | undefined {
  const value = recordOf(args)[name];
  return typeof value === 'string' ? value : undefined;
}

/** A list of texts of the arguments; empty when it is not one. */
export function textsArg(args: unknown, name: string): readonly string[] {
  const value = recordOf(args)[name];
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : [];
}

/** The connection of a feature: `args.connection`, else its target's, else the current connection. */
export function advisorConnection(context: Context, args: unknown): AdvisorConnection | undefined {
  const named = textArg(args, 'connection');
  const id =
    named === undefined ? (targetConnection(context.target) ?? context.state.nav.current) : connectionId(named);
  if (id === undefined) {
    return undefined;
  }
  const saved = savedConnection(context.state.connections, id);
  return { id, name: saved?.name ?? id, readOnly: saved?.readOnly ?? false };
}

/** The scope of `args` (`database`, `collection`), else of the target, else the whole connection. */
export function scopeOf(context: Context, args: unknown): Scope {
  const database = textArg(args, 'database');
  const collection = textArg(args, 'collection');
  if (database !== undefined) {
    return collection === undefined ? { kind: 'database', database } : { kind: 'collection', database, collection };
  }
  const target = context.target;
  if (target.kind === 'collection') {
    return { kind: 'collection', database: target.database, collection: target.collection };
  }
  return target.kind === 'database' ? { kind: 'database', database: target.database } : { kind: 'connection' };
}

/** The scope as arguments: `{ database, collection }`, each only when the scope has it. */
export function scopeArgs(scope: Scope): Readonly<Record<string, string>> {
  switch (scope.kind) {
    case 'connection':
      return {};
    case 'database':
      return { database: scope.database };
    case 'collection':
      return { database: scope.database, collection: scope.collection };
  }
}
