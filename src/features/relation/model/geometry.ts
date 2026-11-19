/**
 * Where the arrows of the diagram go: from the row of the field that refers to the row of the field it reaches (to the
 * head of the box when that row is not shown), as a curve that leaves the side facing the other box; a collection that
 * refers to itself has a loop on its right. The page and the SVG file draw the same curves.
 */
import type { Box, Relation, SampledCollection } from '../types';
import { headHeight, rowHeight, shownFields } from './rows';

/** How far a loop goes to the right of its box. */
const loopWidth = 60;
/** The least horizontal reach of the handles of a curve. */
const leastReach = 40;

/** The middle height of the row of `path` in its box, or of the head when that row is not shown. */
export function rowMiddle(
  box: Box,
  collection: SampledCollection,
  shown: { readonly relations: readonly Relation[]; readonly keysOnly: boolean },
  path: string,
): number {
  const { rows } = shownFields(collection, shown.relations, shown.keysOnly);
  const at = rows.findIndex((field) => field.path === path);
  return at < 0 ? box.top + headHeight / 2 : box.top + headHeight + at * rowHeight + rowHeight / 2 + 2;
}

/** One end of an arrow: its box and the height it leaves or reaches. */
export interface ArrowEnd {
  readonly box: Box;
  readonly y: number;
}

/** An arrow as a cubic curve of SVG (`d`), with the horizontal places where it starts and ends. */
export interface Curve {
  readonly d: string;
  readonly startX: number;
  readonly endX: number;
}

function number(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** The curve of an arrow from one box to another, or a loop on the right of a box that refers to itself. */
export function curve(from: ArrowEnd, to: ArrowEnd): Curve {
  if (from.box.name === to.box.name) {
    const x = from.box.left + from.box.width;
    const reach = x + loopWidth;
    return {
      d: `M ${number(x)} ${number(from.y)} C ${number(reach)} ${number(from.y)}, ${number(reach)} ${number(to.y)}, ${number(x)} ${number(to.y)}`,
      startX: x,
      endX: x,
    };
  }
  const rightwards = from.box.left + from.box.width / 2 < to.box.left + to.box.width / 2;
  const startX = rightwards ? from.box.left + from.box.width : from.box.left;
  const endX = rightwards ? to.box.left : to.box.left + to.box.width;
  const reach = Math.max(leastReach, Math.abs(endX - startX) / 2);
  const first = rightwards ? startX + reach : startX - reach;
  const second = rightwards ? endX - reach : endX + reach;
  return {
    d: `M ${number(startX)} ${number(from.y)} C ${number(first)} ${number(from.y)}, ${number(second)} ${number(to.y)}, ${number(endX)} ${number(to.y)}`,
    startX,
    endX,
  };
}

/** The arrow of a relation between two placed boxes, or `undefined` when one of them is not drawn. */
export function relationCurve(
  relation: Relation,
  placed: { readonly boxes: readonly Box[]; readonly collections: readonly SampledCollection[] },
  shown: { readonly relations: readonly Relation[]; readonly keysOnly: boolean },
): Curve | undefined {
  const fromBox = placed.boxes.find((box) => box.name === relation.from);
  const toBox = placed.boxes.find((box) => box.name === relation.to);
  const fromCollection = placed.collections.find((collection) => collection.name === relation.from);
  const toCollection = placed.collections.find((collection) => collection.name === relation.to);
  if (fromBox === undefined || toBox === undefined || fromCollection === undefined || toCollection === undefined) {
    return undefined;
  }
  return curve(
    { box: fromBox, y: rowMiddle(fromBox, fromCollection, shown, relation.field) },
    { box: toBox, y: rowMiddle(toBox, toCollection, shown, relation.toField) },
  );
}
