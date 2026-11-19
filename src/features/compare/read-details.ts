/**
 * Feature: compare.read-details
 *
 * Reads again, by `_id`, the documents of the differences the list shows, to say what differs in each:
 * `db.orders.find({ _id: { $in: [ … ] } })`, 500 `_id`s per query, on the left side for the first 300 different
 * documents and the first 300 only on the left, on the right side for the first 300 different and the first 300 only
 * on the right, both sides at the same time. The documents keep their BSON types and the order of their fields. Like
 * `compare.read`, it has no time limit: a comparison runs until it ends or is cancelled.
 *
 * Started with `{ mode, left, right, … }`:
 * - `details`, with `options` and `differences` (those of `compare.read`, in its order): the entries of the list;
 * - `selected`, with `side` and `id`: `db.orders.findOne({ _id: … })` on that side, for the inspector island;
 * - `documents`, with `side` and `ids`: the documents of that side, for the writes of `compare.copy-document` and
 *   `compare.make-like`, which read them before their confirmation.
 */
import type { ConnectionRequest, Json } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { formattedValue } from '../query/format';
import { fieldDiff, type FieldRow } from './field-diff';
import { equalityOf } from './pairing/pairing';
import { text } from './text';
import {
  idKey,
  idOfDocument,
  isJsonRecord,
  idsPerQuery,
  longestPreview,
  readDifferences,
  readOptions,
  readSide,
  shownPerKind,
  sideJson,
  type ComparisonOptions,
  type Difference,
  type DifferenceKind,
  type Side,
  type SideRef,
} from './types';

/** An entry of the list: the fields of a different document, or the text of a document on one side only. */
export type DetailEntry =
  | {
      readonly kind: 'different';
      readonly id: Json;
      readonly rows: readonly FieldRow[];
      readonly summary: string;
    }
  | { readonly kind: 'only-left' | 'only-right'; readonly id: Json; readonly preview: string };

/** The document of a selected row, or the sentence that says it is gone. */
export type SelectedDocument =
  { readonly kind: 'document'; readonly document: Json } | { readonly kind: 'gone'; readonly message: string };

/** What the read is started with. */
export type DetailsArgs =
  | {
      readonly mode: 'details';
      readonly left: SideRef;
      readonly right: SideRef;
      readonly options: ComparisonOptions;
      readonly differences: readonly Difference[];
    }
  | { readonly mode: 'selected'; readonly on: SideRef; readonly id: Json }
  | { readonly mode: 'documents'; readonly on: SideRef; readonly ids: readonly Json[] };

type Fields = Readonly<Record<string, unknown>>;

function sideNamed(fields: Fields, side: unknown): SideRef {
  const found = readSide(side === 'left' || side === 'right' ? fields[side] : undefined);
  if (found === undefined) {
    throw new Error('compare.read-details is started with the sides of the comparison.');
  }
  return found;
}

/** The arguments, which every caller gives whole. */
export function detailsArgs(args: Json): DetailsArgs {
  const fields: Fields = isJsonRecord(args) ? args : {};
  switch (fields['mode']) {
    case 'selected':
      return { mode: 'selected', on: sideNamed(fields, fields['side']), id: (fields['id'] ?? null) as Json };
    case 'documents':
      return {
        mode: 'documents',
        on: sideNamed(fields, fields['side']),
        ids: Array.isArray(fields['ids']) ? (fields['ids'] as readonly Json[]) : [],
      };
    default:
      return {
        mode: 'details',
        left: sideNamed(fields, 'left'),
        right: sideNamed(fields, 'right'),
        options: readOptions(fields['options']),
        differences: readDifferences(fields['differences']),
      };
  }
}

/** The arguments of a read of the documents of a side, by their `_id`s. */
export function documentsArgs(left: SideRef, right: SideRef, side: Side, ids: readonly Json[]): Json {
  return { mode: 'documents', left: sideJson(left), right: sideJson(right), side, ids };
}

function firstOf(differences: readonly Difference[], kind: DifferenceKind): readonly Json[] {
  return differences
    .filter((difference) => difference.kind === kind)
    .slice(0, shownPerKind)
    .map((difference) => difference.id);
}

/** The `_id`s read again on each side for the list. */
export function shownIds(differences: readonly Difference[]): {
  readonly left: readonly Json[];
  readonly right: readonly Json[];
} {
  const different = firstOf(differences, 'different');
  return {
    left: [...different, ...firstOf(differences, 'only-left')],
    right: [...different, ...firstOf(differences, 'only-right')],
  };
}

function chunks(ids: readonly Json[]): readonly (readonly Json[])[] {
  const out: (readonly Json[])[] = [];
  for (let start = 0; start < ids.length; start += idsPerQuery) {
    out.push(ids.slice(start, start + idsPerQuery));
  }
  return out;
}

function findByIds(side: SideRef, ids: readonly Json[]): ConnectionRequest {
  return {
    connection: side.connection,
    request: {
      engine: 'mongodb',
      database: side.database,
      collection: side.collection,
      method: 'find',
      arguments: [{ _id: { $in: ids } }],
      limit: ids.length,
    },
  };
}

function findOne(side: SideRef, id: Json): ConnectionRequest {
  const request = { engine: 'mongodb', database: side.database, collection: side.collection } as const;
  return { connection: side.connection, request: { ...request, method: 'findOne', arguments: [{ _id: id }] } };
}

/** Feature: compare.read-details — the queries by `_id`, 500 `_id`s each, left side first. */
export function request(_context: Context, args: Json): ReadRequest {
  const asked = detailsArgs(args);
  switch (asked.mode) {
    case 'selected':
      return { kind: 'engine', requests: [findOne(asked.on, asked.id)] };
    case 'documents':
      return { kind: 'engine', requests: chunks(asked.ids).map((ids) => findByIds(asked.on, ids)) };
    case 'details': {
      const ids = shownIds(asked.differences);
      const left = chunks(ids.left).map((each) => findByIds(asked.left, each));
      const right = chunks(ids.right).map((each) => findByIds(asked.right, each));
      return { kind: 'engine', requests: [...left, ...right] };
    }
  }
}

type DocumentMap = ReadonlyMap<string, Json>;

function documentsByKey(replies: readonly unknown[]): DocumentMap {
  const out = new Map<string, Json>();
  for (const reply of replies) {
    for (const document of Array.isArray(reply) ? (reply as readonly Json[]) : []) {
      out.set(idKey(idOfDocument(document)), document);
    }
  }
  return out;
}

/** A document in mongosh syntax on one line, cut at 240 characters with `…`. */
export function previewText(document: Json): string {
  const characters = Array.from(formattedValue(document, 'one-line'));
  return characters.length > longestPreview ? `${characters.slice(0, longestPreview).join('')}…` : characters.join('');
}

function differentEntries(
  ids: readonly Json[],
  sides: readonly [DocumentMap, DocumentMap],
  options: ComparisonOptions,
): DetailEntry[] {
  const equality = equalityOf(options);
  return ids.flatMap((id) => {
    const [left, right] = [sides[0].get(idKey(id)), sides[1].get(idKey(id))];
    if (left === undefined || right === undefined) {
      return [];
    }
    return [{ kind: 'different' as const, id, ...fieldDiff(left, right, equality) }];
  });
}

function oneSideEntries(ids: readonly Json[], documents: DocumentMap, kind: 'only-left' | 'only-right'): DetailEntry[] {
  return ids.flatMap((id) => {
    const document = documents.get(idKey(id));
    return document === undefined ? [] : [{ kind, id, preview: previewText(document) }];
  });
}

/** The entries of the list: different documents first, then those only on the left, then only on the right. */
export function detailEntries(
  replies: readonly unknown[],
  asked: Extract<DetailsArgs, { mode: 'details' }>,
): readonly DetailEntry[] {
  const ids = shownIds(asked.differences);
  const leftQueries = Math.ceil(ids.left.length / idsPerQuery);
  const left = documentsByKey(replies.slice(0, leftQueries));
  const right = documentsByKey(replies.slice(leftQueries));
  return [
    ...differentEntries(firstOf(asked.differences, 'different'), [left, right], asked.options),
    ...oneSideEntries(firstOf(asked.differences, 'only-left'), left, 'only-left'),
    ...oneSideEntries(firstOf(asked.differences, 'only-right'), right, 'only-right'),
  ];
}

/**
 * Feature: compare.read-details — for `details` the entries of the list (a difference whose document is gone from a
 * side is left out); for `selected` the document or *The document no longer exists.*; for `documents` the documents
 * found, in the order the server gave them.
 */
export function parse(
  replies: readonly unknown[],
  args: Json,
): readonly DetailEntry[] | SelectedDocument | readonly Json[] {
  const asked = detailsArgs(args);
  switch (asked.mode) {
    case 'selected': {
      const document = replies[0];
      return typeof document === 'object' && document !== null && !Array.isArray(document)
        ? { kind: 'document', document: document as Json }
        : { kind: 'gone', message: text.inspector.gone };
    }
    case 'documents':
      return [...documentsByKey(replies).values()];
    case 'details':
      return detailEntries(replies, asked);
  }
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('compare.read-details'), request, parse };
