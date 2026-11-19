/**
 * What the cards of the search area share: what the page asks for (the text, the mode, the scope and the options),
 * the collections a search reads, the matches of a document, and how far each collection and the whole search went.
 * Values are canonical Extended JSON (R5.5): an `_id` is `{ "$oid": "…" }`, `{ "$numberInt": "7" }`.
 */
import type { Json } from '../../shared/engine-request';

/** **Contains** or **Regex**. */
export type SearchMode = 'contains' | 'regex';

/** **Read**: every document (0), or the first 1,000, 10,000 or 100,000 per collection. */
export const readLimits = [0, 1000, 10_000, 100_000] as const;

/** A choice of **Read**. */
export type ReadLimit = (typeof readLimits)[number];

/** What the page searches with: the search row, the scope row and the options row, as the tab keeps them. */
export interface SearchInput {
  readonly text: string;
  readonly mode: SearchMode;
  /** **In**: a database, or `undefined` for **Every database**. */
  readonly database?: string;
  /** The collections ticked in **Collections**; none is **All collections**. */
  readonly collections: readonly string[];
  readonly matchCase: boolean;
  readonly fieldNames: boolean;
  readonly views: boolean;
  readonly read: ReadLimit;
}

/** The input of a page opened for the first time: **Every database**, **Contains**, every option off. */
export const firstInput: SearchInput = {
  text: '',
  mode: 'contains',
  collections: [],
  matchCase: false,
  fieldNames: false,
  views: false,
  read: 0,
};

/** One collection a search reads, in the order of `search.collections`. */
export interface SearchCollection {
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
  /** The estimated number of documents; absent for a view, or when the count failed. */
  readonly estimate?: number;
}

/** The kind of value a match is in, which the page names when it is not a string. */
export type MatchKind =
  'string' | 'number' | 'boolean' | 'date' | 'objectId' | 'uuid' | 'regex' | 'code' | 'field-name';

/** One place of a document where the text is found, with the text around it, on one line. */
export interface SearchMatch {
  /** The dotted path of the field, with the index of array elements: `items.0.sku`. */
  readonly path: string;
  readonly kind: MatchKind;
  /** Up to 40 characters before the match, starting with `…` when the value goes on before them. */
  readonly before: string;
  /** The text matched, cut at 120 characters with `…`. */
  readonly match: string;
  /** Up to 40 characters after the match, ending with `…` when the value goes on after them. */
  readonly after: string;
}

/** A document with at least one match. */
export interface SearchResult {
  /** The `_id`, as canonical Extended JSON. */
  readonly id: Json;
  /** The `_id` in mongosh syntax: `ObjectId("65f1c0a2b3d4e5f6a7b8c9d0")`, `42`, `"A-17"`. */
  readonly idText: string;
  /** The first 5 matches, in the order of the document's fields. */
  readonly matches: readonly SearchMatch[];
  /** The matches beyond the first 5. */
  readonly more: number;
}

/** How a collection of the search stands. */
export type CollectionState =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'read' }
  /** It gave as many documents as **Read** allows: *first 1,000 read*. */
  | { readonly kind: 'first-read'; readonly limit: number }
  /** A read failed: the server's message; what was found before stays. */
  | { readonly kind: 'error'; readonly message: string }
  /** The search was stopped while it was read: what was found stays. */
  | { readonly kind: 'stopped' };

/** What a search found in one collection, and how far it read it. */
export interface CollectionScan {
  readonly collection: SearchCollection;
  readonly state: CollectionState;
  /** The documents read. */
  readonly read: number;
  /** The documents with at least one match. */
  readonly found: number;
  /** The first 50 results, to be listed. */
  readonly results: readonly SearchResult[];
  /** The `_id`s of the first 1,000 results, in the order they were found, for `search.open-in-collection`. */
  readonly ids: readonly Json[];
}

/** How the whole search stands: its summary's state. */
export type RunState = 'listing' | 'searching' | 'stopped' | 'done' | 'error';

/** One search, from **Search** to its end. */
export interface SearchRun {
  /** Which search it is: a reply for another one is dropped. */
  readonly id: number;
  /** The text as typed, trimmed, for *No document contains “mario”.* */
  readonly text: string;
  /** Whether **In** was **Every database**, which names the groups `database.collection`. */
  readonly everyDatabase: boolean;
  readonly state: RunState;
  /** The collections, once `search.collections` has answered. */
  readonly scans: readonly CollectionScan[];
  /** When **Search** was pressed, and when the search ended or was stopped, in milliseconds since 1970. */
  readonly startedAt: number;
  readonly endedAt?: number;
  /** Why the search could not start: the server's message when the collections could not be listed. */
  readonly error?: string;
}
