/**
 * Feature: compare.show
 *
 * The comparison page of two collections: the left and the right side, the options, the counts of what was found and
 * the list of the differences, with the difference of the selected row in the inspector island. `view` says what the
 * page shows from its state; `plan` is what **Compare with…** and Go to start: the page tab with the collection on the
 * left. The page reads with `compare.read` and then `compare.read-details`, and writes with `compare.copy-document`
 * and `compare.make-like`.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import { run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import { appPlan, startArgs } from '../nav/types';
import { planOf } from '../tab/open';
import {
  collectionChoices,
  connectionChoices,
  databaseChoices,
  nothingToCompare,
  type CollectionChoice,
  type ConnectionChoice,
} from './page/choices';
import { inspectorView, type InspectorView } from './page/inspector';
import { keepPlan } from './page/keep';
import {
  bulkButtons,
  chips,
  emptyText,
  rows,
  shownLine,
  summaryText,
  whyText,
  type ChipView,
  type RowView,
  type ShownResult,
  type WriteButton,
} from './page/rows';
import type { SelectedDocument } from './read-details';
import { text } from './text';
import { idKey, type ComparisonOptions, type DifferenceKind, type SideInfo, type SideRef } from './types';

/** The page's name in a tab. */
export const comparePage = 'compare';

/** The right side as it is being chosen: the lists read so far and what each has chosen. */
export interface RightChoosing {
  readonly saved: readonly ConnectionView[];
  readonly connection?: ConnectionId;
  readonly databases?: readonly string[];
  readonly database?: string;
  readonly collections?: readonly CollectionChoice[];
  readonly collection?: string;
  /** *Could not connect to Production: …* */
  readonly error?: string;
}

/** What the page is drawn from. */
export interface ComparePageState {
  readonly left: SideInfo;
  readonly right?: SideInfo;
  readonly choosing: RightChoosing;
  readonly options: ComparisonOptions;
  /** The text of `runner.progress` while a comparison runs. */
  readonly progress?: string;
  readonly result?: ShownResult;
  /** A filter that is not valid, the bound, or the server's message. */
  readonly error?: string;
  /** *Comparison cancelled.*, *Swapping the sides…* */
  readonly message?: string;
  readonly chip?: DifferenceKind;
  readonly selected?: {
    readonly id: Json;
    readonly read?: SelectedDocument | { readonly kind: 'error'; readonly message: string };
  };
}

/** A side as the head of the page shows it. */
export interface SideView {
  readonly label: string;
  readonly namespace: string;
  readonly connectionName: string;
  readonly badge?: { readonly text: string; readonly hint: string };
}

/** A list of the right side. */
export interface ListView<T> {
  readonly label: string;
  readonly choices: readonly T[];
  readonly chosen?: string;
}

/** What the comparison page shows. */
export interface ComparePageView {
  readonly title: string;
  readonly left: SideView;
  readonly swap: { readonly label: string; readonly hint: string; readonly enabled: boolean };
  readonly right: {
    readonly side?: SideView;
    readonly connection: ListView<ConnectionChoice>;
    readonly database?: ListView<string>;
    readonly collection?: ListView<CollectionChoice>;
    readonly empty?: string;
  };
  readonly options: {
    readonly enabled: boolean;
    readonly filter: { readonly label: string; readonly value: string; readonly placeholder: string };
    readonly ignore: {
      readonly label: string;
      readonly value: string;
      readonly placeholder: string;
      readonly hint: string;
    };
    readonly ignoreOrder: { readonly label: string; readonly checked: boolean; readonly hint: string };
    readonly numbersByValue: { readonly label: string; readonly checked: boolean; readonly hint: string };
  };
  readonly compare: { readonly label: string; readonly hint?: string; readonly enabled: boolean };
  readonly progress?: string;
  readonly message?: string;
  readonly error?: string;
  readonly counts?: { readonly chips: readonly ChipView[]; readonly summary: string };
  readonly bulk: readonly (WriteButton & { readonly element: 'compare.make-like@toolbar' })[];
  readonly shown?: string;
  readonly rows: readonly RowView[];
  readonly empty?: string;
  readonly inspector?: InspectorView;
}

/** The tab's title: `Compare: orders`, or `Compare: orders ↔ orders2` when the right collection has another name. */
export function tabTitle(left: SideRef, right: SideRef | undefined): string {
  return text.title(left.collection, right?.collection);
}

function sideView(label: string, side: SideInfo): SideView {
  const why = whyText(side);
  return {
    label,
    namespace: `${side.database}.${side.collection}`,
    connectionName: side.connectionName,
    ...(why === undefined ? {} : { badge: { text: text.sides.readOnly, hint: why } }),
  };
}

function chosenOf(value: string | undefined): { readonly chosen?: string } {
  return value === undefined ? {} : { chosen: value };
}

function rightView(state: ComparePageState): ComparePageView['right'] {
  const { choosing, left } = state;
  const connection = {
    label: text.sides.connection,
    choices: connectionChoices(choosing.saved, left),
    ...chosenOf(choosing.connection),
  };
  const databases = choosing.databases === undefined ? undefined : databaseChoices(choosing.databases, left);
  const collections =
    choosing.collections === undefined || choosing.connection === undefined || choosing.database === undefined
      ? undefined
      : collectionChoices(choosing.collections, left, { connection: choosing.connection, database: choosing.database });
  const name = choosing.saved.find((each) => each.id === choosing.connection)?.name ?? '';
  return {
    ...(state.right === undefined ? {} : { side: sideView(text.sides.right, state.right) }),
    connection,
    ...(databases === undefined
      ? {}
      : { database: { label: text.sides.database, choices: databases, ...chosenOf(choosing.database) } }),
    ...(collections === undefined
      ? {}
      : { collection: { label: text.sides.collection, choices: collections, ...chosenOf(choosing.collection) } }),
    ...(collections?.length === 0 && choosing.database !== undefined
      ? { empty: nothingToCompare(name, choosing.database) }
      : {}),
  };
}

function optionsView(state: ComparePageState, running: boolean): ComparePageView['options'] {
  const { options } = state;
  return {
    enabled: state.right !== undefined && !running,
    filter: { label: text.options.filter, value: options.filter, placeholder: text.options.filterPlaceholder },
    ignore: {
      label: text.options.ignore,
      value: options.ignore,
      placeholder: text.options.ignorePlaceholder,
      hint: text.options.ignoreHint,
    },
    ignoreOrder: { label: text.options.ignoreOrder, checked: options.ignoreOrder, hint: text.options.ignoreOrderHint },
    numbersByValue: {
      label: text.options.numbersByValue,
      checked: options.numbersByValue,
      hint: text.options.numbersByValueHint,
    },
  };
}

function resultParts(state: ComparePageState, right: SideInfo, running: boolean): Partial<ComparePageView> {
  const { result } = state;
  if (result === undefined) {
    return {};
  }
  const sides = { left: state.left, right };
  const shown = shownLine(result);
  const empty = emptyText(result, state.chip);
  const entry =
    state.selected === undefined
      ? undefined
      : result.entries.find((each) => idKey(each.id) === idKey(state.selected?.id ?? null));
  return {
    counts: { chips: chips(result.counts, state.chip), summary: summaryText(result) },
    bulk: bulkButtons(result.counts, sides, running).map((each) => ({
      ...each,
      element: 'compare.make-like@toolbar' as const,
    })),
    rows: rows(result, sides, state.chip, running),
    ...(shown === undefined ? {} : { shown }),
    ...(empty === undefined ? {} : { empty }),
    ...(entry === undefined ? {} : { inspector: inspectorView(entry, state.selected?.read) }),
  };
}

function lines(state: ComparePageState): Partial<ComparePageView> {
  return {
    ...(state.progress === undefined ? {} : { progress: state.progress }),
    ...(state.message === undefined ? {} : { message: state.message }),
    ...(state.error === undefined ? {} : { error: state.error }),
  };
}

/** Feature: compare.show — what the page shows, in its states: no right side yet, loading, empty, error, read-only. */
export function view(state: ComparePageState): ComparePageView {
  const running = state.progress !== undefined;
  const compare = running
    ? { label: text.options.cancel, enabled: true }
    : { label: text.options.compare, hint: text.options.compareHint, enabled: state.right !== undefined };
  return {
    title: tabTitle(state.left, state.right),
    left: sideView(text.sides.left, state.left),
    swap: { label: text.sides.swap, hint: text.sides.swapHint, enabled: state.right !== undefined && !running },
    right: rightView(state),
    options: optionsView(state, running),
    compare,
    ...lines(state),
    bulk: [],
    rows: [],
    ...(state.right === undefined ? {} : resultParts(state, state.right, running)),
  };
}

/** The tab of the comparison of a collection, before its right side is chosen. */
export function pageShows(left: SideRef): TabShows {
  return {
    kind: 'page',
    connection: left.connection,
    page: comparePage,
    title: tabTitle(left, undefined),
    database: left.database,
    of: [`${left.database}.${left.collection}`],
  };
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The collection of the node of the tree **Compare with…** was chosen on: `{ connection, database, collection }`. */
function leftOfArgs(args: Readonly<Record<string, unknown>>): SideRef | undefined {
  const [connection, database, collection] = [args['connection'], args['database'], args['collection']].map(textOf);
  return connection === undefined || database === undefined || collection === undefined
    ? undefined
    : { connection: connectionId(connection), database, collection, view: args['view'] === true };
}

/** The collection the page compares: the node of the tree it was started on, or the collection of the active tab. */
function leftOf(context: Context, answers: Answers): SideRef | undefined {
  const { target } = context;
  if (target.kind === 'collection') {
    return { connection: target.connection, database: target.database, collection: target.collection, view: false };
  }
  const fromTree = leftOfArgs(startArgs(answers));
  if (fromTree !== undefined) {
    return fromTree;
  }
  const shows = activeTabOf(context.state.tabs)?.shows;
  return shows?.kind === 'collection'
    ? {
        connection: shows.connection,
        database: shows.database,
        collection: shows.collection,
        view: shows.view === true,
      }
    : undefined;
}

/**
 * Feature: compare.show — **Compare with…**: the page tab with the collection on the left; nothing without one. The
 * page starts it with `{ keep }` to keep its sides and options with its tab (`./page/keep.ts`).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if ('keep' in args) {
    return keepPlan(context, args['keep']);
  }
  const left = leftOf(context, answers);
  const saved =
    left === undefined ? undefined : context.state.connections.saved.find((each) => each.id === left.connection);
  if (left === undefined || saved?.engine !== 'mongodb') {
    return run(appPlan(text.openPlan, []));
  }
  return planOf(context.state, { shows: pageShows(left), background: false });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('compare.show'), plan };
