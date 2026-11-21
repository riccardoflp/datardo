/**
 * What the cards of the compare area share: the two sides of a comparison (a collection of a connection each), the
 * options the page shows, what a comparison found, and the bounds of the cards. Values are canonical Extended JSON
 * (R5.5): an `_id` is `{ "$oid": "…" }`, `{ "$numberInt": "7" }`.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { savedConnection, type ConnectionsState } from '../../shared/state/connections';
import type { Target } from '../../shared/target';

/** Documents compared per side at most (`compare.show`, "The bounds"). */
export const mostDocuments = 1_000_000;

/** Differences of each kind the list shows, and that `compare.read-details` reads again. */
export const shownPerKind = 300;

/** Documents of a side read per batch of `compare.read`. */
export const batchSize = 1000;

/** `_id`s per query when documents are read again or written by `_id`. */
export const idsPerQuery = 500;

/** Fields listed for one document (`compare.field-diff`). */
export const mostFieldRows = 200;

/** Characters of a document on one side only, in the list. */
export const longestPreview = 240;

/** A side of the comparison. */
export type Side = 'left' | 'right';

/** The kind of a difference: on both sides and different, or on one side only. */
export type DifferenceKind = 'different' | 'only-left' | 'only-right';

/** A collection (or view) of a saved connection, one side of a comparison. */
export interface SideRef {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  readonly view: boolean;
}

/** A side as the page and the confirmations show it, with whether its documents can be changed and why not. */
export interface SideInfo extends SideRef {
  readonly connectionName: string;
  /** Why its documents can't be changed: *The connection Production is read-only.*, *recent is a view.* */
  readonly readOnlyWhy?: 'read-only' | 'view';
}

/** The options as the page shows them: the filter and **Ignore** as typed, the two check boxes. */
export interface ComparisonOptions {
  readonly filter: string;
  readonly ignore: string;
  readonly ignoreOrder: boolean;
  readonly numbersByValue: boolean;
}

/** What makes two documents equal (`compare.equality`): the paths left out and the two options. */
export interface EqualityOptions {
  readonly ignore: readonly string[];
  readonly ignoreOrder: boolean;
  readonly numbersByValue: boolean;
}

/** The four counts of a comparison. */
export interface CompareCounts {
  readonly identical: number;
  readonly different: number;
  readonly onlyLeft: number;
  readonly onlyRight: number;
}

/** One difference: its `_id`, with its BSON type, and its kind. */
export interface Difference {
  readonly id: Json;
  readonly kind: DifferenceKind;
}

/** What `compare.read` found: the counts, and every difference in the order of the card. */
export interface CompareResult {
  readonly counts: CompareCounts;
  readonly differences: readonly Difference[];
  /** Whether the comparison had a filter, which the summary says. */
  readonly filtered: boolean;
}

/** The other side. */
export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/** The kind of a difference whose document is only on `side`. */
export function onlyOn(side: Side): DifferenceKind {
  return side === 'left' ? 'only-left' : 'only-right';
}

/** The key of an `_id` that tells two `_id`s apart by type and value: its canonical Extended JSON as text. */
export function idKey(id: Json): string {
  return JSON.stringify(id);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a value is a JSON object (not an array, not null): a document, or the arguments of a feature. */
export function isJsonRecord(value: unknown): value is { readonly [key: string]: Json } {
  return isObject(value);
}

/** The `_id` of a document; `null` for what is not one. */
export function idOfDocument(document: unknown): Json {
  return isJsonRecord(document) ? (document['_id'] ?? null) : null;
}

/** A side from the arguments of a feature: `{ connection, database, collection, view? }`. */
export function readSide(value: unknown): SideRef | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  const { connection, database, collection, view } = value;
  return typeof connection === 'string' && typeof database === 'string' && typeof collection === 'string'
    ? { connection: connectionId(connection), database, collection, view: view === true }
    : undefined;
}

/** A side as JSON, for the arguments of a read. */
export function sideJson(side: SideRef): Json {
  return { connection: side.connection, database: side.database, collection: side.collection, view: side.view };
}

/** The options from the arguments of a feature; what is missing has the page's default. */
export function readOptions(value: unknown): ComparisonOptions {
  const fields = isObject(value) ? value : {};
  return {
    filter: typeof fields['filter'] === 'string' ? fields['filter'] : '',
    ignore: typeof fields['ignore'] === 'string' ? fields['ignore'] : '',
    ignoreOrder: fields['ignoreOrder'] !== false,
    numbersByValue: fields['numbersByValue'] !== false,
  };
}

/** A difference from the arguments of a feature. */
export function readDifference(value: unknown): Difference | undefined {
  if (!isObject(value) || value['id'] === undefined) {
    return undefined;
  }
  const kind = value['kind'];
  return kind === 'different' || kind === 'only-left' || kind === 'only-right'
    ? { id: value['id'] as Json, kind }
    : undefined;
}

/** The differences from the arguments of a feature, those that are not one left out. */
export function readDifferences(value: unknown): readonly Difference[] {
  return Array.isArray(value)
    ? (value as readonly unknown[]).flatMap((each) => {
        const difference = readDifference(each);
        return difference === undefined ? [] : [difference];
      })
    : [];
}

/** A side with how its connection is now: its name, and whether its documents can be changed (D14, R5.2). */
export function sideInfo(context: Context, side: SideRef): SideInfo {
  return sideInfoIn(context.state.connections, side);
}

/** A side as the page shows it, from the saved connections: its connection's name and why it can't be changed. */
export function sideInfoIn(connections: ConnectionsState, side: SideRef): SideInfo {
  const saved = savedConnection(connections, side.connection);
  const why = saved?.readOnly === true ? 'read-only' : side.view ? 'view' : undefined;
  return {
    ...side,
    connectionName: saved?.name ?? side.connection,
    ...(why === undefined ? {} : { readOnlyWhy: why }),
  };
}

/** `Local › shop.orders`, as the confirmations and the notifications name a side. */
export function sideText(side: SideInfo): string {
  return `${side.connectionName} › ${side.database}.${side.collection}`;
}

/** The target of the collection of a side. */
export function sideTarget(side: SideRef): Target {
  return { kind: 'collection', connection: side.connection, database: side.database, collection: side.collection };
}
