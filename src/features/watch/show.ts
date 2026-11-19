/**
 * Feature: watch.show
 *
 * The Watch changes page: the change events of a collection, a database or the whole deployment as they arrive,
 * newest first. `view` says what the page shows from its state (`page/state.ts`); `plan` is what **Watch changes**
 * and Go to start: it opens the page in a page tab of the connection's group, one for each thing watched, connecting
 * the connection first when it is not connected. The stream opens by itself when the page opens (`watch.stream`).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { run, type After, type Answers, type Context, type Outcome, type ReadFeature } from '../../shared/feature';
import { connectionId, featureId, type ConnectionId } from '../../shared/ids';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { activeTabOf, type TabShows } from '../../shared/state/tabs';
import { localClock, localDateTime } from '../history/time/time-text';
import { isRecord, objectOf } from '../history/types';
import type { WatchPage } from './page/state';
import { pauseLabel, isOffered as pauseOffered } from './pause';
import { isOffered as resumeOffered } from './resume';
import { stopButton } from './stop';
import { asksBefore } from './stream';
import { controlText, copyText, exportText, preImagesText, showText } from './text';
import { eventCategories, watchedPlace, type EventCategory, type Watched, type WatchEvent } from './types';
import { visibleEvents } from './visible-events';

/** The page of a Watch changes tab. */
export const watchPage = 'watch';

/** A control of the page: its text, its identifier with its place, the feature it starts. */
export interface PageControl {
  readonly label: string;
  readonly element: string;
  readonly feature: string;
  readonly args?: Json;
  readonly tooltip?: string;
  readonly disabled?: boolean;
}

/** A type toggle: its type, its text with the count, whether it shows its change events. */
export interface TypeToggle {
  readonly type: EventCategory;
  readonly label: string;
  readonly count: number;
  readonly on: boolean;
  readonly tooltip: string;
  readonly element: string;
}

/** One line of the list. */
export interface EventRow {
  readonly number: number;
  readonly time: string;
  readonly timeTip: string;
  readonly type: string;
  /** Only when a database or the deployment is watched. */
  readonly collection?: string;
  readonly id: string;
  readonly changes: string;
  readonly selected: boolean;
}

/** What the page shows in place of the list, or the list. */
export type WatchBody =
  | { readonly kind: 'note'; readonly text: string }
  | { readonly kind: 'list'; readonly columns: readonly string[]; readonly rows: readonly EventRow[] };

/** What the page shows, from the top. */
export interface WatchPageView {
  readonly toolbar: {
    readonly watched: string;
    readonly state: string;
    readonly controls: readonly PageControl[];
  };
  readonly filters: {
    readonly types: readonly TypeToggle[];
    readonly search: { readonly placeholder: string; readonly value: string; readonly element: string };
    readonly filter: {
      readonly label: string;
      readonly tooltip: string;
      readonly placeholder: string;
      readonly value: string;
      readonly element: string;
    };
    readonly fullDocument: {
      readonly label: string;
      readonly tooltip: string;
      readonly checked: boolean;
      readonly element: string;
    };
    readonly preImages?: { readonly text: string; readonly tooltip: string; readonly enable?: PageControl };
  };
  readonly count: string;
  readonly message?: string;
  readonly body: WatchBody;
  /** The context menu of a line, and `Ctrl+C` on the selected one. */
  readonly lineMenu: readonly PageControl[];
  readonly selected?: number;
}

/** What the page is drawn from. */
export interface WatchShowInput {
  readonly page: WatchPage;
  readonly connectionName: string;
  readonly readOnly: boolean;
  /** The version of the server, when known. */
  readonly serverVersion?: string;
  readonly offsetMinutes: number;
}

/** The state of the stream: **Starting…**, **Watching**, **Stopped**, **Paused**, **Paused · `<n>` new**. */
export function stateText(page: WatchPage): string {
  if (page.paused) {
    return page.held.length === 0 ? showText.states.paused : showText.states.pausedNew(page.held.length);
  }
  return page.status === 'starting'
    ? showText.states.starting
    : page.status === 'watching'
      ? showText.states.watching
      : showText.states.stopped;
}

function controlsOf(page: WatchPage): readonly PageControl[] {
  const stop = stopButton(page);
  return [
    ...(pauseOffered(page)
      ? [
          {
            label: pauseLabel(page),
            element: 'watch.pause@toolbar',
            feature: 'watch.pause',
            tooltip: controlText.pauseTip,
          },
        ]
      : []),
    { label: stop.label, element: 'watch.stop@toolbar', feature: 'watch.stop', tooltip: stop.tooltip },
    ...(resumeOffered(page)
      ? [
          {
            label: controlText.resumeFromLast,
            element: 'watch.resume@toolbar',
            feature: 'watch.resume',
            tooltip: controlText.resumeFromLastTip,
          },
        ]
      : []),
    { label: controlText.clear, element: 'watch.clear@toolbar', feature: 'watch.clear', tooltip: controlText.clearTip },
    {
      label: exportText.export,
      element: 'watch.export@toolbar',
      feature: 'watch.export',
      ...(page.events.length === 0 ? { disabled: true } : {}),
    },
  ];
}

function preImagesOf(input: WatchShowInput): WatchPageView['filters']['preImages'] {
  const { page } = input;
  const before = input.serverVersion !== undefined && !asksBefore(input.serverVersion);
  if (page.watched.collection === undefined || page.preImages === undefined || before) {
    return undefined;
  }
  if (page.preImages) {
    return { text: showText.preImages, tooltip: showText.preImagesTip };
  }
  const enable: PageControl = {
    label: preImagesText.enable,
    element: 'watch.enable-pre-images@toolbar',
    feature: 'watch.enable-pre-images',
    tooltip: preImagesText.enableTip,
  };
  return { text: showText.noPreImages, tooltip: showText.noPreImagesTip, ...(input.readOnly ? {} : { enable }) };
}

function filtersOf(input: WatchShowInput, counts: Readonly<Record<EventCategory, number>>): WatchPageView['filters'] {
  const { page } = input;
  const preImages = preImagesOf(input);
  return {
    types: eventCategories.map((type) => ({
      type,
      label: showText.types[type],
      count: counts[type],
      on: !page.hiddenTypes.includes(type),
      tooltip: showText.typeTips[type],
      element: 'watch.visible-events@toolbar',
    })),
    search: { placeholder: showText.search, value: page.search, element: 'watch.visible-events@toolbar' },
    filter: {
      label: showText.filter,
      tooltip: showText.filterTip,
      placeholder: showText.filterPlaceholder,
      value: page.filter,
      element: 'watch.stream@toolbar',
    },
    fullDocument: {
      label: showText.fullDocument,
      tooltip: showText.fullDocumentTip,
      checked: page.fullDocument,
      element: 'watch.stream@toolbar',
    },
    ...(preImages === undefined ? {} : { preImages }),
  };
}

function messageOf(page: WatchPage): string | undefined {
  switch (page.message?.kind) {
    case 'standalone':
    case 'error':
      return page.message.text;
    case 'invalidated':
      return showText.invalidated;
    case undefined:
      return undefined;
  }
}

function rowOf(event: WatchEvent, input: WatchShowInput, selected: number | undefined): EventRow {
  const oneCollection = input.page.watched.collection !== undefined;
  return {
    number: event.number,
    time: localClock(event.time, input.offsetMinutes),
    timeTip: localDateTime(event.time, input.offsetMinutes),
    type: event.type,
    ...(oneCollection ? {} : { collection: event.namespace }),
    id: event.id,
    changes: event.changes,
    selected: event.number === selected,
  };
}

function bodyOf(input: WatchShowInput, shown: readonly WatchEvent[], selected: number | undefined): WatchBody {
  const { page } = input;
  if (page.events.length === 0 && page.message?.kind !== 'standalone') {
    if (page.status === 'starting') {
      return { kind: 'note', text: showText.starting };
    }
    return { kind: 'note', text: page.status === 'watching' ? showText.waiting : showText.notWatching };
  }
  if (page.events.length > 0 && shown.length === 0) {
    return { kind: 'note', text: showText.nothingMatches };
  }
  const { columns } = showText;
  const oneCollection = page.watched.collection !== undefined;
  return {
    kind: 'list',
    columns: [columns.time, columns.type, ...(oneCollection ? [] : [columns.collection]), columns.id, columns.changes],
    rows: shown.map((event) => rowOf(event, input, selected)),
  };
}

/** Feature: watch.show — what the Watch changes page shows. */
export function view(input: WatchShowInput): WatchPageView {
  const { page } = input;
  const visible = visibleEvents(page.events, page.hiddenTypes, page.search);
  const selected = page.events.some((event) => event.number === page.selected) ? page.selected : undefined;
  const message = messageOf(page);
  const count = page.dropped > 0 ? `${visible.count} ${showText.dropped(page.dropped)}` : visible.count;
  return {
    toolbar: {
      watched: watchedPlace(page.watched) ?? showText.allDatabases,
      state: stateText(page),
      controls: controlsOf(page),
    },
    filters: filtersOf(input, visible.counts),
    count,
    ...(message === undefined ? {} : { message }),
    body: bodyOf(input, visible.shown, selected),
    lineMenu: [
      { label: copyText.copyEvent, element: 'watch.copy-events@item-menu', feature: 'watch.copy-events' },
      {
        label: copyText.copyShown,
        element: 'watch.copy-events@item-menu',
        feature: 'watch.copy-events',
        args: { shown: true },
      },
      { label: copyText.copyEvent, element: 'watch.copy-events@list', feature: 'watch.copy-events' },
    ],
    ...(selected === undefined ? {} : { selected }),
  };
}

/** The title of the tab: **Watch: `<collection>`**, **Watch: `<database>`** or **Watch: `<connection>`**. */
export function watchTitle(watched: Watched, connectionName: string): string {
  return showText.tabTitle(watched.collection ?? watched.database ?? connectionName);
}

/** What the page's tab shows: one tab for each thing watched. */
export function watchShows(watched: Watched, connectionName: string): TabShows {
  return {
    kind: 'page',
    connection: connectionId(watched.connection),
    page: watchPage,
    title: watchTitle(watched, connectionName),
    ...(watched.database === undefined ? {} : { database: watched.database }),
    ...(watched.collection === undefined ? {} : { of: [watched.collection] }),
  };
}

/** What a tab's shows says is watched, for Go to: its collection, or its database; not a view's collection. */
function watchedOfTab(shows: TabShows): Watched | undefined {
  if (shows.kind === 'collection' || shows.kind === 'document') {
    const { connection, database, collection } = shows;
    return shows.kind === 'collection' && shows.view === true
      ? { connection, database }
      : { connection, database, collection };
  }
  if (shows.kind !== 'page' || shows.database === undefined) {
    return shows.kind === 'page' ? { connection: shows.connection } : undefined;
  }
  const collection = shows.page === watchPage ? shows.of?.[0] : undefined;
  return collection === undefined
    ? { connection: shows.connection, database: shows.database }
    : { connection: shows.connection, database: shows.database, collection };
}

/** What is watched, from the target: a collection, a database, a connection; for Go to, the active tab's. */
export function watchedOf(context: Context): Watched | undefined {
  const { target } = context;
  if (target.kind === 'collection') {
    return { connection: target.connection, database: target.database, collection: target.collection };
  }
  if (target.kind === 'database') {
    return { connection: target.connection, database: target.database };
  }
  if (target.kind === 'connection') {
    return { connection: target.connection };
  }
  if (target.kind !== 'app' && target.kind !== 'tab') {
    return undefined;
  }
  const active = activeTabOf(context.state.tabs);
  const current = context.state.nav.current;
  return (
    (active === undefined ? undefined : watchedOfTab(active.shows)) ??
    (current === undefined ? undefined : { connection: current })
  );
}

/** Feature: watch.show — opens the page of what is watched, connecting the connection first when it is not. */
export function plan(context: Context, _answers: Answers): Outcome {
  const watched = watchedOf(context);
  const saved =
    watched === undefined ? undefined : savedConnection(context.state.connections, connectionId(watched.connection));
  const after: After[] = [];
  if (watched !== undefined && saved?.engine === 'mongodb') {
    const connection: ConnectionId = saved.id;
    const target = { kind: 'connection', connection } as const;
    if (connectionState(context.state.connections, connection) !== 'connected') {
      after.push({ kind: 'start', feature: featureId('connection.connect'), target });
    }
    const shows = watchShows(watched, saved.name);
    after.push({ kind: 'start', feature: featureId('tab.open'), target, args: { shows: shows as unknown as Json } });
  }
  return run({
    title: showText.command,
    steps: [],
    danger: { kind: 'none' },
    undo: { cannot: controlText.nothingWritten },
    publishes: false,
    after,
  });
}

/** The identifier of the read of whether the watched collection records pre-images. */
export const preImagesReadId = 'watch.show:pre-images';

/** `db.getSiblingDB("shop").getCollectionInfos({ name: "orders" })`. */
export function preImagesRequest(database: string, collection: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'listCollections',
    arguments: [{ name: collection }, { nameOnly: false }],
  };
}

/** Whether the collection records pre-images: `options.changeStreamPreAndPostImages.enabled`. */
export function recordsPreImages(reply: unknown): boolean {
  const info = Array.isArray(reply) ? (reply[0] as Json | undefined) : undefined;
  const options = objectOf(isRecord(info) ? info['options'] : undefined);
  return objectOf(options['changeStreamPreAndPostImages'])['enabled'] === true;
}

/** `watch.show:pre-images`: started with `{ connection, database, collection }`. */
export const preImagesRead: ReadFeature = {
  kind: 'read',
  id: featureId(preImagesReadId),
  request: (_context: Context, args: Json) => {
    const { connection, database, collection } = objectOf(args);
    if (typeof connection !== 'string' || typeof database !== 'string' || typeof collection !== 'string') {
      throw new Error('watch.show:pre-images needs a collection.');
    }
    return {
      kind: 'engine',
      requests: [{ connection: connectionId(connection), request: preImagesRequest(database, collection) }],
    };
  },
  parse: (replies) => recordsPreImages(replies[0]),
};
