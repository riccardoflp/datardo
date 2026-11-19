/**
 * Feature: relation.follow
 *
 * **Go from here**: for the selected document of a collection tab, the documents it refers to and the collections whose
 * documents refer to it, in the inspector island; and what the cells and the row menu of the table offer to follow
 * them (`cellLink`, `rowReferences`). A tab on a view has the references of the collection it reads.
 */
import type { Json } from '../../shared/engine-request';
import { cutUnits, characters } from '../../shared/text-units';
import { isJsonObject, isSubdocument } from '../query/mongosh/ejson';
import { referencingTargets } from './referrers';
import { collectionReferences, referenceTargets } from './targets';
import { text } from './text';
import type { ReferenceTarget, Relation } from './types';

/** The longest filter a tooltip shows before it is cut with `…`. */
export const longestTooltip = 300;

/** The references of the database as the tab knows them. */
export type KnownReferences =
  | { readonly kind: 'finding' }
  | { readonly kind: 'not-detected' }
  | { readonly kind: 'known'; readonly relations: readonly Relation[] };

/** What **Go from here** is drawn from. */
export interface FollowState {
  readonly database: string;
  /** The collection of the tab; for a view, the collection it reads. */
  readonly collection: string;
  /** The results of a find, or of an aggregation, which has no **Go from here**. */
  readonly source: 'find' | 'aggregate';
  readonly references: KnownReferences;
  readonly document: Json;
}

/** A line of **Go from here**: its text, its tooltip (the filter) and what a click starts. */
export interface FollowLine {
  readonly text: string;
  readonly tooltip: string;
  readonly target: ReferenceTarget;
  readonly feature: 'relation.open-referenced' | 'relation.open-referencing';
  readonly element: 'relation.open-referenced@inspector' | 'relation.open-referencing@inspector';
}

/** What **Go from here** shows. */
export type FollowView =
  | { readonly kind: 'none' }
  | { readonly kind: 'message'; readonly text: string }
  | {
      readonly kind: 'not-detected';
      readonly text: string;
      readonly diagram: { readonly label: string; readonly element: 'relation.diagram@inspector' };
    }
  | {
      readonly kind: 'lines';
      readonly title: string;
      readonly referenced: readonly FollowLine[];
      readonly referencedByTitle: string;
      readonly referencedBy: readonly FollowLine[];
    };

/** A filter as a tooltip shows it: cut after 300 characters with `…`. */
export function tooltipOf(filterText: string): string {
  const cut = cutUnits(characters(filterText), longestTooltip);
  return cut.more === '' ? cut.text : `${cut.text}…`;
}

/** The values of the document at a path without array positions, the elements of arrays gathered. */
function valuesAt(document: Json, path: string): Json | undefined {
  let current: readonly Json[] = [document];
  for (const part of path.split('.')) {
    current = current.flatMap((each) => {
      const inner = isSubdocument(each) && Object.hasOwn(each, part) ? each[part] : undefined;
      return inner === undefined ? [] : Array.isArray(inner) ? (inner as readonly Json[]) : [inner];
    });
  }
  const [only] = current;
  return current.length > 1 ? current : only;
}

/** The paths of a document in the order of its fields, without array positions. */
function pathsOf(document: Json, prefix = ''): readonly string[] {
  if (!isSubdocument(document)) {
    return [];
  }
  return Object.entries(document).flatMap(([key, value]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const inner = Array.isArray(value) ? (value as readonly Json[]).filter(isSubdocument) : [value];
    return [path, ...inner.flatMap((each) => pathsOf(each, path))];
  });
}

function referencedLines(state: FollowState, outgoing: readonly Relation[]): readonly FollowLine[] {
  const order = pathsOf(state.document);
  const fields = [...new Set(outgoing.map((relation) => relation.field))]
    .filter((field) => order.includes(field))
    .sort((left, right) => order.indexOf(left) - order.indexOf(right));
  return fields.flatMap((field) => {
    const relation = outgoing.find((each) => each.field === field);
    const targets = referenceTargets(outgoing, field, valuesAt(state.document, field), state.database);
    return targets.map((target) => {
      const reached = target.label.endsWith('._id') ? target.collection : target.label;
      const count = relation?.several === true ? ` (${String(target.count)})` : '';
      return {
        text: `${relation?.fieldLabel ?? field} → ${reached}${count}`,
        tooltip: tooltipOf(target.filterText),
        target,
        feature: 'relation.open-referenced' as const,
        element: 'relation.open-referenced@inspector' as const,
      };
    });
  });
}

function referencedByLines(state: FollowState, incoming: readonly Relation[]): readonly FollowLine[] {
  return referencingTargets(incoming, state.document).map((target) => ({
    text: target.label,
    tooltip: tooltipOf(target.filterText),
    target,
    feature: 'relation.open-referencing' as const,
    element: 'relation.open-referencing@inspector' as const,
  }));
}

/** Feature: relation.follow — what **Go from here** shows for the selected document. */
export function view(state: FollowState): FollowView {
  if (state.source === 'aggregate' || !isJsonObject(state.document)) {
    return { kind: 'none' };
  }
  switch (state.references.kind) {
    case 'finding':
      return { kind: 'message', text: text.follow.finding(state.database) };
    case 'not-detected':
      return {
        kind: 'not-detected',
        text: text.follow.notDetected(state.database),
        diagram: { label: text.follow.diagram, element: 'relation.diagram@inspector' },
      };
    case 'known':
      break;
  }
  const { outgoing, incoming } = collectionReferences(state.references.relations, state.collection);
  const referenced = referencedLines(state, outgoing);
  const referencedBy = referencedByLines(state, incoming);
  if (referenced.length === 0 && referencedBy.length === 0) {
    return { kind: 'message', text: text.follow.empty };
  }
  return {
    kind: 'lines',
    title: text.follow.goFromHere,
    referenced,
    referencedByTitle: text.follow.referencedBy,
    referencedBy,
  };
}

/** What the table knows to mark the references of its cells and rows. */
export type TableReferences = Omit<FollowState, 'document'>;

/** A cell that holds a reference: the end of its tooltip, its entry of the cell menu, and where it leads. */
export interface CellLink {
  readonly tooltip: string;
  readonly targets: readonly ReferenceTarget[];
  readonly menu: {
    readonly label: string;
    /** For a field that refers to several collections: one entry per target, and this tooltip. */
    readonly tooltip?: string;
    readonly element: 'relation.open-referenced@cell-menu';
  };
  /** `Ctrl`+click on the cell, and `Ctrl+Enter` on the selected cell. */
  readonly element: 'relation.open-referenced@table';
}

function relationsOf(state: TableReferences): readonly Relation[] | undefined {
  return state.source === 'find' && state.references.kind === 'known' ? state.references.relations : undefined;
}

function cellTooltip(targets: readonly ReferenceTarget[]): string {
  const [first] = targets;
  if (first === undefined || targets.length > 1) {
    return text.follow.openSeveral(targets.map((each) => each.collection));
  }
  return first.count > 1 ? text.follow.openMany(first.count, first.collection) : text.follow.openOne(first.collection);
}

/**
 * The link of a cell of the column `key` (its dotted path, `author.$id` for the column of an expanded DBRef) holding
 * `value`; `undefined` when the cell is not a reference, and in the results of an aggregation.
 */
export function cellLink(state: TableReferences, key: string, value: Json | undefined): CellLink | undefined {
  const relations = relationsOf(state);
  if (relations === undefined) {
    return undefined;
  }
  const { outgoing } = collectionReferences(relations, state.collection);
  const targets = referenceTargets(outgoing, key, value, state.database);
  const [first] = targets;
  if (first === undefined) {
    return undefined;
  }
  return {
    tooltip: cellTooltip(targets),
    targets,
    menu: {
      label: targets.length === 1 && first.count > 1 ? text.follow.openReferencedMany : text.follow.openReferenced,
      ...(targets.length > 1 ? { tooltip: text.follow.severalCollections } : {}),
      element: 'relation.open-referenced@cell-menu',
    },
    element: 'relation.open-referenced@table',
  };
}

/** **Find referencing documents** of the row menu, with one entry per line of **Referenced by**. */
export interface RowReferences {
  readonly label: string;
  readonly tooltip: string;
  readonly targets: readonly ReferenceTarget[];
  readonly element: 'relation.open-referencing@row-menu';
}

/** The entry of the row menu of a document; `undefined` when nothing refers to the collection, or in an aggregation. */
export function rowReferences(state: TableReferences, document: Json): RowReferences | undefined {
  const relations = relationsOf(state);
  const incoming = relations === undefined ? [] : collectionReferences(relations, state.collection).incoming;
  if (incoming.length === 0) {
    return undefined;
  }
  return {
    label: text.follow.findReferencing,
    tooltip: text.follow.findReferencingHint,
    targets: referencingTargets(incoming, document),
    element: 'relation.open-referencing@row-menu',
  };
}
