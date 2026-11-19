/**
 * Feature: playground.autocomplete
 *
 * Suggestions while typing a script: the collections and methods after `db.`, the methods of a collection, a cursor,
 * the connection and a session, and inside a call the fields, operators and values the query bar suggests. The
 * collections of a database and a sample of a collection are read by the window as {@link CompletionNeed} says, kept
 * 120 seconds, and given back in the hints; autocomplete never runs a line of the script. Ported from Mongoster's
 * `src/playground/context.ts` and `src/playground/playground.ts` (`Playgrounds.completions`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { databaseAt } from '../../shared/playground/statements';
import { fieldsOfDocuments, type FieldHint } from '../aggregate/complete/fields';
import { matchScore, type Suggestion } from '../aggregate/complete/items';
import { argumentKind, argumentSuggestions } from './complete/arguments';
import { callAt, memberAt, type MemberAt } from './complete/receiver';
import {
  collectionWords,
  cursorWords,
  databaseWords,
  mongoWords,
  sessionWords,
  type MethodWord,
} from './runtime/methods';
import { isDatabaseMethod } from './runtime';

export { fieldsOfDocuments, type FieldHint } from '../aggregate/complete/fields';

/** What autocomplete knows, by what the window has read: the collections of databases, the fields of collections. */
export interface CompletionHints {
  /** The playground's default database. */
  readonly defaultDatabase: string;
  /** The names of the collections, by database; a database not read yet is absent. */
  readonly collections: Readonly<Record<string, readonly string[]>>;
  /** The fields of a sample, by `<database>.<collection>`; a collection not sampled yet is absent. */
  readonly fields: Readonly<Record<string, readonly FieldHint[]>>;
  /** Whether the connection is connected: a playground that is not suggests methods only, and reads nothing. */
  readonly connected: boolean;
}

/** A suggestion of a playground: a collection, a method, or what the query bar suggests inside a call. */
export interface PlaygroundSuggestion {
  readonly label: string;
  readonly detail?: string;
  readonly kind: Suggestion['kind'] | 'collection' | 'method';
  readonly insert: string;
  /** Where the caret lands inside `insert`; at its end when absent. */
  readonly cursor?: number;
}

/** What the window reads for autocomplete, when it has not yet, and keeps for {@link hintsKeptMs}. */
export type CompletionNeed =
  | { readonly kind: 'collections'; readonly database: string }
  | { readonly kind: 'sample'; readonly database: string; readonly collection: string };

/** The suggestions at the caret, what they replace, and what more autocomplete would like to know. */
export interface Completions {
  readonly from: number;
  readonly to: number;
  readonly items: readonly PlaygroundSuggestion[];
  readonly needs: readonly CompletionNeed[];
}

/** The names and the samples read are kept 120 seconds of typing. */
export const hintsKeptMs = 120_000;

/** The size of the sample of a collection, and the time it may take. */
export const sampleSize = 300;

/** The time the sample may take, in ms. */
export const sampleTimeLimitMs = 10_000;

/** `listCollections` with `nameOnly: true`, for the collections suggested after `db.`. */
export function collectionsRequest(database: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'listCollections',
    arguments: [{}, { nameOnly: true }],
    timeLimitMs: sampleTimeLimitMs,
  };
}

/** `db.<collection>.aggregate([{ $sample: { size: 300 } }])` with `maxTimeMS: 10000`, analyzed for its fields. */
export function sampleRequest(database: string, collection: string): MongoRequest {
  const pipeline: Json = [{ $sample: { size: { $numberInt: String(sampleSize) } } }];
  return {
    engine: 'mongodb',
    database,
    collection,
    method: 'aggregate',
    arguments: [pipeline, { maxTimeMS: { $numberInt: String(sampleTimeLimitMs) } }],
    limit: sampleSize,
    timeLimitMs: sampleTimeLimitMs,
  };
}

function method([name, template]: MethodWord): PlaygroundSuggestion {
  const caret = template.indexOf('|');
  return {
    label: name,
    kind: 'method',
    insert: template.replace('|', ''),
    cursor: caret < 0 ? template.length : caret,
  };
}

function collection(name: string): PlaygroundSuggestion {
  const plain = /^[A-Za-z_$][\w$]*$/u.test(name) && !isDatabaseMethod(name, false);
  return { label: name, kind: 'collection', insert: plain ? name : `getCollection(${JSON.stringify(name)})` };
}

/** The items that match what was typed, best first, in their order among equals. */
function matching(items: readonly PlaygroundSuggestion[], prefix: string): readonly PlaygroundSuggestion[] {
  return items
    .map((item, order) => ({ item, order, score: matchScore(item.label, prefix) }))
    .filter((each) => each.score > 0 && each.item.label !== prefix)
    .sort((first, second) => second.score - first.score || first.order - second.order)
    .map((each) => each.item);
}

interface Found {
  readonly items: readonly PlaygroundSuggestion[];
  readonly needs: readonly CompletionNeed[];
}

function databaseItems(database: string, hints: CompletionHints): Found {
  const known = hints.collections[database];
  const needs: CompletionNeed[] = known === undefined && hints.connected ? [{ kind: 'collections', database }] : [];
  return { items: [...(known ?? []).map(collection), ...databaseWords.map(method)], needs };
}

function memberItems(member: MemberAt, database: string, hints: CompletionHints): Found {
  switch (member.kind) {
    case 'db':
      return databaseItems(member.database ?? database, hints);
    case 'collection':
      return { items: collectionWords.map(method), needs: [] };
    case 'cursor':
      return { items: cursorWords.map(method), needs: [] };
    case 'mongo':
      return { items: mongoWords.map(method), needs: [] };
    case 'session':
      return { items: sessionWords.map(method), needs: [] };
  }
}

function wordEnd(text: string, offset: number): number {
  let end = offset;
  while (end < text.length && /[\w$]/u.test(text.charAt(end))) {
    end += 1;
  }
  return end;
}

function inCall(text: string, offset: number, database: string, hints: CompletionHints): Completions | undefined {
  const call = callAt(text, offset);
  if (call?.collection === undefined) {
    return undefined;
  }
  const kind = argumentKind(call, text.slice(call.argumentStart, offset));
  if (kind === undefined) {
    return undefined;
  }
  const on = call.database ?? database;
  const key = `${on}.${call.collection}`;
  const fields = hints.fields[key];
  const needs: CompletionNeed[] =
    fields === undefined && hints.connected ? [{ kind: 'sample', database: on, collection: call.collection }] : [];
  const found = argumentSuggestions(text, offset, { start: call.argumentStart, kind }, fields ?? []);
  return found === undefined
    ? { from: offset, to: offset, items: [], needs }
    : { from: found.from, to: found.to, items: found.items, needs };
}

/**
 * Feature: playground.autocomplete — the suggestions at `offset` of the script `text`: after a `.`, the collections
 * and the methods of what it follows; inside the arguments of a call on a collection, those of the query bar for that
 * argument. The database is that of the last `use("…")` before the caret, else the default one, or the one the
 * receiver names (`getSiblingDB("x")`, `getDB("x")`, `session.getDatabase("x")`). Nothing in a comment, a string or
 * a regular expression after a `.`.
 */
export function completions(text: string, offset: number, hints: CompletionHints): Completions {
  const database = databaseAt(text, offset) ?? hints.defaultDatabase;
  const member = memberAt(text, offset);
  if (member !== undefined) {
    const found = memberItems(member, database, hints);
    return {
      from: member.start,
      to: wordEnd(text, offset),
      items: matching(found.items, member.prefix),
      needs: found.needs,
    };
  }
  return inCall(text, offset, database, hints) ?? { from: offset, to: offset, items: [], needs: [] };
}

/** The read of the collections of a database, for the list after `db.`: `{ connection, database }`. */
export const collectionsReadId = 'playground.autocomplete:collections';

/** The read of a sample of a collection, for the fields inside a call: `{ connection, database, collection }`. */
export const sampleReadId = 'playground.autocomplete:sample';

function fieldOf(value: Json | undefined, name: string): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, Json>>)[name]
    : undefined;
}

function textArgument(args: Json, name: string): string {
  const value = fieldOf(args, name);
  return typeof value === 'string' ? value : '';
}

/** `playground.autocomplete:collections`: the names of the collections, sorted; none when they cannot be read. */
export const collectionsRead: ReadFeature = {
  kind: 'read',
  id: featureId(collectionsReadId),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textArgument(args, 'connection')),
        request: collectionsRequest(textArgument(args, 'database')),
      },
    ],
    // A list that cannot be read leaves the suggestions without collections, and shows no error.
    failedRequests: 'are-replies',
  }),
  parse: (replies): readonly string[] => {
    const [reply] = replies;
    const names = Array.isArray(reply)
      ? (reply as readonly Json[]).flatMap((each) => {
          const name = typeof each === 'string' ? each : fieldOf(each, 'name');
          return typeof name === 'string' ? [name] : [];
        })
      : [];
    return [...names].sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
  },
};

/** `playground.autocomplete:sample`: the fields of a sample of the collection; none when it cannot be read. */
export const sampleRead: ReadFeature = {
  kind: 'read',
  id: featureId(sampleReadId),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'engine',
    requests: [
      {
        connection: connectionId(textArgument(args, 'connection')),
        request: sampleRequest(textArgument(args, 'database'), textArgument(args, 'collection')),
      },
    ],
    // A sample that cannot be read (no privilege) leaves the operators, as on a collection never sampled.
    failedRequests: 'are-replies',
  }),
  parse: (replies): readonly FieldHint[] => {
    const [reply] = replies;
    return Array.isArray(reply) ? fieldsOfDocuments(reply as readonly Json[]) : [];
  },
};
