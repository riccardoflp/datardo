/**
 * Feature: structure.show
 *
 * The structure comparison page of two databases: the left database (the model) and the right one with its two
 * lists, the counts of what differs, the notes on what was not compared, the toolbar, and the differences grouped by
 * collection; the inspector island shows the selected difference. `view` says what the page shows from its state;
 * `plan` is what the tree's **Compare structure with…** and Go to start: the page tab on the database.
 */
import type { Answers, Context, OperationFeature, Outcome } from '../../shared/feature';
import { run } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import { appPlan, startArgs } from '../nav/types';
import { planOf } from '../tab/open';
import { text } from './text';
import { differenceKinds, type DifferenceKind, type StructureComparison, type StructureSide } from './types';
import { keepPlan } from './model/memory';
import { detailOf, groupsOf, isApplicable, type CollectionGroup, type DifferenceDetail } from './model/page';

/** The page's name in its tab. */
export const structurePage = 'structure';

/** The databases a structure comparison never offers on the right. */
const internalDatabases = ['admin', 'local', 'config'];

/** A MongoDB connection, as **Connection** lists it. */
export interface ConnectionChoice {
  readonly id: string;
  readonly name: string;
  readonly readOnly: boolean;
}

/** How far one side has read its collections. */
export interface SideProgress {
  readonly done: number;
  readonly total: number;
}

/** What the page is drawn from. */
export interface StructurePageState {
  readonly left: StructureSide;
  readonly right: { readonly connection?: string; readonly database?: string };
  /** The MongoDB connections, for **Connection**. */
  readonly connections: readonly ConnectionChoice[];
  /** The databases of the right connection, once listed. */
  readonly databases?: readonly string[];
  readonly comparing: boolean;
  readonly progress?: { readonly left?: SideProgress; readonly right?: SideProgress };
  /** The detail of the work in progress, when the page has it: *Reading the structures… left 3 of 12…*. */
  readonly progressText?: string;
  readonly result?: { readonly comparison: StructureComparison; readonly milliseconds: number };
  readonly error?: string;
  /** **All** is on: what is the same is listed too. */
  readonly showAll: boolean;
  readonly chip?: DifferenceKind;
  readonly folded: readonly string[];
  /** **Include drops in the script**. */
  readonly drops: boolean;
  readonly selected?: string;
  readonly swapping: boolean;
}

/** A control of the page: its label, its tooltip, whether it can be pressed. */
export interface PageControl {
  readonly label: string;
  readonly hint: string;
  readonly enabled: boolean;
  readonly element?: string;
}

/** What the page shows. */
export interface StructurePageView {
  readonly title: string;
  readonly left: { readonly label: string; readonly database: string; readonly connection: string };
  readonly swap: PageControl;
  readonly right: {
    readonly label: string;
    readonly connection: { readonly label: string; readonly hint: string; readonly value?: string };
    readonly connections: readonly { readonly id: string; readonly label: string; readonly notes: readonly string[] }[];
    readonly database: { readonly label: string; readonly value?: string };
    readonly databases: readonly string[];
    readonly readOnly?: { readonly label: string; readonly hint: string };
    readonly message?: string;
  };
  readonly explanation: string;
  readonly compare: PageControl;
  readonly chips?: readonly (PageControl & { readonly kind: DifferenceKind; readonly pressed: boolean })[];
  readonly summary?: string;
  readonly notes: readonly string[];
  readonly toolbar: {
    readonly onlyDifferences: PageControl & { readonly on: boolean };
    readonly all: PageControl & { readonly on: boolean };
    readonly includeDrops: PageControl & { readonly on: boolean };
    readonly copyScript: PageControl;
    readonly openInPlayground: PageControl;
    readonly applyAll: PageControl;
  };
  readonly progress?: string;
  readonly error?: string;
  /** The text shown in place of the list. */
  readonly empty?: string;
  readonly groups: readonly CollectionGroup[];
  readonly detail?: DifferenceDetail;
}

/** The tab's title: `Structure: shop`, or `Structure: shop ↔ shop2` when the right database has another name. */
export function structureTitle(left: string, right: string | undefined): string {
  return text.show.title(left, right);
}

/** The databases **Database** lists: without `admin`, `local`, `config` and the left one on its own connection. */
export function databaseChoices(
  left: StructureSide,
  connection: string,
  databases: readonly string[],
): readonly string[] {
  const offered = databases.filter(
    (name) => !internalDatabases.includes(name) && !(connection === left.connection && name === left.database),
  );
  const named = offered.filter((name) => name === left.database);
  return [...named, ...offered.filter((name) => name !== left.database).sort((a, b) => a.localeCompare(b))];
}

/** The connections **Connection** lists: the left's first, with *same connection* and *read-only*. */
function connectionChoices(state: StructurePageState): StructurePageView['right']['connections'] {
  const first = state.connections.filter((each) => each.id === state.left.connection);
  const others = state.connections.filter((each) => each.id !== state.left.connection);
  return [...first, ...others].map((each) => ({
    id: each.id,
    label: each.name,
    notes: [
      ...(each.id === state.left.connection ? [text.show.sameConnection] : []),
      ...(each.readOnly ? [text.show.readOnly] : []),
    ],
  }));
}

function nameOf(state: StructurePageState, connection: string | undefined): string {
  return state.connections.find((each) => each.id === connection)?.name ?? connection ?? '';
}

function readOnlyRight(state: StructurePageState): string | undefined {
  const right = state.connections.find((each) => each.id === state.right.connection);
  return right?.readOnly === true ? text.show.readOnlyHint(right.name) : undefined;
}

function rightPart(state: StructurePageState): StructurePageView['right'] {
  const connection = state.right.connection;
  const databases =
    connection === undefined || state.databases === undefined
      ? []
      : databaseChoices(state.left, connection, state.databases);
  const readOnly = readOnlyRight(state);
  const nothing = connection !== undefined && state.databases !== undefined && databases.length === 0;
  return {
    label: text.show.right,
    connection: {
      label: text.show.connection,
      hint: text.show.connectionHint,
      ...(connection === undefined ? {} : { value: connection }),
    },
    connections: connectionChoices(state),
    database: {
      label: text.show.database,
      ...(state.right.database === undefined ? {} : { value: state.right.database }),
    },
    databases,
    ...(readOnly === undefined ? {} : { readOnly: { label: text.show.readOnly, hint: readOnly } }),
    ...(nothing ? { message: text.show.noOtherDatabase(nameOf(state, connection)) } : {}),
  };
}

function secondsText(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function countsPart(state: StructurePageState): Pick<StructurePageView, 'chips' | 'summary' | 'notes'> {
  const result = state.result;
  if (result === undefined) {
    return { notes: [] };
  }
  const counts = result.comparison.counts;
  const chips = differenceKinds.map((kind) => ({
    kind,
    label: text.show.chips[kind](counts[kind]),
    hint: text.show.chipHints[kind],
    enabled: counts[kind] > 0,
    pressed: state.chip === kind,
  }));
  const differences = counts.different + counts['only-left'] + counts['only-right'];
  const seconds = secondsText(result.milliseconds);
  return {
    chips,
    summary: differences === 0 ? text.show.sameStructures(seconds) : text.show.differences(differences, seconds),
    notes: result.comparison.notes,
  };
}

function toolbarPart(state: StructurePageState): StructurePageView['toolbar'] {
  const showAll = state.showAll || state.chip === 'same';
  const hasResult = state.result !== undefined && !state.comparing;
  const blocked = readOnlyRight(state);
  const applicable = state.result?.comparison.differences.some(isApplicable) ?? false;
  const applyEnabled = hasResult && blocked === undefined && applicable;
  return {
    onlyDifferences: {
      label: text.show.onlyDifferences,
      hint: text.show.onlyDifferencesHint,
      enabled: true,
      on: !showAll,
    },
    all: { label: text.show.all, hint: text.show.allHint, enabled: true, on: showAll },
    includeDrops: { label: text.show.includeDrops, hint: text.show.includeDropsHint, enabled: true, on: state.drops },
    copyScript: {
      label: text.show.copyScript,
      hint: text.show.copyScriptHint,
      enabled: hasResult,
      element: 'structure.copy-script@toolbar',
    },
    openInPlayground: {
      label: text.show.openInPlayground,
      hint: text.show.openInPlaygroundHint,
      enabled: hasResult,
      element: 'structure.open-in-playground@toolbar',
    },
    applyAll: {
      label: text.show.applyAll,
      hint: blocked ?? text.show.applyAllHint,
      enabled: applyEnabled,
      element: 'structure.apply@toolbar',
    },
  };
}

function sideProgress(progress: SideProgress | undefined): string {
  return progress === undefined ? text.show.unknownProgress : text.show.progress(progress.done, progress.total);
}

function listPart(state: StructurePageState): Pick<StructurePageView, 'groups' | 'empty' | 'detail'> {
  const result = state.result;
  if (result === undefined) {
    return { groups: [] };
  }
  const blocked = readOnlyRight(state) ?? (state.comparing ? text.refusals.comparing : undefined);
  const differences = result.comparison.differences;
  const groups = groupsOf({
    differences,
    showAll: state.showAll || state.chip === 'same',
    ...(state.chip === undefined ? {} : { chip: state.chip }),
    folded: state.folded,
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(blocked === undefined ? {} : { applyBlocked: blocked }),
  });
  const empty = groups.length > 0 ? undefined : state.chip === undefined ? text.show.empty : text.show.nothingOfKind;
  const selected = differences.find((difference) => difference.id === state.selected);
  const database = state.right.database ?? '';
  const detail =
    selected === undefined
      ? undefined
      : detailOf(selected, {
          database,
          drops: state.drops,
          ...(blocked === undefined ? {} : { applyBlocked: blocked }),
        });
  return { groups, ...(empty === undefined ? {} : { empty }), ...(detail === undefined ? {} : { detail }) };
}

/** Feature: structure.show — what the page shows from its state. */
export function view(state: StructurePageState): StructurePageView {
  const progress = state.comparing
    ? state.swapping
      ? text.show.swapping
      : (state.progressText ??
        text.show.reading(sideProgress(state.progress?.left), sideProgress(state.progress?.right)))
    : undefined;
  const chosen = state.right.connection !== undefined && state.right.database !== undefined;
  return {
    title: structureTitle(state.left.database, state.right.database),
    left: { label: text.show.left, database: state.left.database, connection: nameOf(state, state.left.connection) },
    swap: { label: text.show.swap, hint: text.show.swapHint, enabled: chosen && !state.comparing },
    right: rightPart(state),
    explanation: text.show.explanation,
    compare: { label: text.show.compare, hint: text.show.compareHint, enabled: chosen && !state.comparing },
    ...countsPart(state),
    toolbar: toolbarPart(state),
    ...(progress === undefined ? {} : { progress }),
    ...(state.error === undefined ? {} : { error: state.error }),
    ...listPart(state),
  };
}

/** The database the page is opened on: the target's, the tree node's (`{ connection, database }`), or the active tab's. */
function databaseOf(
  context: Context,
  args: Readonly<Record<string, unknown>>,
): { readonly connection: ConnectionId; readonly database: string } | undefined {
  const target = context.target;
  if (target.kind === 'database' || target.kind === 'collection') {
    return { connection: target.connection, database: target.database };
  }
  const [connection, database] = [args['connection'], args['database']];
  if (typeof connection === 'string' && typeof database === 'string' && database !== '') {
    return { connection: connectionId(connection), database };
  }
  const shows = activeTabOf(context.state.tabs)?.shows;
  if (shows?.kind === 'collection' || (shows?.kind === 'page' && shows.database !== undefined)) {
    return { connection: shows.connection, database: shows.database ?? '' };
  }
  return undefined;
}

/**
 * Feature: structure.show — **Compare structure with…**: the page tab of the database, on the left. The page starts
 * it with `{ keep }` to keep its sides and choices with its tab (`./model/memory.ts`).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  if ('keep' in args) {
    return keepPlan(context, args['keep']);
  }
  const where = databaseOf(context, args);
  const saved = context.state.connections.saved.find((each) => each.id === where?.connection);
  if (where === undefined || saved?.engine !== 'mongodb') {
    return run(appPlan(text.show.openPlan, []));
  }
  return planOf(context.state, {
    shows: {
      kind: 'page',
      connection: where.connection,
      page: structurePage,
      title: structureTitle(where.database, undefined),
      database: where.database,
    },
    background: false,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('structure.show'), plan };
