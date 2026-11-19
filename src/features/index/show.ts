/**
 * Feature: index.show
 *
 * The Indexes section of a collection tab: the indexes of the collection, then its search indexes, and everything that
 * changes them. `view` says what the section shows from its state, including how often it reads the lists again;
 * `plan` is what Go to starts: the active collection tab shows its Indexes section.
 */
import { mongoshValue } from '../../shared/mongosh-value';
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { activeTabOf } from '../../shared/state/tabs';
import { groupThousands } from '../../shared/text-units';
import { editableDefinition } from './change-plan';
import { idIndex } from './hide';
import { agoText, badges, bytesText, dateText, type Badge } from './properties';
import { isSearchType } from './create-search';
import { definitionType } from './search-checks';
import { searchSummary } from './search-summary';
import { text } from './text';
import type { IndexInfo, IndexList, SearchIndexInfo, SearchIndexList } from './types';

/** The section's tab name, as `tab.activate` takes it. */
export const indexSection = 'indexes';

/** How often the indexes are read again while a change runs or an index is built. */
export const buildPollMs = 1000;

/** How often the search indexes are read again while one is built or dropped, and after a change. */
export const searchPollMs = 5000;

/** How long after a change to a search index its list keeps being read again. */
export const searchSettleMs = 30_000;

const hourMs = 3_600_000;
const dayMs = 86_400_000;

/** A column the table of indexes sorts by. */
export type SortColumn = 'name' | 'size' | 'usage';

/** The order of the table: absent for the server's. */
export interface IndexSort {
  readonly column: SortColumn;
  readonly descending: boolean;
}

/** What the section is drawn from. */
export interface IndexSectionState {
  readonly collection: string;
  readonly readOnly: boolean;
  /** The time, in milliseconds since 1970. */
  readonly now: number;
  /** Whether the section is the one shown and the window is visible: nothing is read otherwise. */
  readonly shown: boolean;
  readonly indexes?:
    { readonly kind: 'list'; readonly list: IndexList } | { readonly kind: 'error'; readonly message: string };
  readonly searchIndexes?: SearchIndexList;
  readonly loading: boolean;
  /** Whether a change to an index is running. */
  readonly changing: boolean;
  /** When a search index was last changed from here. */
  readonly searchChangedAt?: number;
  readonly sort?: IndexSort;
  readonly selected?: { readonly kind: 'index' | 'search'; readonly name: string };
}

/** An action of the menu of a row. */
export interface RowAction {
  readonly label: string;
  readonly tooltip?: string;
  readonly element:
    | 'index.edit@row-menu'
    | 'index.duplicate@row-menu'
    | 'index.hide@row-menu'
    | 'index.drop@row-menu'
    | 'index.edit-search@row-menu'
    | 'index.drop-search@row-menu';
}

/** A row of the table of indexes. */
export interface IndexRow {
  readonly name: string;
  readonly keys: string;
  readonly badges: readonly Badge[];
  readonly size?: { readonly text: string; readonly width: number; readonly tooltip: string };
  readonly usage?: { readonly text: string; readonly tooltip?: string };
  readonly neverUsed: boolean;
  readonly dimmed: boolean;
  readonly selected: boolean;
  readonly menu: readonly RowAction[];
  readonly enter?: 'index.edit@table';
  readonly delete?: 'index.drop@table';
}

/** A badge of a search index's status, with its tone. */
export interface StatusBadge {
  readonly label: string;
  readonly tone: 'good' | 'busy' | 'bad' | 'muted';
  readonly tooltip: string;
}

/** A row of the table of search indexes. */
export interface SearchRow {
  readonly name: string;
  readonly type: string;
  readonly status: readonly StatusBadge[];
  readonly queryable: { readonly label: string; readonly tooltip: string };
  readonly definition: string;
  readonly selected: boolean;
  readonly menu: readonly RowAction[];
  readonly enter?: 'index.edit-search@table';
  readonly delete?: 'index.drop-search@table';
}

/** What the Indexes section shows. */
export interface IndexSectionView {
  readonly create?: { readonly label: string; readonly element: 'index.create@toolbar' };
  readonly refresh: { readonly label: string; readonly tooltip: string };
  readonly summary: string;
  readonly columns: typeof text.show.columns;
  readonly rows: readonly IndexRow[];
  readonly error?: string;
  readonly search: {
    readonly heading: string;
    readonly create?: {
      readonly label: string;
      readonly enabled: boolean;
      readonly tooltip?: string;
      readonly element: 'index.create-search@toolbar';
    };
    readonly refresh: { readonly label: string; readonly tooltip: string };
    readonly summary: string;
    readonly rows: readonly SearchRow[];
    /** On a server without search: the explanation and the server's own words. */
    readonly explanation?: { readonly text: string; readonly message: string };
    readonly error?: string;
  };
  readonly loading: boolean;
  /** How often each list is read again, in milliseconds; absent when it is not. */
  readonly polling: { readonly indexes?: number; readonly search?: number };
  readonly statusLine?: string;
}

/** Feature: index.show — the next order after a click on a column: first way, reversed, then the server's. */
export function nextSort(sort: IndexSort | undefined, column: SortColumn): IndexSort | undefined {
  const first = column !== 'name';
  if (sort?.column !== column) {
    return { column, descending: first };
  }
  return sort.descending === first ? { column, descending: !first } : undefined;
}

/** The indexes in the order of the table. */
export function sortedIndexes(indexes: readonly IndexInfo[], sort: IndexSort | undefined): readonly IndexInfo[] {
  if (sort === undefined) {
    return indexes;
  }
  const value = (index: IndexInfo): number => (sort.column === 'size' ? (index.size ?? -1) : (index.uses ?? -1));
  const sorted = [...indexes].sort((a, b) =>
    sort.column === 'name' ? a.name.localeCompare(b.name) : value(a) - value(b),
  );
  return sort.descending ? sorted.reverse() : sorted;
}

/** Feature: index.show — the rate of use per day: `≈ 86/day`, `< 1/day`, nothing under an hour or without uses. */
export function usageRate(uses: number, since: number | undefined, now: number): string | undefined {
  if (since === undefined || uses <= 0 || now - since < hourMs) {
    return undefined;
  }
  const rate = uses / Math.max(1, (now - since) / dayMs);
  return rate < 1 ? text.show.underOnePerDay : text.show.perDay(groupThousands(Math.round(rate)));
}

function isNeverUsed(index: IndexInfo): boolean {
  return index.uses === 0 && index.name !== idIndex;
}

/** The summary of the toolbar: `4 indexes · 1.2 MB on disk · 1,204 documents · 2 never used · usage counted since 3d ago`. */
export function indexSummary(list: IndexList, now: number): string {
  const { indexes, totals } = list;
  const never = indexes.filter(isNeverUsed).length;
  const starts = indexes.flatMap((index) => (index.since === undefined ? [] : [index.since]));
  return [
    text.show.indexes(indexes.length),
    ...(totals.indexSize === undefined ? [] : [text.show.onDisk(bytesText(totals.indexSize))]),
    ...(totals.documents === undefined ? [] : [text.show.documents(totals.documents)]),
    ...(never > 0 ? [text.show.neverUsed(never)] : []),
    ...(starts.length > 0 ? [text.show.countedSince(agoText(now - Math.max(...starts)))] : []),
  ].join(' · ');
}

function rowMenu(index: IndexInfo, readOnly: boolean): readonly RowAction[] {
  if (readOnly || index.name === idIndex) {
    return [];
  }
  const { menu } = text.show;
  return [
    { label: menu.edit, tooltip: text.show.editHint, element: 'index.edit@row-menu' },
    { label: menu.duplicate, tooltip: text.show.duplicateHint, element: 'index.duplicate@row-menu' },
    { label: index.options['hidden'] === true ? menu.unhide : menu.hide, element: 'index.hide@row-menu' },
    { label: menu.drop, element: 'index.drop@row-menu' },
  ];
}

function sizeOf(index: IndexInfo, list: IndexList): IndexRow['size'] {
  if (index.size === undefined) {
    return undefined;
  }
  const largest = Math.max(...list.indexes.map((each) => each.size ?? 0));
  const total = list.totals.indexSize ?? list.indexes.reduce((sum, each) => sum + (each.size ?? 0), 0);
  return {
    text: bytesText(index.size),
    width: Math.max(2, largest > 0 ? Math.round((index.size / largest) * 100) : 0),
    tooltip: text.show.sizeShare(total > 0 ? Math.round((index.size / total) * 100) : 0),
  };
}

function usageOf(index: IndexInfo, now: number): IndexRow['usage'] {
  if (index.uses === undefined) {
    return undefined;
  }
  const rate = usageRate(index.uses, index.since, now);
  const since = index.since;
  return {
    text: rate === undefined ? text.show.uses(index.uses) : `${text.show.uses(index.uses)} ${rate}`,
    ...(since === undefined ? {} : { tooltip: text.show.countedSinceHint(dateText(since), agoText(now - since)) }),
  };
}

/** Feature: index.show — a row of the table of indexes. */
export function indexRow(state: IndexSectionState, list: IndexList, index: IndexInfo): IndexRow {
  const menu = rowMenu(index, state.readOnly);
  const size = sizeOf(index, list);
  const usage = usageOf(index, state.now);
  return {
    name: index.name,
    keys: mongoshValue(editableDefinition(index.name, index.key, index.options).keys),
    badges: badges(index),
    ...(size === undefined ? {} : { size }),
    ...(usage === undefined ? {} : { usage }),
    neverUsed: isNeverUsed(index),
    dimmed: index.options['hidden'] === true,
    selected: state.selected?.kind === 'index' && state.selected.name === index.name,
    menu,
    ...(menu.length > 0 ? { enter: 'index.edit@table', delete: 'index.drop@table' } : {}),
  };
}

const tones: Readonly<Record<string, StatusBadge['tone']>> = {
  READY: 'good',
  PENDING: 'busy',
  BUILDING: 'busy',
  DELETING: 'busy',
  FAILED: 'bad',
  STALE: 'bad',
  DOES_NOT_EXIST: 'bad',
};

/** The status of a definition being built beside the current one, as a host reports it. */
export function stagedStatus(index: SearchIndexInfo): string | undefined {
  return index.hosts?.find((host) => host.staged !== undefined)?.staged;
}

/** Feature: index.show — the badges of the status of a search index, with the new definition's when there is one. */
export function statusBadges(index: SearchIndexInfo): readonly StatusBadge[] {
  const status = index.status ?? '';
  const hint = text.show.statusHints[status] ?? '';
  const message = index.message === undefined || index.message === '' ? '' : `\n${index.message}`;
  const staged = stagedStatus(index);
  return [
    { label: status, tone: tones[status] ?? 'muted', tooltip: `${hint}${message}` },
    ...(staged === undefined
      ? []
      : [{ label: text.show.staged(staged), tone: tones[staged] ?? 'muted', tooltip: text.show.stagedHint }]),
  ];
}

function searchRow(state: IndexSectionState, index: SearchIndexInfo): SearchRow {
  const type = isSearchType(index.type) ? index.type : (definitionType(index.definition) ?? 'search');
  const actions = state.readOnly || index.status === 'DELETING';
  const menu: readonly RowAction[] = actions
    ? []
    : [
        { label: text.show.menu.edit, tooltip: text.show.editSearchHint, element: 'index.edit-search@row-menu' },
        { label: text.show.menu.drop, element: 'index.drop-search@row-menu' },
      ];
  return {
    name: index.name,
    type: text.search.typeNames[type],
    status: statusBadges(index),
    queryable:
      index.queryable === true
        ? { label: text.show.queryable, tooltip: text.show.queryableHint }
        : { label: text.show.notQueryable, tooltip: text.show.notQueryableHint },
    definition: searchSummary(type, index.definition).join(' · '),
    selected: state.selected?.kind === 'search' && state.selected.name === index.name,
    menu,
    ...(menu.length > 0 ? { enter: 'index.edit-search@table', delete: 'index.drop-search@table' } : {}),
  };
}

const busyStatuses = new Set(['PENDING', 'BUILDING']);
const brokenStatuses = new Set(['FAILED', 'STALE', 'DOES_NOT_EXIST']);

/** The summary of the search indexes: `2 search indexes · 1 being built · 1 not working`. */
export function searchIndexSummary(indexes: readonly SearchIndexInfo[]): string {
  if (indexes.length === 0) {
    return text.show.noSearchIndexes;
  }
  const building = indexes.filter((index) => busyStatuses.has(index.status ?? '')).length;
  const broken = indexes.filter((index) => brokenStatuses.has(index.status ?? '')).length;
  return [
    text.show.searchIndexes(indexes.length),
    ...(building > 0 ? [text.show.beingBuilt(building)] : []),
    ...(broken > 0 ? [text.show.notWorking(broken)] : []),
  ].join(' · ');
}

/** Feature: index.show — how often each list is read again: only while the section is shown. */
export function polling(state: IndexSectionState): IndexSectionView['polling'] {
  if (!state.shown) {
    return {};
  }
  const list = state.indexes?.kind === 'list' ? state.indexes.list : undefined;
  const building = state.changing || (list?.indexes.some((index) => index.building) ?? false);
  const search = state.searchIndexes?.kind === 'indexes' ? state.searchIndexes.indexes : [];
  const moving = search.some(
    (index) => ['PENDING', 'BUILDING', 'DELETING'].includes(index.status ?? '') || stagedStatus(index) !== undefined,
  );
  const settling = state.searchChangedAt !== undefined && state.now - state.searchChangedAt < searchSettleMs;
  const searchable = state.searchIndexes?.kind !== 'unsupported';
  return {
    ...(building ? { indexes: buildPollMs } : {}),
    ...(searchable && (moving || settling) ? { search: searchPollMs } : {}),
  };
}

function searchPart(state: IndexSectionState): IndexSectionView['search'] {
  const list = state.searchIndexes;
  const unsupported = list?.kind === 'unsupported';
  const indexes = list?.kind === 'indexes' ? list.indexes : [];
  return {
    heading: text.show.searchHeading,
    ...(state.readOnly
      ? {}
      : {
          create: {
            label: text.show.createSearch,
            enabled: !unsupported,
            ...(unsupported ? { tooltip: text.search.unsupportedHelp } : {}),
            element: 'index.create-search@toolbar',
          },
        }),
    refresh: { label: text.show.refresh, tooltip: text.show.refreshSearchHint },
    summary: list?.kind === 'indexes' ? searchIndexSummary(indexes) : '',
    rows: indexes.map((index) => searchRow(state, index)),
    ...(unsupported ? { explanation: { text: text.search.unsupportedHelp, message: list.message } } : {}),
    ...(list?.kind === 'error' ? { error: list.message } : {}),
  };
}

/** Feature: index.show — what the Indexes section shows. */
export function view(state: IndexSectionState): IndexSectionView {
  const list = state.indexes?.kind === 'list' ? state.indexes.list : undefined;
  return {
    ...(state.readOnly ? {} : { create: { label: text.commands.create, element: 'index.create@toolbar' } }),
    refresh: { label: text.show.refresh, tooltip: text.show.refreshHint },
    summary: list === undefined ? '' : indexSummary(list, state.now),
    columns: text.show.columns,
    rows:
      list === undefined ? [] : sortedIndexes(list.indexes, state.sort).map((index) => indexRow(state, list, index)),
    ...(state.indexes?.kind === 'error' ? { error: state.indexes.message } : {}),
    search: searchPart(state),
    loading: state.loading,
    polling: polling(state),
    ...(state.readOnly ? { statusLine: text.show.readOnly } : {}),
  };
}

/** Feature: index.show — Go to's **Indexes**: the active collection tab shows its Indexes section. */
export function plan(context: Context, _answers: Answers): Outcome {
  const tab = activeTabOf(context.state.tabs);
  const empty = { danger: noDanger, undo: { cannot: text.nothingRecorded }, publishes: false, after: [] };
  if (tab?.shows.kind !== 'collection' || tab.shows.view === true) {
    return run({ title: text.section, steps: [], ...empty });
  }
  const { collection } = tab.shows;
  return run({
    title: text.show.plan(collection),
    steps: [
      {
        kind: 'app',
        text: text.show.step(collection),
        action: 'tab.activate',
        args: { tab: tab.id, section: indexSection },
      },
    ],
    ...empty,
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.show'), plan };
