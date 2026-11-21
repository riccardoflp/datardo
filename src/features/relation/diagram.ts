/**
 * Feature: relation.diagram
 *
 * The Relationship diagram page of a database: the collections as boxes with their fields and types, the references
 * as arrows, and the list of the relations. `view` says what the page shows from its state; `plan` is what the tree
 * island, the inspector island and Go to start: the tab `Diagram: shop`, made active when it is open, with the box of
 * the collection it was started on selected. The zoom's bounds are here too.
 */
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import type { TabShows } from '../../shared/state/tabs';
import { groupThousands } from '../../shared/text-units';
import { appPlan, appStep, startArgs } from '../nav/types';
import { planOf } from '../tab/open';
import { relationText } from './detect';
import { databasePlaceOf, type DatabasePlace } from './model/args';
import { diagramChoices, diagramOf, sampleAction } from './model/page';
import { drawing, type DiagramSelection, type DrawingView, type MovedBox } from './model/drawing';
import { diagramSamples } from './read';
import { text } from './text';
import type { ReferenceGraph } from './types';

/** The page's name in a tab. */
export const diagramPage = 'diagram';
/** The smallest and largest scale. */
export const scaleBounds = { least: 0.15, most: 3 } as const;
/** What **+** and **−** multiply the scale by. */
export const zoomSteps = { in: 1.25, out: 0.8 } as const;
/** The margin **Fit** leaves around the drawing, in pixels. */
export const fitMargin = 40;
/** The app action that selects a box of an open diagram and brings it into view. */
export const selectBoxAction = 'relation.select-box';

/** A size of **Sample**. */
export type DiagramSample = (typeof diagramSamples)[number];

/** What the page is drawn from. */
export interface DiagramState {
  readonly database: string;
  readonly sample: DiagramSample;
  readonly keysOnly: boolean;
  /** The references of the last good sample. */
  readonly graph?: ReferenceGraph;
  /** While `relation.read` runs: its progress. */
  readonly progress?: string;
  /** The server's message of the last sample that failed. */
  readonly error?: string;
  readonly moved: readonly MovedBox[];
  readonly selection?: DiagramSelection;
  readonly scale: number;
}

/** A control of the toolbars. */
export interface DiagramControl {
  readonly label: string;
  readonly hint: string;
  readonly enabled: boolean;
  readonly element?: 'relation.export-mermaid@toolbar' | 'relation.export-svg@toolbar';
}

/** What the page shows. */
export interface DiagramView {
  readonly count: string;
  readonly sample: {
    readonly label: string;
    readonly hint: string;
    readonly choices: readonly { readonly value: DiagramSample; readonly label: string; readonly chosen: boolean }[];
  };
  readonly keysOnly: { readonly label: string; readonly hint: string; readonly on: boolean };
  readonly controls: {
    readonly refresh: DiagramControl;
    readonly zoomOut: DiagramControl;
    readonly zoomIn: DiagramControl;
    readonly fit: DiagramControl;
    readonly resetLayout: DiagramControl;
    readonly copyMermaid: DiagramControl;
    readonly saveSvg: DiagramControl;
  };
  readonly error?: string;
  /** What is shown in place of the drawing: loading, or a database without collections. */
  readonly state?: string;
  readonly drawing?: DrawingView;
  readonly list?: {
    readonly title: string;
    readonly lines: readonly { readonly text: string; readonly selected: boolean }[];
    readonly empty?: string;
  };
}

/** The scale after **+**, **−** or the wheel, kept between 15% and 300%. */
export function zoomed(scale: number, factor: number): number {
  return Math.min(scaleBounds.most, Math.max(scaleBounds.least, scale * factor));
}

/** The scale of **Fit**: every box with a margin of 40 pixels, never above 100%. */
export function fitScale(drawn: { width: number; height: number }, page: { width: number; height: number }): number {
  if (drawn.width <= 0 || drawn.height <= 0) {
    return 1;
  }
  const fits = Math.min((page.width - 2 * fitMargin) / drawn.width, (page.height - 2 * fitMargin) / drawn.height);
  return Math.min(1, Math.max(scaleBounds.least, fits));
}

/** The count: `13 collections · 9 relations · 1 view · 100 documents sampled per collection`. */
export function countText(graph: ReferenceGraph): string {
  const views = graph.relations.filter((relation) => relation.kind === 'view').length;
  const parts = [
    text.diagram.collections(graph.collections.length),
    text.diagram.relations(graph.relations.length - views),
    ...(views > 0 ? [text.diagram.views(views)] : []),
    text.diagram.sampledPer(graph.sample),
  ];
  return parts.join(' · ');
}

function control(label: string, hint: string, enabled: boolean): DiagramControl {
  return { label, hint, enabled };
}

function controlsOf(state: DiagramState): DiagramView['controls'] {
  const reading = state.progress !== undefined;
  const drawable = (state.graph?.collections.length ?? 0) > 0;
  return {
    refresh: control(text.diagram.refresh, text.diagram.refreshHint, !reading),
    zoomOut: control(text.diagram.zoomOut, text.diagram.zoomOutHint, drawable && state.scale > scaleBounds.least),
    zoomIn: control(text.diagram.zoomIn, text.diagram.zoomInHint, drawable && state.scale < scaleBounds.most),
    fit: control(text.diagram.fit, text.diagram.fitHint, drawable),
    resetLayout: control(text.diagram.resetLayout, text.diagram.resetLayoutHint, drawable),
    copyMermaid: {
      ...control(text.diagram.copyMermaid, text.diagram.copyMermaidHint, drawable),
      element: 'relation.export-mermaid@toolbar',
    },
    saveSvg: {
      ...control(text.diagram.saveSvg, text.diagram.saveSvgHint, drawable),
      element: 'relation.export-svg@toolbar',
    },
  };
}

function listOf(state: DiagramState, graph: ReferenceGraph): NonNullable<DiagramView['list']> {
  const lines = graph.relations.map((relation, at) => ({
    text: relationText(relation),
    selected:
      state.selection?.kind === 'relation'
        ? state.selection.at === at
        : state.selection !== undefined &&
          (relation.from === state.selection.name || relation.to === state.selection.name),
  }));
  return {
    title: text.diagram.list(graph.relations.length),
    lines,
    ...(lines.length === 0 ? { empty: text.diagram.noRelations } : {}),
  };
}

/** Feature: relation.diagram — what the page shows. */
export function view(state: DiagramState): DiagramView {
  const { graph } = state;
  const base = {
    count: state.progress ?? (graph === undefined ? '' : countText(graph)),
    sample: {
      label: text.diagram.sample,
      hint: text.diagram.sampleHint,
      choices: diagramSamples.map((value) => ({ value, label: groupThousands(value), chosen: value === state.sample })),
    },
    keysOnly: { label: text.diagram.keysOnly, hint: text.diagram.keysOnlyHint, on: state.keysOnly },
    controls: controlsOf(state),
    ...(state.error === undefined ? {} : { error: state.error }),
  };
  if (graph === undefined) {
    return { ...base, state: state.progress === undefined ? text.diagram.loading : state.progress };
  }
  if (graph.collections.length === 0) {
    return { ...base, state: text.diagram.empty(state.database) };
  }
  const drawn = drawing(graph, {
    keysOnly: state.keysOnly,
    moved: state.moved,
    ...(state.selection === undefined ? {} : { selection: state.selection }),
  });
  return { ...base, drawing: drawn, list: listOf(state, graph) };
}

function placeOfStart(context: Context, args: Readonly<Record<string, unknown>>): DatabasePlace | undefined {
  const named = databasePlaceOf(context, args);
  if (named !== undefined) {
    return named;
  }
  const active = context.state.tabs.tabs.find((tab) => tab.id === context.state.tabs.active)?.shows;
  return active?.kind === 'collection' || (active?.kind === 'page' && active.database !== undefined)
    ? { connection: active.connection, database: active.database ?? '' }
    : undefined;
}

/** What the tab of the diagram of a database shows. */
export function diagramShows(place: DatabasePlace): TabShows {
  return {
    kind: 'page',
    connection: place.connection,
    page: diagramPage,
    title: text.diagram.title(place.database),
    database: place.database,
  };
}

/**
 * What the page itself starts: `{ tab, sample }`, the sample of its collections (when it opens, **Sample**,
 * **Refresh**); `{ choices }`, its options kept with the tab once they settle.
 */
function pagePlan(
  context: Context,
  place: DatabasePlace,
  args: Readonly<Record<string, unknown>>,
): Outcome | undefined {
  const nothing = { undo: { cannot: text.diagram.nothingWritten } };
  const size = diagramSamples.find((each) => each === args['sample']);
  if (typeof args['tab'] === 'string' && size !== undefined) {
    const sample: Json = { tab: args['tab'], connection: place.connection, database: place.database, size };
    const step = appStep(text.diagram.sampleStep(place.database, size), sampleAction, sample);
    return run({ ...appPlan(text.diagram.page, [step]), ...nothing });
  }
  const choices = args['choices'];
  if (typeof choices === 'object' && choices !== null) {
    const memory = { choices: diagramChoices(diagramOf(choices)) };
    return planOf(context.state, { shows: diagramShows(place), background: false, memory });
  }
  return undefined;
}

/**
 * Feature: relation.diagram — the tab of the database named by `args` (`{ connection, database, collection? }`), by
 * the target or by the active tab; with a collection, its box is selected and brought into view.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const place = placeOfStart(context, args);
  const connection = place === undefined ? undefined : savedConnection(context.state.connections, place.connection);
  if (place === undefined || connection?.engine !== 'mongodb') {
    return run(appPlan(text.diagram.page, []));
  }
  const page = pagePlan(context, place, args);
  if (page !== undefined) {
    return page;
  }
  const opened = planOf(context.state, { shows: diagramShows(place), background: false });
  const collection =
    typeof args['collection'] === 'string'
      ? args['collection']
      : context.target.kind === 'collection'
        ? context.target.collection
        : undefined;
  if (opened.kind !== 'run' || collection === undefined) {
    return opened;
  }
  const select: Json = { connection: place.connection, database: place.database, collection };
  const step = appStep(text.diagram.selectStep(collection, place.database), selectBoxAction, select);
  return run({ ...opened.plan, steps: [...opened.plan.steps, step] });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('relation.diagram'), plan };
