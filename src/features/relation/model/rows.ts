/**
 * The rows of a box of the diagram: which fields it shows (the keys always, the others in the order of the document
 * up to 14 rows), how a row is written under its parent, its marks, and the box's height. The page, the layout and
 * both exports show the same rows.
 */
import type { Relation, SampledCollection, SampledField } from '../types';

/** The width of a box. */
export const boxWidth = 240;
/** The height of the head of a box. */
export const headHeight = 30;
/** The height of a row. */
export const rowHeight = 19;
/** What a box adds below its last row. */
export const boxBottom = 8;
/** The rows a box shows at most. */
export const mostRows = 14;

/** The fields a box shows, and how many it leaves out. */
export interface ShownRows {
  readonly rows: readonly SampledField[];
  readonly more: number;
}

/** The keys of a collection: `_id`, its unique fields, the fields its relations leave or reach. */
export function keysOf(collection: SampledCollection, relations: readonly Relation[]): ReadonlySet<string> {
  const keys = new Set<string>(['_id', ...collection.unique]);
  for (const relation of relations.filter((each) => each.kind !== 'view')) {
    if (relation.from === collection.name) {
      keys.add(relation.field);
    }
    if (relation.to === collection.name) {
      keys.add(relation.toField);
    }
  }
  return keys;
}

/** The rows of a box: the keys always; the other fields, not sub-documents, fill what is left of the 14 rows. */
export function shownFields(
  collection: SampledCollection,
  relations: readonly Relation[],
  keysOnly: boolean,
): ShownRows {
  const keys = keysOf(collection, relations);
  const visible = collection.fields.filter(
    (field) => keys.has(field.path) || (!keysOnly && field.types[0] !== 'object'),
  );
  let room = Math.max(0, mostRows - visible.filter((field) => keys.has(field.path)).length);
  const rows = visible.filter((field) => {
    if (keys.has(field.path)) {
      return true;
    }
    room -= 1;
    return room >= 0;
  });
  return { rows, more: visible.length - rows.length };
}

/** The text of a row: the last part of its path, indented, under its parent's row; the whole label otherwise. */
export function rowLabel(field: SampledField, rows: readonly SampledField[]): { text: string; indent: number } {
  if (field.depth === 0) {
    return { text: field.label, indent: 0 };
  }
  const parent = field.path.split('.').slice(0, -1).join('.');
  return rows.some((row) => row.path === parent)
    ? { text: field.label.split('.').slice(field.depth).join('.'), indent: field.depth }
    : { text: field.label, indent: 0 };
}

/** The mark of a row: `PK` for `_id`, `FK` for a field that refers elsewhere, `UK` for a unique field, or none. */
export function rowMark(
  collection: SampledCollection,
  relations: readonly Relation[],
  field: SampledField,
): 'PK' | 'FK' | 'UK' | undefined {
  if (field.path === '_id') {
    return 'PK';
  }
  if (relations.some((each) => each.kind !== 'view' && each.from === collection.name && each.field === field.path)) {
    return 'FK';
  }
  return collection.unique.includes(field.path) ? 'UK' : undefined;
}

/** The first type of a field that is not `null`; `null` when it has no other, `undefined` when it has none. */
export function firstType(field: SampledField): string | undefined {
  return field.types.find((type) => type !== 'null') ?? field.types[0];
}

/**
 * The height of a box: the head, one row per field shown, one more for *+N more fields*, and the bottom. A collection
 * without sampled documents has one row for *empty, or not readable*.
 */
export function boxHeight(collection: SampledCollection, relations: readonly Relation[], keysOnly: boolean): number {
  const { rows, more } = shownFields(collection, relations, keysOnly);
  const lines = isEmptyBox(collection) ? 1 : rows.length + (more > 0 ? 1 : 0);
  return headHeight + lines * rowHeight + boxBottom;
}

/** Whether a box says *empty, or not readable*: a collection, not a view, of which no document was sampled. */
export function isEmptyBox(collection: SampledCollection): boolean {
  return !collection.view && collection.sampled === 0;
}
