/**
 * Feature: query.drag
 *
 * A cell or a column header dragged from the table shows, over the bar, the conditions it can become; dropping it on
 * one adds that condition (`query.add-condition`, `query.add-sort`, `query.add-projection`) and runs the query.
 */
import type { Json } from '../../shared/engine-request';
import { filterWithCondition } from './add-condition';
import { projectionWithField } from './add-projection';
import { sortWithField } from './add-sort';
import { bsonType, isOperatorObject } from './mongosh/ejson';
import { objectOfText } from './mongosh/object-text';
import { text } from './text';
import type { QueryTexts } from './types';

/** What is dragged: a cell with its value, or a column header; `within` is the path of the expanded array it is in. */
export type Dragged =
  | { readonly kind: 'cell'; readonly field: string; readonly value: Json; readonly within?: string }
  | { readonly kind: 'header'; readonly field: string; readonly within?: string };

/** What a zone adds. */
export type ZoneAction =
  | { readonly to: 'filter'; readonly condition: Json }
  | { readonly to: 'sort'; readonly direction: 1 | -1 | 'remove' }
  | { readonly to: 'project'; readonly value: 1 | 0 | 'remove' };

/** A zone over a field of the bar. */
export interface Zone {
  readonly label: string;
  /** The field, written `items[].sku` for a field of the elements of an expanded array. */
  readonly field: string;
  readonly tip: string;
  readonly element: string;
  readonly action: ZoneAction;
}

/** The zones over **Filter**, **Sort** and **Project**. */
export interface DragView {
  readonly filter: readonly Zone[];
  readonly sort: readonly Zone[];
  readonly project: readonly Zone[];
}

/** What the zones are drawn from: what is dragged and the texts of the bar. */
export interface DragState {
  readonly dragged: Dragged;
  readonly texts: QueryTexts;
}

/** How a field is written on a zone: `items[].sku` within `items`. */
export function fieldLabel(field: string, within?: string): string {
  return within !== undefined && field.startsWith(`${within}.`) ? `${within}[]${field.slice(within.length)}` : field;
}

function ranged(value: Json): boolean {
  return ['int', 'long', 'double', 'decimal', 'date', 'string'].includes(bsonType(value));
}

function filterZone(dragged: Dragged, label: string, tip: string, condition: Json): Zone {
  const same =
    dragged.within !== undefined && dragged.field.startsWith(`${dragged.within}.`)
      ? text.drag.sameElement(dragged.within)
      : '';
  return {
    label,
    field: fieldLabel(dragged.field, dragged.within),
    tip: tip + same,
    element: 'query.add-condition@query-bar',
    action: { to: 'filter', condition },
  };
}

function cellZones(dragged: Extract<Dragged, { kind: 'cell' }>): Zone[] {
  const { value } = dragged;
  const equal = isOperatorObject(value) ? { $eq: value } : value;
  return [
    filterZone(dragged, text.drag.equals, text.drag.equalsTip, equal),
    filterZone(dragged, text.drag.notEqual, text.drag.notEqualTip, { $ne: value }),
    ...(ranged(value)
      ? [
          filterZone(dragged, text.drag.from, text.drag.fromTip, { $gte: value }),
          filterZone(dragged, text.drag.to, text.drag.toTip, { $lte: value }),
        ]
      : []),
    ...(Array.isArray(value) && value.length > 0
      ? [filterZone(dragged, text.drag.in, text.drag.inTip, { $in: value })]
      : []),
  ];
}

function hasKey(written: string, field: string): boolean {
  const read = objectOfText(written, 0);
  return read.ok && Object.hasOwn(read.value, field);
}

function sortZones(field: string, label: string, sortText: string): Zone[] {
  const zone = (name: string, tip: string, direction: 1 | -1 | 'remove'): Zone => ({
    label: name,
    field: label,
    tip,
    element: 'query.add-sort@query-bar',
    action: { to: 'sort', direction },
  });
  return [
    zone(text.drag.ascending, text.drag.ascendingTip(field), 1),
    zone(text.drag.descending, text.drag.descendingTip(field), -1),
    ...(hasKey(sortText, field) ? [zone(text.drag.remove, text.drag.removeSortTip(field), 'remove')] : []),
  ];
}

function projectZones(field: string, label: string, projectText: string): Zone[] {
  const zone = (name: string, tip: string, value: 1 | 0 | 'remove'): Zone => ({
    label: name,
    field: label,
    tip,
    element: 'query.add-projection@query-bar',
    action: { to: 'project', value },
  });
  return [
    zone(text.drag.include, text.drag.includeTip(field), 1),
    zone(text.drag.exclude, text.drag.excludeTip(field), 0),
    ...(hasKey(projectText, field) ? [zone(text.drag.remove, text.drag.removeProjectionTip(field), 'remove')] : []),
  ];
}

/**
 * Feature: query.drag
 *
 * The zones a dragged cell or header can be dropped on: for a cell, the conditions of its value over **Filter**; for a
 * header, **exists**, **missing** and **is null** over **Filter**; for both, the directions over **Sort** and include
 * or exclude over **Project**, with **✕ remove** when the field is already there.
 */
export function view(state: DragState): DragView {
  const { dragged } = state;
  const { field } = dragged;
  const label = fieldLabel(field, dragged.within);
  // A cell and a header sort and project by the dotted path of their field, also for a field of the elements of an
  // array; a cell's value plays no part there.
  const sort = sortZones(field, label, state.texts.sort);
  const project = projectZones(field, label, state.texts.project);
  if (dragged.kind === 'cell') {
    return { filter: cellZones(dragged), sort, project };
  }
  return {
    filter: [
      filterZone(dragged, text.drag.exists, text.drag.existsTip(field), { $exists: true }),
      filterZone(dragged, text.drag.missing, text.drag.missingTip(field), { $exists: false }),
      filterZone(dragged, text.drag.isNull, text.drag.isNullTip(field), null),
    ],
    sort,
    project,
  };
}

/** What a drop on a zone does: the new text of the field of the bar, or the message of a text that must be fixed first. */
export function dropped(
  zone: Zone,
  dragged: Dragged,
  texts: QueryTexts,
  now = 0,
): { readonly field: 'filter' | 'sort' | 'project'; readonly text: string } | { readonly error: string } {
  const { action } = zone;
  switch (action.to) {
    case 'filter': {
      const result = filterWithCondition(texts.filter, dragged.field, action.condition, {
        ...(dragged.within === undefined ? {} : { within: dragged.within }),
        now,
      });
      return result.ok ? { field: 'filter', text: result.text } : { error: `${text.drag.fixFilter} ${result.error}` };
    }
    case 'sort': {
      const result = sortWithField(texts.sort, dragged.field, action.direction, now);
      return result.ok ? { field: 'sort', text: result.text } : { error: `${text.drag.fixSort} ${result.error}` };
    }
    case 'project': {
      const result = projectionWithField(texts.project, dragged.field, action.value, now);
      return result.ok
        ? { field: 'project', text: result.text }
        : { error: `${text.drag.fixProjection} ${result.error}` };
    }
  }
}
