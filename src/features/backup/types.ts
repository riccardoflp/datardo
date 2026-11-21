/**
 * What the cards of the backup area share: the formats of a backup, the collections of an archive and of a backup
 * folder, the limits that files from outside are read with (R14.4), and the reading of arguments and replies.
 */
import type { Json } from '../../shared/engine-request';
import type { EngineStep, Step } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { isJsonDocument, type JsonDocument } from '../chart/types';
import type { BackupFormat } from '../task/types';

export type { BackupFormat, JsonDocument };
export { isJsonDocument };

/**
 * A collection of an archive, from its list of collections: its metadata as canonical Extended JSON, so that an
 * `Int64` in a view's pipeline stays an `Int64`, and its type (`collection`, `view`, `timeseries`).
 */
export interface ArchiveCollection {
  readonly database: string;
  readonly collection: string;
  readonly metadata: JsonDocument;
  readonly type: string;
}

/** What reading an archive gives after its list: a document of a collection, byte for byte, or the end of one. */
export type ArchiveItem =
  | { readonly kind: 'document'; readonly database: string; readonly collection: string; readonly bytes: Uint8Array }
  | { readonly kind: 'end'; readonly database: string; readonly collection: string };

/**
 * One collection of a backup: in a folder, the names of its files and the size of its documents' file; in an archive,
 * its metadata, with its type.
 */
export interface BackupCollection {
  readonly name: string;
  /** `<name>.bson` or `<name>.bson.gz`, in the folder of its database. */
  readonly bson?: string;
  /** `<name>.metadata.json` or `<name>.metadata.json.gz`, in the folder of its database. */
  readonly metadata?: string;
  /** The metadata of a collection of an archive, its `type` included. */
  readonly meta?: JsonDocument;
  /** The bytes of its documents' file, as stored (compressed when it is gzipped); 0 in an archive. */
  readonly size: number;
}

/** One database of a backup: its name, the folder that holds its files (none in an archive), its collections. */
export interface BackupDatabase {
  readonly name: string;
  readonly folder?: string;
  readonly collections: readonly BackupCollection[];
}

/** A collection, view or time series collection to back up, as `listCollections` describes it. */
export interface CollectionInfo {
  readonly name: string;
  /** `collection`, `view` or `timeseries`. */
  readonly type: string;
  readonly options?: JsonDocument;
  /** The collection's UUID, in hexadecimal. */
  readonly uuid?: string;
}

/** A document of an archive or a `.bson` file larger than this is not BSON: above the 16 MB limit, with room. */
export const largestDocument = 48 * 1024 * 1024;

/** How deep the metadata of a collection may nest before it is refused as damaged (R14.4; Datardo's choice). */
export const deepestMetadata = 200;

/** The databases a backup of a whole connection leaves out. */
export const systemDatabases: readonly string[] = ['admin', 'local', 'config'];

/** The documents a batch holds, for the progress and for a restore's inserts. */
export const batchDocuments = 1000;

/** The most bytes of documents a batch of a restore holds. */
export const batchBytes = 8 * 1024 * 1024;

/** The kind of a collection: its type, `collection` when it has none. */
export function typeOf(meta: JsonDocument | undefined): string {
  const type = meta?.['type'];
  return typeof type === 'string' && type !== '' ? type : 'collection';
}

/** How deep a value nests: 0 for a scalar, 1 for a document of scalars. Stops counting past `most`. */
export function nesting(value: Json, most: number): number {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }
  if (most <= 0) {
    return 1;
  }
  const items: readonly Json[] = Array.isArray(value) ? value : Object.values(value as JsonDocument);
  return 1 + items.reduce<number>((deepest, item) => Math.max(deepest, nesting(item, most - 1)), 0);
}

/** A text field of a value of the state or of an answer, or `undefined`. */
export function textOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The texts of a list answered by a pick-many question. */
export function textsOf(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) ? value.filter((each): each is string => typeof each === 'string') : undefined;
}

/** What a backup saves: databases, each with its collections. */
export type BackupChoice = readonly { readonly database: string; readonly collections: readonly CollectionInfo[] }[];

/** The indexes and the estimated number of documents of each collection, by `<database>.<collection>`. */
export interface BackupDetails {
  readonly indexes: Readonly<Record<string, readonly JsonDocument[]>>;
  readonly counts: Readonly<Record<string, number>>;
}

/** The key of a collection in {@link BackupDetails}. */
export function namespaceOf(database: string, collection: string): string {
  return `${database}.${collection}`;
}

/**
 * Where the documents of an insert step come from while the plan runs, when they are too many to be in the plan: the
 * step is sent with an empty list, which the runner fills batch by batch from its feed, checking for **Cancel**
 * between batches. A runner that does not know feeds sends the empty list, which the server refuses: nothing is
 * written. The steps fed from the same archive are fed in one pass over the file, since its collections may alternate.
 */
export type DocumentsFeed =
  /** The documents of a collection of an archive, as stored. */
  | { readonly kind: 'archive'; readonly path: string; readonly database: string; readonly collection: string }
  /** The documents of a `.bson` or `.bson.gz` file, as stored. */
  | { readonly kind: 'bson'; readonly path: string }
  /** The documents of a collection matching a filter, read with every value in its BSON type. */
  | {
      readonly kind: 'query';
      readonly connection: ConnectionId;
      readonly database: string;
      readonly collection: string;
      readonly filter: Json;
    }
  /** Generated documents (`transfer.generate-values`), from the analysis and the options, in order. */
  | { readonly kind: 'generated'; readonly analysis: Json; readonly options: Json; readonly count: number }
  /** Documents the plan holds already, as canonical Extended JSON: those of an import file, read and parsed. */
  | { readonly kind: 'documents'; readonly documents: readonly Json[] };

/** How a feed is cut into batches: at most so many documents, and at most so many bytes when it says so. */
export interface FeedBatches {
  readonly documents: number;
  readonly bytes?: number;
}

/**
 * What the work in progress says while a feed is inserted (`runner.progress`): its title, and the documents done of
 * `total` in `unit`, or without a total, *\<database\>.\<collection\>: \<n\> documents*.
 */
export interface FedWork {
  readonly title: string;
  readonly total?: number;
  readonly unit?: string;
  /** The documents of `total` that the plan's earlier steps insert: an import cut into steps of 1,000. */
  readonly before?: number;
}

/** An insert step whose documents come from a feed. */
export type FedStep = EngineStep & {
  readonly feed: DocumentsFeed;
  readonly batches: FeedBatches;
  readonly work?: FedWork;
};

/** What the documents of one fed step did, as the runner counted them batch by batch. */
export interface FedStepTotals {
  readonly database: string;
  readonly collection: string;
  /** The documents the feed gave. */
  readonly read: number;
  readonly inserted: number;
  /** Refused because their `_id` already existed (E11000 on `_id`). */
  readonly duplicates: number;
  /** Refused for any other reason. */
  readonly failed: number;
  /** The message of the first document refused, duplicates included. */
  readonly firstError?: string;
  /** The message of the first document refused for another reason than its `_id`. */
  readonly firstOtherError?: string;
}

/**
 * What the runner counted of a plan with fed steps, for the message that ends it: the steps' documents, the indexes
 * created and those that failed (`<name>: <error>`), how it ended, the operations recorded in the undo history and why
 * it could not be recorded when it could not.
 */
export interface FedTotals {
  readonly milliseconds: number;
  readonly steps: readonly FedStepTotals[];
  readonly indexes: {
    readonly created: number;
    readonly failed: readonly { readonly index: string; readonly on: string; readonly error: string }[];
  };
  readonly ended: 'done' | 'cancelled' | 'failed';
  readonly error?: string;
  readonly recorded: number;
  readonly notRecorded?: string;
}

/** Whether a step's documents come from a feed. */
export function isFedStep(step: Step): step is FedStep {
  return step.kind === 'engine' && 'feed' in step;
}
