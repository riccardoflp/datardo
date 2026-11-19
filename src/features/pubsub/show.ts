/**
 * Feature: pubsub.show
 *
 * The Pub/Sub page of a Redis connection, one page tab per connection: the toolbar, the state on one line with the
 * counts, the lists **Subscriptions** and **Active channels** at the left, and the list of messages. `view` says what
 * the toolbar, the state, the banner and the status line show; the lists are the views of their own cards. `plan` is
 * what **Pub/Sub** of the tree island and Go to start: it opens the tab, connecting the connection first.
 */
import type { After, Answers, Context, Outcome } from '../../shared/feature';
import { noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { featureId } from '../../shared/ids';
import type { TabShows } from '../../shared/state/tabs';
import { connectionState, savedConnection } from '../../shared/state/connections';
import { isClearOffered } from './clear';
import { countsText, isFiltering, messageCount, shownMessages } from './filter';
import { isPauseOffered, pauseLabel } from './pause';
import { bannerOf, secondsToRetry } from './reconnect';
import type { MenuEntry } from './subscriptions';
import { text } from './text';
import type { NameKind, PubSubPage } from './types';
import { nameText, pageConnectionOf } from './types';

/** The tab of the Pub/Sub page of a connection. */
export function pubsubTab(connection: ConnectionId): TabShows {
  return { kind: 'page', connection, page: 'pubsub', title: text.show.title };
}

/** A MongoDB connection linked to the page's connection, for **Events of**. */
export interface LinkedConnection {
  readonly id: ConnectionId;
  readonly name: string;
}

/** What the page is drawn from. */
export interface ShowInput {
  readonly page: PubSubPage;
  readonly connectionName: string;
  readonly readOnly: boolean;
  /** The MongoDB connections linked to this one; **Events of** is shown when there is one. */
  readonly linked: readonly LinkedConnection[];
  /** *Local has no channel prefix: …*, when the events of a connection with no prefix are shown. */
  readonly noPrefix?: string;
  readonly now: number;
}

/** A control of the toolbar. */
export interface ToolbarControl extends MenuEntry {
  readonly tooltip?: string;
}

/** What the page shows around its lists. */
export interface ShowView {
  readonly title: string;
  readonly toolbar: {
    readonly name: {
      readonly label: string;
      readonly kinds: readonly { readonly kind: NameKind; readonly label: string; readonly chosen: boolean }[];
      readonly subscribe: ToolbarControl;
    };
    readonly pause: ToolbarControl;
    readonly clear: ToolbarControl;
    readonly filter: ToolbarControl & { readonly value: string; readonly mark?: string };
    readonly eventsOf?: ToolbarControl & {
      readonly choices: readonly {
        readonly label: string;
        readonly connection?: ConnectionId;
        readonly chosen: boolean;
      }[];
    };
    readonly export: ToolbarControl;
    readonly publish: ToolbarControl;
  };
  /** **● Listening**, **❚❚ Paused · 42 new**, **■ Disconnected · trying again in 4 s**… */
  readonly state: string;
  /** *3 subscriptions · 1,204 messages* */
  readonly counts: string;
  /** The banner of `pubsub.reconnect`, with **Reconnect now**, while disconnected. */
  readonly banner?: { readonly lines: readonly string[]; readonly reconnect: ToolbarControl };
  /** **Connect**, when the user disconnected the saved connection. */
  readonly connect?: ToolbarControl;
  readonly notice?: string;
  /** **Read-only** on the status line, for a read-only connection. */
  readonly readOnly?: string;
  /** *37 of 1,204 messages*, on the status line. */
  readonly statusLine: string;
  /** The inspector island is hidden while no row is selected. */
  readonly inspector: boolean;
}

/** The state on one line. */
export function stateText(page: PubSubPage, now: number): string {
  switch (page.pageConnection) {
    case 'connecting':
      return text.show.connecting;
    case 'disconnected': {
      const seconds = secondsToRetry(page, now);
      return seconds === undefined ? text.show.disconnected : text.show.retryingIn(seconds);
    }
    case 'not-connected':
      return text.show.notConnected;
    case 'closed':
    case 'open':
      break;
  }
  if (page.subscriptions.length === 0) {
    return text.show.notSubscribed;
  }
  if (!page.kept.paused) {
    return text.show.listening;
  }
  return page.kept.held.length === 0 ? text.show.paused : text.show.pausedNew(page.kept.held.length);
}

function nameControls(page: PubSubPage): ShowView['toolbar']['name'] {
  return {
    label: text.show.nameField,
    kinds: (['auto', 'channel', 'pattern'] as const).map((kind) => ({
      kind,
      label: text.show.kinds[kind],
      chosen: kind === page.nameKind,
    })),
    subscribe: { label: text.show.subscribe, feature: 'pubsub.subscribe', element: 'pubsub.subscribe@toolbar' },
  };
}

function eventsOfControl(input: ShowInput): NonNullable<ShowView['toolbar']['eventsOf']> {
  const chosen = input.page.eventsOf;
  return {
    label: text.show.eventsOf,
    feature: 'pubsub.follow-oplog',
    element: 'pubsub.follow-oplog@toolbar',
    choices: [
      { label: text.show.off, chosen: chosen === undefined },
      ...input.linked.map((each) => ({ label: each.name, connection: each.id, chosen: each.id === chosen })),
    ],
  };
}

function toolbarOf(input: ShowInput): ShowView['toolbar'] {
  const { page } = input;
  const disabled = (offered: boolean): { readonly disabled?: string } => (offered ? {} : { disabled: '' });
  const publishDisabled = input.readOnly ? { disabled: text.show.readOnlyPublish(input.connectionName) } : {};
  const mark = page.filter.subscription === undefined ? {} : { mark: nameText(page.filter.subscription.name) };
  return {
    name: nameControls(page),
    pause: {
      label: pauseLabel(page),
      feature: 'pubsub.pause',
      element: 'pubsub.pause@toolbar',
      ...(page.kept.paused ? { args: 'resume' } : {}),
      ...disabled(isPauseOffered(page)),
    },
    clear: {
      label: text.clear.clear,
      tooltip: text.clear.tooltip,
      feature: 'pubsub.clear',
      element: 'pubsub.clear@toolbar',
      ...disabled(isClearOffered(page)),
    },
    filter: {
      label: text.show.filter,
      feature: 'pubsub.filter',
      element: 'pubsub.filter@toolbar',
      value: page.filter.text,
      ...mark,
    },
    ...(input.linked.length === 0 ? {} : { eventsOf: eventsOfControl(input) }),
    export: {
      label: text.show.export,
      feature: 'pubsub.export',
      element: 'pubsub.export@toolbar',
      ...disabled(messageCount(page.kept.listed) > 0),
    },
    publish: {
      label: text.show.publish,
      feature: 'pubsub.publish',
      element: 'pubsub.publish@toolbar',
      ...publishDisabled,
    },
  };
}

function bannerPart(page: PubSubPage): Pick<ShowView, 'banner' | 'connect'> {
  if (page.pageConnection === 'not-connected') {
    return { connect: { label: text.show.connect, feature: 'connection.connect' } };
  }
  const lines = page.pageConnection === 'disconnected' ? bannerOf(page) : undefined;
  return lines === undefined
    ? {}
    : {
        banner: {
          lines,
          reconnect: {
            label: text.reconnect.reconnectNow,
            feature: 'pubsub.reconnect',
            element: 'pubsub.reconnect@toolbar',
          },
        },
      };
}

/** Feature: pubsub.show — what the Pub/Sub page shows around its lists. */
export function view(input: ShowInput): ShowView {
  const { page } = input;
  const all = messageCount(page.kept.listed);
  const shown = messageCount(shownMessages(page.kept.listed, page.filter));
  return {
    title: text.show.title,
    toolbar: toolbarOf(input),
    state: stateText(page, input.now),
    counts: text.show.counts(page.subscriptions.length, countsText(all, all, false)),
    ...bannerPart(page),
    ...(input.noPrefix === undefined ? {} : { notice: input.noPrefix }),
    ...(input.readOnly ? { readOnly: text.show.readOnly } : {}),
    statusLine: countsText(shown, all, isFiltering(page.filter)),
    inspector: page.inspected !== undefined,
  };
}

/** Whether **Pub/Sub** is offered: the connection is a Redis connection. */
export function isOffered(context: Context, connection: ConnectionId): boolean {
  return savedConnection(context.state.connections, connection)?.engine === 'redis';
}

/** Feature: pubsub.show — opens the Pub/Sub tab of the Redis connection, connecting it first when it is not. */
export function plan(context: Context, _answers: Answers): Outcome {
  const id = pageConnectionOf(context);
  const connection = id === undefined ? undefined : savedConnection(context.state.connections, id);
  const after: After[] = [];
  if (connection?.engine === 'redis') {
    const target = { kind: 'connection', connection: connection.id } as const;
    if (connectionState(context.state.connections, connection.id) !== 'connected') {
      after.push({ kind: 'start', feature: featureId('connection.connect'), target });
    }
    after.push({ kind: 'start', feature: featureId('tab.open'), target, args: { shows: pubsubTab(connection.id) } });
  }
  return run({
    title: text.show.title,
    steps: [],
    danger: noDanger,
    undo: { cannot: text.show.nothingWritten },
    publishes: false,
    after,
  });
}
