/**
 * What the cards of the structure area share: the structure of a database as `structure.read` gives it (collections
 * and views with the options that are compared, indexes without `_id_`, search indexes, shard keys), the differences
 * `structure.steps` finds between two of them with the steps that remove each, and the two sides of a comparison.
 *
 * Values are canonical Extended JSON (R5.5): an index key `{ status: 1 }` is `{ status: { $numberInt: "1" } }`. The
 * definitions of indexes and search indexes are this area's own until the Indexes area (M22) gives them a shared
 * home; they carry what `createIndex` and `createSearchIndex` take.
 */
import type { Json } from '../../shared/engine-request';

/** A JSON object: a document, a definition, options. */
export type JsonObject = { readonly [key: string]: Json };

/** What a collection of the structure is. */
export type CollectionType = 'collection' | 'view' | 'timeseries';

/** An index as `createIndex` takes it: its name, its keys (a text index has its fields back) and its options. */
export interface IndexDefinition {
  readonly name: string;
  readonly keys: JsonObject;
  /** The options without the name, those at their default left out. */
  readonly options: JsonObject;
}

/** A search index: its name, its type (`search` or `vectorSearch`) and its definition. */
export interface SearchIndexDefinition {
  readonly name: string;
  readonly type: string;
  readonly definition: JsonObject;
}

/** The shard key of a collection of a sharded cluster. */
export interface ShardKey {
  readonly key: JsonObject;
  readonly unique?: boolean;
}

/** One collection, view or time series of a database, as it is compared. */
export interface CollectionStructure {
  readonly name: string;
  readonly type: CollectionType;
  /** The options that are compared, defaults left out (`structure.steps`, "What is compared"). */
  readonly options: JsonObject;
  /** Without `_id_`, sorted by name; empty for a view. */
  readonly indexes: readonly IndexDefinition[];
  /** Absent when they were not read: a view, a time series, a server without search. */
  readonly searchIndexes?: readonly SearchIndexDefinition[];
  readonly shardKey?: ShardKey;
}

/** Whether the search indexes of a database could be read. */
export type SearchState = 'ok' | 'unsupported' | 'error';

/** What a database is made of, as `structure.read` gives it. */
export interface DatabaseStructure {
  readonly collections: readonly CollectionStructure[];
  readonly search: SearchState;
  /** Why the search indexes could not be read, when `search` is `error`. */
  readonly searchError?: string;
  /** Read through a mongos: the shard keys are known. */
  readonly sharded: boolean;
}

/** One thing a step does on the right database. */
export type StructureOperation =
  /** A view's options hold `viewOn` and `pipeline`. */
  | { readonly type: 'createCollection'; readonly collection: string; readonly options: JsonObject }
  | { readonly type: 'collMod'; readonly collection: string; readonly changes: JsonObject }
  | { readonly type: 'convertToCapped'; readonly collection: string; readonly size: Json }
  /** `dropsDocuments` when what is dropped is, on the right, a collection or a time series (D36). */
  | { readonly type: 'drop'; readonly collection: string; readonly dropsDocuments: boolean }
  /** The options hold the name. */
  | {
      readonly type: 'createIndex';
      readonly collection: string;
      readonly keys: JsonObject;
      readonly options: JsonObject;
    }
  | { readonly type: 'dropIndex'; readonly collection: string; readonly name: string }
  | {
      readonly type: 'createSearchIndex';
      readonly collection: string;
      readonly name: string;
      readonly searchType: string;
      readonly definition: JsonObject;
    }
  | {
      readonly type: 'updateSearchIndex';
      readonly collection: string;
      readonly name: string;
      readonly definition: JsonObject;
    }
  | { readonly type: 'dropSearchIndex'; readonly collection: string; readonly name: string }
  | {
      readonly type: 'shardCollection';
      readonly collection: string;
      readonly key: JsonObject;
      readonly unique?: boolean;
    };

/** One step of a difference: a command, or only a note when no command can do it. */
export interface StructureStep {
  /** Absent for what no command can do: the script says it in its note. */
  readonly operation?: StructureOperation;
  /** Drops something or loses data: commented out of the script without drops, applied only when asked. */
  readonly destructive: boolean;
  /** Said above the command in the script. */
  readonly note?: string;
}

/** How a thing of the left database stands against the right one. */
export type DifferenceKind = 'same' | 'different' | 'only-left' | 'only-right';

/** The kinds, in the order of the chips. */
export const differenceKinds: readonly DifferenceKind[] = ['same', 'different', 'only-left', 'only-right'];

/** What a difference is about. */
export type StructureObject = 'collection' | 'view' | 'options' | 'index' | 'search-index' | 'shard-key';

/** One field of two definitions that differ: its path, and its value on each side that has it. */
export interface DefinitionField {
  readonly path: string;
  readonly left?: Json;
  readonly right?: Json;
}

/** One row of the comparison: a thing of a collection, how it stands, and what makes the right like the left. */
export interface StructureDifference {
  /** Tells the difference apart in the page and in the arguments of `structure.apply`. */
  readonly id: string;
  readonly collection: string;
  /** The collection's type on the left (on the right when it is only there). */
  readonly collectionType: CollectionType;
  readonly object: StructureObject;
  /** The name of the index or search index. */
  readonly name?: string;
  readonly kind: DifferenceKind;
  readonly summary: string;
  /** The definition on each side, absent on the side that lacks it. */
  readonly left?: Json;
  readonly right?: Json;
  /** What differs, field by field, when both sides have a definition. */
  readonly fields?: readonly DefinitionField[];
  readonly steps: readonly StructureStep[];
  /** For a view created or changed: the collection or view it is on, so that the script creates that one first. */
  readonly viewOn?: string;
}

/** How many differences of each kind. */
export type DifferenceCounts = Readonly<Record<DifferenceKind, number>>;

/** What `structure.steps` finds. */
export interface StructureComparison {
  readonly differences: readonly StructureDifference[];
  readonly counts: DifferenceCounts;
  /** What was not compared, and why. */
  readonly notes: readonly string[];
}

/** One side of a comparison, as the page and the features name it. */
export interface StructureSide {
  readonly connection: string;
  readonly database: string;
}

/** `Production › shop`: the connection's name (its identifier when it is no longer saved) and the database. */
export function sideText(connectionName: string, database: string): string {
  return `${connectionName} › ${database}`;
}
