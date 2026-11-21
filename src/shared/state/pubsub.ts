/**
 * The part of the app's state about the Pub/Sub pages of Redis connections (`pubsub.show`): for each connection whose
 * Pub/Sub tab is open, its subscriptions, its own connection, and the list of the messages it received (`pubsub.keep`).
 * The main process decides every change with the functions of `src/features/pubsub` and sends it as an event; a page's
 * list changes by the rows added, replaced and dropped (`kept`), so that a flood of messages crosses the bridge as the
 * new rows only, never as the whole list again. The messages are kept nowhere else.
 */
import type { ConnectionId } from '../ids';

/** What a subscription follows: one channel by its name, or every channel whose name matches a pattern. */
export type SubscriptionKind = 'channel' | 'pattern';

/** The kind chosen beside the field **Channel or pattern**: **Auto** reads a name with `*`, `?` or `[` as a pattern. */
export type NameKind = 'auto' | SubscriptionKind;

/** A channel or a pattern the page is subscribed to (glossary, "subscription"). */
export interface Subscription {
  readonly kind: SubscriptionKind;
  readonly name: Uint8Array;
  /** Whether the server answered its command; until then it is shown dimmed, *Subscribing…* */
  readonly answered: boolean;
  /** The messages received through it since it was made, or since **Clear**. */
  readonly received: number;
}

/** A message the page received (glossary, "message"), numbered from 1 since the tab was opened (`pubsub.keep`). */
export interface Message {
  readonly kind: 'message';
  readonly number: number;
  /** When Datardo received it, in milliseconds since 1970: a message carries no time of its own. */
  readonly receivedAt: number;
  readonly channel: Uint8Array;
  /** The pattern it arrived through, for a message of a pattern subscription. */
  readonly pattern?: Uint8Array;
  readonly message: Uint8Array;
}

/** The row that marks where the page's connection was closed and messages may be missing (`pubsub.reconnect`). */
export interface Gap {
  readonly kind: 'gap';
  readonly number: number;
  readonly from: number;
  readonly to: number;
}

/** What a message published for redis-oplog is about (`pubsub.oplog-event`). */
export interface OplogEvent {
  readonly operation: 'insert' | 'update' | 'remove';
  readonly collection: string;
  /** The `_id` in mongosh syntax: `"abc"`, `3`, `ObjectId("…")`. */
  readonly document: string;
  /** The fields of an update, when it says them. */
  readonly fields?: readonly string[];
  readonly channelKind: 'collection' | 'namespace' | 'document';
  /** The redis-oplog namespace of a namespace's channel. */
  readonly namespace?: string;
}

/** One event shown once, with the messages that brought it on each of its channels (`pubsub.event-rows`). */
export interface EventRow {
  readonly kind: 'event';
  /** The number of its first message. */
  readonly number: number;
  readonly event: OplogEvent;
  /** Its messages in the order they arrived; their bytes are equal, their channels differ. */
  readonly messages: readonly Message[];
}

/** A row of the list of messages. */
export type Row = Message | Gap | EventRow;

/** What a MongoDB connection publishes with for redis-oplog: its channel prefix and its namespaces. */
export interface OplogLink {
  readonly prefix: string;
  readonly namespaces: readonly string[];
}

/** What the list keeps (`pubsub.keep`): the rows, those a pause holds, and how many were dropped. */
export interface Kept {
  readonly listed: readonly Row[];
  readonly held: readonly Row[];
  readonly paused: boolean;
  readonly dropped: number;
  /** The number the next message gets. */
  readonly next: number;
  /** With **Events of** on, the link whose events are made rows of (`pubsub.event-rows`). */
  readonly link?: OplogLink;
}

/** What the field **Filter messages** and **Show only its messages** hold (`pubsub.filter`). */
export interface MessageFilter {
  readonly text: string;
  readonly subscription?: { readonly kind: SubscriptionKind; readonly name: Uint8Array };
}

/**
 * The page's own connection: none yet, being opened, open, closed by the server or the network (retrying), or closed
 * because the user disconnected the saved connection (no retry).
 */
export type PageConnection = 'closed' | 'connecting' | 'open' | 'disconnected' | 'not-connected';

/** The Pub/Sub page of one Redis connection, as the main process keeps it. */
export interface PubSubPage {
  readonly connection: ConnectionId;
  readonly pageConnection: PageConnection;
  /** In the order they were made. */
  readonly subscriptions: readonly Subscription[];
  readonly kept: Kept;
  readonly filter: MessageFilter;
  readonly nameKind: NameKind;
  /** The MongoDB connection whose events the list shows (`pubsub.follow-oplog`). */
  readonly eventsOf?: ConnectionId;
  /** The channel published to last from this page (`pubsub.publish`). */
  readonly lastChannel?: string;
  /** When the page's connection closed, while it is disconnected. */
  readonly disconnectedAt?: number;
  /** How many tries failed since it closed, when the next one is, and the error of the last one. */
  readonly tries: number;
  readonly retryAt?: number;
  readonly retryError?: string;
  /** What the server answered to the last subscription that it refused, shown under the field (`pubsub.subscribe`). */
  readonly fieldError?: string;
  /** The numbers of the rows selected, and of the row the inspector island shows. */
  readonly selected: readonly number[];
  readonly inspected?: number;
  /** The computer's time zone, in minutes east of UTC, for the times the page writes. */
  readonly offsetMinutes: number;
}

/** The Pub/Sub pages, by connection. */
export type PubSubPages = Readonly<Record<string, PubSubPage>>;

/** Everything of a page but its list of messages: what a `changed` event sets. */
export type PageFields = Omit<PubSubPage, 'kept'>;

/** How a list of rows changed: the oldest dropped, rows replaced by their numbers, and rows added at the end. */
export interface RowsChange {
  readonly drop: number;
  readonly replaced: readonly Row[];
  readonly added: readonly Row[];
}

/** How the list of a page changed. */
export interface KeptChange {
  readonly listed: RowsChange;
  readonly held: RowsChange;
  readonly paused: boolean;
  readonly dropped: number;
  readonly next: number;
  /** The link of **Events of**, or `null` when it is off. */
  readonly link: OplogLink | null;
}

/** The events of this part of the state. */
export type PubSubEvent =
  | { readonly slice: 'pubsub'; readonly type: 'opened'; readonly page: PubSubPage }
  | { readonly slice: 'pubsub'; readonly type: 'changed'; readonly connection: ConnectionId; readonly page: PageFields }
  | { readonly slice: 'pubsub'; readonly type: 'kept'; readonly connection: ConnectionId; readonly change: KeptChange }
  | { readonly slice: 'pubsub'; readonly type: 'forgotten'; readonly connection: ConnectionId };

/** No Pub/Sub page open. */
export const initialPubSubPages: PubSubPages = {};

/** Every row of `after`, as a change from `before`. */
function wholly(before: readonly Row[], after: readonly Row[]): RowsChange {
  return { drop: before.length, replaced: [], added: after };
}

/**
 * How `before` became `after`: the rows dropped from its start, those of the same number that changed (an event that
 * joined a message), and those added at its end; every row again when it changed otherwise (a resume, **Events of**).
 */
export function rowsChange(before: readonly Row[], after: readonly Row[]): RowsChange {
  const first = after[0];
  const start = first === undefined ? before.length : before.findIndex((row) => row.number === first.number);
  if (start < 0 || before.length - start > after.length) {
    return wholly(before, after);
  }
  const replaced: Row[] = [];
  for (let index = 0; index < before.length - start; index += 1) {
    const was = before[start + index];
    const now = after[index];
    if (was === undefined || now === undefined || was.number !== now.number) {
      return wholly(before, after);
    }
    if (was !== now) {
      replaced.push(now);
    }
  }
  return { drop: start, replaced, added: after.slice(before.length - start) };
}

/** The rows after a change. */
export function rowsAfter(rows: readonly Row[], change: RowsChange): readonly Row[] {
  const rest = rows.slice(change.drop);
  if (change.replaced.length === 0) {
    return change.added.length === 0 ? rest : [...rest, ...change.added];
  }
  const replacing = new Map(change.replaced.map((row) => [row.number, row]));
  return [...rest.map((row) => replacing.get(row.number) ?? row), ...change.added];
}

/** How a page's list changed, from what it was to what it is. */
export function keptChange(before: Kept, after: Kept): KeptChange {
  return {
    listed: rowsChange(before.listed, after.listed),
    held: rowsChange(before.held, after.held),
    paused: after.paused,
    dropped: after.dropped,
    next: after.next,
    link: after.link ?? null,
  };
}

/** The list after a change. */
export function keptAfter(kept: Kept, change: KeptChange): Kept {
  return {
    listed: rowsAfter(kept.listed, change.listed),
    held: rowsAfter(kept.held, change.held),
    paused: change.paused,
    dropped: change.dropped,
    next: change.next,
    ...(change.link === null ? {} : { link: change.link }),
  };
}

function withPage(pages: PubSubPages, connection: ConnectionId, change: (page: PubSubPage) => PubSubPage): PubSubPages {
  const page = pages[connection];
  return page === undefined ? pages : { ...pages, [connection]: change(page) };
}

/** Changes this part of the state. */
export function reducePubSub(pages: PubSubPages, event: PubSubEvent): PubSubPages {
  switch (event.type) {
    case 'opened':
      return { ...pages, [event.page.connection]: event.page };
    case 'changed':
      return withPage(pages, event.connection, (page) => ({ ...event.page, kept: page.kept }));
    case 'kept':
      return withPage(pages, event.connection, (page) => ({ ...page, kept: keptAfter(page.kept, event.change) }));
    case 'forgotten': {
      const { [event.connection]: _gone, ...others } = pages;
      return others;
    }
  }
}
