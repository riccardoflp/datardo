/**
 * Feature: relation.layout
 *
 * Places the boxes of the collections in columns that follow the references, so that most arrows point left and
 * related collections are near each other: a layered drawing of a directed graph (Sugiyama, Tagawa and Toda), the
 * layers from the longest path, the order in a layer from barycenters. The unrelated collections go in a grid below.
 */
import { boxHeight, boxWidth } from './model/rows';
import { compareText, type Box, type Layout, type Relation, type SampledCollection } from './types';

/** The space between two columns. */
export const columnGap = 130;
/** The space between two boxes of a column, and between two rows of the grid. */
export const boxGap = 36;
/** The sweeps that order the columns. */
export const sweeps = 6;

/** What the layout is made from: the collections with their fields, and the relations. */
export interface LayoutGraph {
  readonly collections: readonly SampledCollection[];
  readonly relations: readonly Relation[];
}

type Links = ReadonlyMap<string, readonly string[]>;

/** Per collection, the other collections it refers to (views to the collection they read); self-links left out. */
function linksOf(graph: LayoutGraph, names: ReadonlySet<string>): Links {
  const links = new Map<string, string[]>([...names].map((name) => [name, []]));
  for (const relation of graph.relations) {
    const out = links.get(relation.from);
    if (relation.from !== relation.to && out !== undefined && names.has(relation.to) && !out.includes(relation.to)) {
      out.push(relation.to);
    }
  }
  return links;
}

/** The column of each related collection: 0 when it refers to nothing, else one more than what it refers to. */
function columnsOf(related: readonly string[], links: Links): ReadonlyMap<string, number> {
  const column = new Map<string, number>();
  const visiting = new Set<string>();
  const columnOf = (name: string): number => {
    const known = column.get(name);
    if (known !== undefined) {
      return known;
    }
    visiting.add(name);
    // A relation that would close a cycle is ignored for the column.
    const deeper = (links.get(name) ?? []).filter((to) => !visiting.has(to)).map((to) => columnOf(to) + 1);
    visiting.delete(name);
    const found = Math.max(0, ...deeper);
    column.set(name, found);
    return found;
  };
  related.forEach(columnOf);
  return column;
}

function neighboursOf(names: readonly string[], links: Links): ReadonlyMap<string, readonly string[]> {
  const neighbours = new Map<string, string[]>(names.map((name) => [name, []]));
  for (const [from, tos] of links) {
    for (const to of tos) {
      neighbours.get(from)?.push(to);
      neighbours.get(to)?.push(from);
    }
  }
  return neighbours;
}

function positions(columns: readonly (readonly string[])[]): ReadonlyMap<string, number> {
  return new Map(columns.flatMap((column) => column.map((name, at) => [name, at / Math.max(1, column.length - 1)])));
}

/** Sorts each column by the average position of its members' neighbours in the other columns, 6 times over. */
function ordered(columns: string[][], neighbours: ReadonlyMap<string, readonly string[]>): void {
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    const position = positions(columns);
    for (const column of columns) {
      const center = new Map<string, number>();
      for (const name of column) {
        const around = (neighbours.get(name) ?? []).filter((other) => position.has(other) && !column.includes(other));
        const sum = around.reduce((total, other) => total + (position.get(other) ?? 0), 0);
        center.set(name, around.length > 0 ? sum / around.length : (position.get(name) ?? 0));
      }
      column.sort((left, right) => (center.get(left) ?? 0) - (center.get(right) ?? 0) || compareText(left, right));
    }
  }
}

interface Heights {
  readonly of: (name: string) => number;
}

function placeColumns(columns: readonly (readonly string[])[], heights: Heights): { boxes: Box[]; tallest: number } {
  const columnHeights = columns.map(
    (column) => column.reduce((total, name) => total + heights.of(name), 0) + boxGap * Math.max(0, column.length - 1),
  );
  const tallest = Math.max(0, ...columnHeights);
  const boxes: Box[] = [];
  columns.forEach((column, at) => {
    let top = (tallest - (columnHeights[at] ?? 0)) / 2;
    for (const name of column) {
      const height = heights.of(name);
      boxes.push({ name, left: at * (boxWidth + columnGap), top, width: boxWidth, height });
      top += height + boxGap;
    }
  });
  return { boxes, tallest };
}

function placeGrid(unrelated: readonly string[], perRow: number, start: number, heights: Heights): Box[] {
  const boxes: Box[] = [];
  let top = start;
  for (let first = 0; first < unrelated.length; first += perRow) {
    const row = unrelated.slice(first, first + perRow);
    row.forEach((name, at) => {
      boxes.push({ name, left: at * (boxWidth + columnGap / 2), top, width: boxWidth, height: heights.of(name) });
    });
    top += Math.max(...row.map((name) => heights.of(name))) + boxGap;
  }
  return boxes;
}

/** Feature: relation.layout — a box for every collection, and the size of the drawing. */
export function layout(graph: LayoutGraph, keysOnly: boolean): Layout {
  const names = graph.collections.map((collection) => collection.name).sort(compareText);
  const links = linksOf(graph, new Set(names));
  const isRelated = new Set([...links].flatMap(([from, tos]) => (tos.length > 0 ? [from, ...tos] : [])));
  const related = names.filter((name) => isRelated.has(name));
  const column = columnsOf(related, links);
  const columns: string[][] = Array.from({ length: Math.max(0, ...column.values()) + 1 }, () => []);
  related.forEach((name) => columns[column.get(name) ?? 0]?.push(name));
  ordered(related.length === 0 ? [] : columns, neighboursOf(names, links));
  const byName = new Map(graph.collections.map((collection) => [collection.name, collection]));
  const heights: Heights = {
    of: (name) => {
      const collection = byName.get(name);
      return collection === undefined ? 0 : boxHeight(collection, graph.relations, keysOnly);
    },
  };
  const placed = related.length === 0 ? { boxes: [], tallest: 0 } : placeColumns(columns, heights);
  const unrelated = names.filter((name) => !isRelated.has(name));
  const start = related.length === 0 ? 0 : placed.tallest + boxGap * 2;
  const perRow = Math.max(3, related.length === 0 ? 0 : columns.length);
  const boxes = [...placed.boxes, ...placeGrid(unrelated, perRow, start, heights)];
  return {
    boxes,
    width: Math.max(0, ...boxes.map((box) => box.left + box.width)),
    height: Math.max(0, ...boxes.map((box) => box.top + box.height)),
  };
}
