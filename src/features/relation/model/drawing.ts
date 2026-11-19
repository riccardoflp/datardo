/**
 * The drawing of the Relationship diagram: each box where the layout puts it or where the user moved it, its rows with
 * their marks, types and tooltips, and the arrows with their curves, what stands out and what fades with the
 * selection.
 */
import { relationText } from '../detect';
import { layout } from '../layout';
import { text } from '../text';
import type { Box, ReferenceGraph, Relation, SampledCollection, SampledField } from '../types';
import { relationCurve } from './geometry';
import { firstType, isEmptyBox, rowLabel, rowMark, shownFields } from './rows';

/** A box the user dragged, at its new place. */
export interface MovedBox {
  readonly name: string;
  readonly left: number;
  readonly top: number;
}

/** What is selected: a box, or a relation of the list by its place in it. */
export type DiagramSelection =
  { readonly kind: 'box'; readonly name: string } | { readonly kind: 'relation'; readonly at: number };

/** A row of a box. */
export interface RowView {
  readonly text: string;
  readonly indent: number;
  /** The mark and the first type: `FK · objectId`. */
  readonly right: string;
  readonly tooltip: string;
  readonly key: boolean;
}

/** A box as drawn. */
export interface BoxView extends Box {
  readonly head: string;
  /** `1,204 docs`, `view`, or nothing when the count is not known. */
  readonly badge?: string;
  readonly view: boolean;
  readonly rows: readonly RowView[];
  /** `+3 more fields`, or `empty, or not readable`. */
  readonly last?: string;
  readonly selected: boolean;
  readonly faded: boolean;
}

/** An arrow as drawn. */
export interface ArrowView {
  readonly d: string;
  /** `N` beside an arrow whose field holds several references. */
  readonly mark?: string;
  readonly dashed: boolean;
  readonly tooltip: string;
  readonly selected: boolean;
  readonly faded: boolean;
}

/** The drawing: its size, its boxes and its arrows. */
export interface DrawingView {
  readonly width: number;
  readonly height: number;
  readonly boxes: readonly BoxView[];
  readonly arrows: readonly ArrowView[];
}

/** The boxes where they are: the layout's, with the moved ones where they were dragged. */
export function placedBoxes(graph: ReferenceGraph, keysOnly: boolean, moved: readonly MovedBox[]): readonly Box[] {
  return layout(graph, keysOnly).boxes.map((box) => {
    const to = moved.find((each) => each.name === box.name);
    return to === undefined ? box : { ...box, left: to.left, top: to.top };
  });
}

function rowTooltip(field: SampledField): string {
  const types = field.types.join(' | ');
  const percent = Math.round(field.share * 100);
  return percent >= 100 ? `${field.label}: ${types}` : `${field.label}: ${types} · ${text.diagram.share(percent)}`;
}

function rowsOf(collection: SampledCollection, relations: readonly Relation[], keysOnly: boolean): readonly RowView[] {
  const { rows } = shownFields(collection, relations, keysOnly);
  return rows.map((field) => {
    const mark = rowMark(collection, relations, field);
    const label = rowLabel(field, rows);
    return {
      text: label.text,
      indent: label.indent,
      right: [mark, firstType(field)].filter((part) => part !== undefined).join(' · '),
      tooltip: rowTooltip(field),
      key: mark !== undefined,
    };
  });
}

/** The names of the boxes and the places of the relations that stand out with the selection; all of them without. */
function standingOut(
  relations: readonly Relation[],
  selection: DiagramSelection | undefined,
): { boxes: ReadonlySet<string>; relations: ReadonlySet<number> } | undefined {
  if (selection === undefined) {
    return undefined;
  }
  const chosen = relations.flatMap((relation, at) => {
    const isChosen =
      selection.kind === 'relation'
        ? at === selection.at
        : relation.from === selection.name || relation.to === selection.name;
    return isChosen ? [at] : [];
  });
  const boxes = new Set(chosen.flatMap((at) => [relations[at]?.from ?? '', relations[at]?.to ?? '']));
  if (selection.kind === 'box') {
    boxes.add(selection.name);
  }
  return { boxes, relations: new Set(chosen) };
}

function boxView(box: Box, collection: SampledCollection, drawn: Drawn, out: ReturnType<typeof standingOut>): BoxView {
  const { more } = shownFields(collection, drawn.graph.relations, drawn.keysOnly);
  const badge = collection.view
    ? text.diagram.view
    : collection.documents === undefined
      ? undefined
      : text.diagram.documents(collection.documents);
  const last = more > 0 ? text.diagram.moreFields(more) : isEmptyBox(collection) ? text.diagram.emptyBox : undefined;
  return {
    ...box,
    head: collection.name,
    ...(badge === undefined ? {} : { badge }),
    view: collection.view,
    rows: rowsOf(collection, drawn.graph.relations, drawn.keysOnly),
    ...(last === undefined ? {} : { last }),
    selected: drawn.selection?.kind === 'box' && drawn.selection.name === box.name,
    faded: out !== undefined && !out.boxes.has(box.name),
  };
}

interface Drawn {
  readonly graph: ReferenceGraph;
  readonly keysOnly: boolean;
  readonly selection?: DiagramSelection;
}

/** The drawing of the references with the boxes where they are, and the selection. */
export function drawing(
  graph: ReferenceGraph,
  options: { readonly keysOnly: boolean; readonly moved: readonly MovedBox[]; readonly selection?: DiagramSelection },
): DrawingView {
  const drawn: Drawn = {
    graph,
    keysOnly: options.keysOnly,
    ...(options.selection === undefined ? {} : { selection: options.selection }),
  };
  const boxes = placedBoxes(graph, options.keysOnly, options.moved);
  const out = standingOut(graph.relations, options.selection);
  const placed = { boxes, collections: graph.collections };
  const shown = { relations: graph.relations, keysOnly: options.keysOnly };
  const arrows = graph.relations.flatMap((relation, at) => {
    const drawnCurve = relationCurve(relation, placed, shown);
    if (drawnCurve === undefined) {
      return [];
    }
    const arrow: ArrowView = {
      d: drawnCurve.d,
      ...(relation.several ? { mark: text.diagram.severalMark } : {}),
      dashed: relation.kind === 'view',
      tooltip: relationText(relation),
      selected: out?.relations.has(at) === true,
      faded: out !== undefined && !out.relations.has(at),
    };
    return [arrow];
  });
  return {
    width: Math.max(0, ...boxes.map((box) => box.left + box.width)),
    height: Math.max(0, ...boxes.map((box) => box.top + box.height)),
    boxes: boxes.flatMap((box) => {
      const collection = graph.collections.find((each) => each.name === box.name);
      return collection === undefined ? [] : [boxView(box, collection, drawn, out)];
    }),
    arrows,
  };
}
