/**
 * The results of the Search documents page: one group per collection that has at least one matching document or
 * could not be read, in the order of `search.collections`, each with its head, its first 50 items and the line of the
 * documents beyond them; and the controls of each, with the intents they send (`search.show`, "A group").
 */
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';
import { shownPerCollection } from '../scan';
import { text } from '../text';
import type { CollectionScan, SearchMatch, SearchResult, SearchRun } from '../types';
import { headParts } from './summary';

/** **Open in collection**, on a group's head, after *+12 more documents —*, and in the menu of an item. */
export interface OpenControl {
  readonly label: string;
  readonly tooltip?: string;
  readonly feature: 'search.open-in-collection';
  readonly element: 'search.open-in-collection@list' | 'search.open-in-collection@item-menu';
  readonly args: Json;
}

/** **Copy _id**, beside an item's `_id` and in its menu. */
export interface CopyControl {
  readonly label: string;
  readonly feature: 'search.copy-id';
  readonly element: 'search.copy-id@list' | 'search.copy-id@item-menu';
  readonly args: Json;
}

/** One line of an item: the path, the kind when it is not a string, and the text around the match. */
export interface MatchLine {
  readonly path: string;
  readonly kind?: string;
  readonly before: string;
  readonly match: string;
  readonly after: string;
}

/** A document found, as an item of its group. */
export interface ItemView {
  readonly idText: string;
  readonly selected: boolean;
  readonly copy: CopyControl;
  readonly lines: readonly MatchLine[];
  readonly moreMatches?: string;
  /** A click or the arrow keys: the document in the inspector island. */
  readonly inspect: { readonly feature: 'document.inspect'; readonly args: Json };
  /** A double click, `Enter`, or **Open document** in its menu: the document in a document tab. */
  readonly open: { readonly label: string; readonly feature: 'document.open'; readonly args: Json };
  readonly menu: { readonly open: OpenControl; readonly copy: CopyControl };
}

/** A group of the results. */
export interface GroupView {
  /** `shop.orders`, which names the group whatever **In** says. */
  readonly key: string;
  /** The name shown: `shop.orders` when **In** is **Every database**, `orders` otherwise. */
  readonly name: string;
  readonly view: boolean;
  readonly folded: boolean;
  readonly head: readonly string[];
  readonly open?: OpenControl;
  readonly items: readonly ItemView[];
  /** *+12 more documents — Open in collection*. */
  readonly more?: { readonly text: string; readonly open: OpenControl };
}

/** What the groups are drawn from, beside the search. */
export interface GroupsInput {
  readonly connection: ConnectionId;
  readonly readOnly: boolean;
  readonly folded: readonly string[];
  readonly selected?: { readonly key: string; readonly idText: string };
}

function namespaceOf(scan: CollectionScan): string {
  return `${scan.collection.database}.${scan.collection.collection}`;
}

function placeArgs(input: GroupsInput, scan: CollectionScan): { readonly [key: string]: Json } {
  return { connection: input.connection, database: scan.collection.database, collection: scan.collection.collection };
}

function groupOpen(input: GroupsInput, scan: CollectionScan): OpenControl {
  return {
    label: text.group.openInCollection,
    tooltip: text.group.openTooltip(namespaceOf(scan)),
    feature: 'search.open-in-collection',
    element: 'search.open-in-collection@list',
    args: { ...placeArgs(input, scan), ids: [...scan.ids], found: scan.found },
  };
}

function lineOf(match: SearchMatch): MatchLine {
  const kind = text.kinds[match.kind];
  return {
    path: match.path,
    ...(kind === '' ? {} : { kind }),
    before: match.before,
    match: match.match,
    after: match.after,
  };
}

function copyOf(result: SearchResult, element: CopyControl['element']): CopyControl {
  return { label: text.group.copyId, feature: 'search.copy-id', element, args: { id: result.id } };
}

function itemOf(input: GroupsInput, scan: CollectionScan, result: SearchResult): ItemView {
  const place = placeArgs(input, scan);
  const readOnly = input.readOnly || scan.collection.view;
  return {
    idText: result.idText,
    selected: input.selected?.key === namespaceOf(scan) && input.selected.idText === result.idText,
    copy: copyOf(result, 'search.copy-id@list'),
    lines: result.matches.map(lineOf),
    ...(result.more > 0 ? { moreMatches: text.group.moreMatches(result.more) } : {}),
    inspect: { feature: 'document.inspect', args: { ...place, id: result.id, view: scan.collection.view } },
    open: { label: text.group.openDocument, feature: 'document.open', args: { ...place, id: result.id, readOnly } },
    menu: {
      open: {
        label: text.group.openInCollection,
        feature: 'search.open-in-collection',
        element: 'search.open-in-collection@item-menu',
        args: { ...place, id: result.id },
      },
      copy: copyOf(result, 'search.copy-id@item-menu'),
    },
  };
}

function groupOf(input: GroupsInput, run: SearchRun, scan: CollectionScan): GroupView {
  const key = namespaceOf(scan);
  const open = scan.found > 0 ? groupOpen(input, scan) : undefined;
  const beyond = scan.found - Math.min(scan.found, shownPerCollection);
  return {
    key,
    name: run.everyDatabase ? key : scan.collection.collection,
    view: scan.collection.view,
    folded: input.folded.includes(key),
    head: headParts(scan),
    ...(open === undefined ? {} : { open }),
    items: scan.results.map((result) => itemOf(input, scan, result)),
    ...(beyond > 0 && open !== undefined ? { more: { text: text.group.moreDocuments(beyond), open } } : {}),
  };
}

/** The groups of a search: the collections with a matching document or that could not be read. */
export function groupsOf(input: GroupsInput, run: SearchRun): readonly GroupView[] {
  return run.scans
    .filter((scan) => scan.found > 0 || scan.state.kind === 'error')
    .map((scan) => groupOf(input, run, scan));
}
