/**
 * Feature: saved-query.show
 *
 * The queries list: the saved and the recent queries of the collection, under the **Queries** button of the query bar
 * and of the pipeline editor, to run one again, save, rename, move or delete one. It is drawn from what
 * `saved-query.list` read; the main process reads it again while the list is open when the queries folder changes.
 */
import type { Json } from '../../shared/engine-request';
import { pipelineSummary, pipelineText } from '../aggregate/to-text';
import type { CollectionQueries } from './list';
import { text } from './text';
import { pinOfSaved, queryJson, savedRef, type QueryText, type RecentQuery, type SavedQuery } from './types';

/** **Queries**, in the query bar and in the toolbar of the pipeline editor, which opens the list. */
export const queriesButton = { label: text.commands.show, element: 'saved-query.show@query-bar' } as const;

/** What the list is drawn from. */
export interface ShowState {
  /** The collection: its connection, database and collection, as the controls send them. */
  readonly where: { readonly connection: string; readonly database: string; readonly collection: string };
  /** What `saved-query.list` read; absent while it is read. */
  readonly queries?: CollectionQueries;
  /** The text of the search field. */
  readonly search: string;
  /** The time, in milliseconds since 1970, for *5m ago*. */
  readonly now: number;
}

/** A control of the list: its text, the feature it starts, and what it is started with. */
export interface ControlView {
  readonly label: string;
  /** Its element identifier, written whole; absent for an entry whose card does not list this place yet. */
  readonly element?: string;
  readonly feature: string;
  readonly args: Json;
  /** What explains it, on hover. */
  readonly tooltip?: string;
}

/** The tag of a saved query: **Me** or **Folder**, with what explains it. */
export interface TagView {
  readonly label: string;
  /** The lines of its explanation. */
  readonly tooltip: readonly string[];
}

/** A saved query of the list. */
export interface SavedItemView {
  readonly name: string;
  readonly description?: string;
  /** The query on one line, and its whole text on hover. */
  readonly line: string;
  readonly hover: string;
  readonly tag: TagView;
  /** When it was saved, for a query for me. */
  readonly time?: string;
  readonly run: ControlView;
  /** The entries of its **…** menu, in order. */
  readonly menu: readonly ControlView[];
  readonly delete: ControlView;
}

/** A recent query of the list. */
export interface RecentItemView {
  readonly line: string;
  readonly hover: string;
  readonly time: string;
  readonly run: ControlView;
  readonly save: ControlView;
  readonly remove: ControlView;
}

/** The list as it is drawn. */
export interface QueriesListView {
  readonly search: { readonly label: string; readonly value: string };
  readonly saveCurrent: { readonly label: string; readonly element: 'saved-query.save@list' };
  readonly loading: boolean;
  /** *Queries you run on this collection appear here.* or *No queries match your search.* */
  readonly message?: string;
  /** **Saved**, absent when there is no saved query to show. */
  readonly saved?: { readonly title: string; readonly items: readonly SavedItemView[] };
  /** **Recent** with **Clear**, absent when there is no recent query to show. */
  readonly recent?: {
    readonly title: string;
    readonly clear: { readonly label: string; readonly element: 'saved-query.clear-recent@list' };
    readonly items: readonly RecentItemView[];
  };
}

function oneLine(source: string): string {
  return source.replace(/\s+/gu, ' ').trim();
}

/**
 * The query on one line: for a find, the filter with its line breaks and runs of spaces as one space (`{}` when it
 * is empty), then ` sort ` and the sort, ` project ` and the projection when they are not empty; for a pipeline,
 * `aggregate` and the names of its enabled stages joined by ` → `.
 */
export function queryLine(query: QueryText): string {
  if (query.kind === 'pipeline') {
    return query.stages.some((stage) => stage.enabled)
      ? `${text.show.aggregate} ${pipelineSummary(query.stages)}`
      : text.show.emptyPipeline;
  }
  const filter = oneLine(query.filter);
  const sort = oneLine(query.sort);
  const projection = oneLine(query.projection);
  return [
    filter === '' ? '{}' : filter,
    ...(sort === '' ? [] : [` ${text.show.sort} ${sort}`]),
    ...(projection === '' ? [] : [` ${text.show.project} ${projection}`]),
  ].join('');
}

/** The whole text of a query, shown on hover. */
export function queryHover(query: QueryText): string {
  if (query.kind === 'pipeline') {
    return pipelineText(query.stages);
  }
  return [
    query.filter.trim() === '' ? '' : `filter: ${query.filter}`,
    query.sort.trim() === '' ? '' : `sort: ${query.sort}`,
    query.projection.trim() === '' ? '' : `project: ${query.projection}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** *just now* under 60 seconds, then *5m ago*, *3h ago*, *2d ago*, and after 7 days the date, `2024-03-01`. */
export function timeText(at: number, now: number): string {
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 60) {
    return text.show.justNow;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return text.show.minutesAgo(minutes);
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return text.show.hoursAgo(hours);
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return text.show.daysAgo(days);
  }
  const date = new Date(at);
  return `${String(date.getFullYear())}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function queryTexts(query: QueryText): readonly string[] {
  return query.kind === 'find'
    ? [query.filter, query.sort, query.projection]
    : query.stages.flatMap((stage) => [stage.name, stage.body]);
}

/** Whether an item holds the text searched in its name, description, filter, sort, projection or pipeline. */
export function matchesSearch(
  item: { readonly query: QueryText; readonly name?: string; readonly description?: string },
  search: string,
): boolean {
  const wanted = search.trim().toLowerCase();
  const texts = [item.name ?? '', item.description ?? '', ...queryTexts(item.query)];
  return wanted === '' || texts.some((each) => each.toLowerCase().includes(wanted));
}

function tagOf(query: SavedQuery): TagView {
  if (query.place === 'me') {
    return { label: text.show.me, tooltip: [text.show.meTooltip] };
  }
  return {
    label: text.show.folder,
    tooltip: [
      text.show.folderTooltip(query.file),
      ...(query.connection === undefined ? [] : [text.show.onlyOn(query.connection)]),
    ],
  };
}

function menuOf(query: SavedQuery, args: { readonly [key: string]: Json }): readonly ControlView[] {
  const rename = {
    label: text.show.rename,
    element: 'saved-query.rename@item-menu',
    feature: 'saved-query.rename',
    args,
  };
  const remove = {
    label: text.show.delete,
    element: 'saved-query.delete@item-menu',
    feature: 'saved-query.delete',
    args,
  };
  const pin = {
    label: text.show.pin,
    feature: 'nav.pin',
    args: { action: 'pin', connection: args['connection'] ?? null, pin: pinOfSaved(query) as unknown as Json },
  };
  if (query.place === 'me') {
    const move = { label: text.show.moveToFolder, tooltip: text.move.toFolderDescription };
    return [rename, { ...move, element: 'saved-query.move@item-menu', feature: 'saved-query.move', args }, pin, remove];
  }
  const move = { label: text.show.moveToMine, tooltip: text.move.toMineDescription };
  const reveal = {
    label: text.show.revealFile,
    element: 'saved-query.reveal-file@item-menu',
    feature: 'saved-query.reveal-file',
    args,
  };
  return [
    rename,
    { ...move, element: 'saved-query.move@item-menu', feature: 'saved-query.move', args },
    reveal,
    pin,
    remove,
  ];
}

function savedItem(state: ShowState, query: SavedQuery): SavedItemView {
  const args = { ...state.where, saved: savedRef(query) };
  const run = { ...state.where, query: queryJson(query.query), name: query.name };
  return {
    name: query.name,
    ...(query.description === undefined ? {} : { description: query.description }),
    line: queryLine(query.query),
    hover: queryHover(query.query),
    tag: tagOf(query),
    ...(query.place === 'me' ? { time: timeText(query.at, state.now) } : {}),
    run: { label: query.name, element: 'saved-query.run@list', feature: 'saved-query.run', args: run },
    menu: menuOf(query, args),
    delete: { label: text.show.deleteSaved, element: 'saved-query.delete@list', feature: 'saved-query.delete', args },
  };
}

function recentItem(state: ShowState, recent: RecentQuery): RecentItemView {
  const args = { ...state.where, query: queryJson(recent.query) };
  const line = queryLine(recent.query);
  return {
    line,
    hover: queryHover(recent.query),
    time: timeText(recent.at, state.now),
    run: { label: line, element: 'saved-query.run@list', feature: 'saved-query.run', args },
    save: { label: text.show.saveWithName, element: 'saved-query.save@list', feature: 'saved-query.save', args },
    remove: {
      label: text.show.removeFromHistory,
      element: 'saved-query.remove-recent@list',
      feature: 'saved-query.remove-recent',
      args,
    },
  };
}

function messageOf(queries: CollectionQueries, shown: number): string | undefined {
  if (queries.saved.length === 0 && queries.recent.length === 0) {
    return text.show.empty;
  }
  return shown === 0 ? text.show.noMatch : undefined;
}

/** Feature: saved-query.show — the queries list, from the queries of the collection and the text searched. */
export function view(state: ShowState): QueriesListView {
  const top = {
    search: { label: text.show.search, value: state.search },
    saveCurrent: { label: text.show.saveCurrent, element: 'saved-query.save@list' as const },
  };
  if (state.queries === undefined) {
    return { ...top, loading: true };
  }
  const saved = state.queries.saved
    .filter((each) => matchesSearch(each, state.search))
    .map((each) => savedItem(state, each));
  const recent = state.queries.recent
    .filter((each) => matchesSearch(each, state.search))
    .map((each) => recentItem(state, each));
  const message = messageOf(state.queries, saved.length + recent.length);
  return {
    ...top,
    loading: false,
    ...(message === undefined ? {} : { message }),
    ...(saved.length === 0 ? {} : { saved: { title: text.show.saved, items: saved } }),
    ...(recent.length === 0
      ? {}
      : {
          recent: {
            title: text.show.recent,
            clear: { label: text.show.clear, element: 'saved-query.clear-recent@list' as const },
            items: recent,
          },
        }),
  };
}
