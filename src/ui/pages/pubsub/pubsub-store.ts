/**
 * What each Pub/Sub tab keeps in the window alone (`pubsub.show`): the name typed in the field **Channel or pattern**,
 * the kind and the filter as they are typed (the main process keeps them with the tab once they settle), the rows
 * selected and the one the inspector island shows, the format it shows it in, where the table is scrolled, and the list
 * **Active channels** as it was last read (`pubsub.channels`). The subscriptions and the messages are the app's state,
 * which the main process keeps.
 */
import { useSyncExternalStore } from 'react';
import type { ChannelsState } from '../../../features/pubsub/channels';
import type { MessageFilter, NameKind, ShownFormat } from '../../../features/pubsub/types';
import type { ConnectionId } from '../../../shared/ids';

/** What one Pub/Sub tab keeps. */
export interface PubSubTab {
  readonly connection: ConnectionId;
  readonly typed: string;
  readonly nameKind: NameKind;
  readonly filter: MessageFilter;
  /** The numbers of the rows selected, and the one a `Shift` click counts from. */
  readonly selected: readonly number[];
  readonly anchor?: number;
  /** The number of the row the inspector island shows. */
  readonly inspected?: number;
  /** The format the inspector island shows the value in, when the user chose one. */
  readonly format?: ShownFormat;
  /** The newest row the user saw at the top of the table: the rows after it are **12 new** while scrolled down. */
  readonly seenNewest: number;
  readonly scrolledDown: boolean;
  /** Raised to put the table back at its top. */
  readonly toTop: number;
  readonly channelsFilter: string;
  readonly channels: ChannelsState;
  /** The number of the last request of each command of `pubsub.channels`, and when the list was last read. */
  readonly channelsSent: number;
  readonly channelsReadAt: number;
}

const tabs = new Map<string, PubSubTab>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changedAll(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/** A Pub/Sub tab never shown, with the kind and the filter the page has. */
export function freshPubSubTab(connection: ConnectionId, nameKind: NameKind, filter: MessageFilter): PubSubTab {
  return {
    connection,
    typed: '',
    nameKind,
    filter,
    selected: [],
    seenNewest: 0,
    scrolledDown: false,
    toTop: 0,
    channelsFilter: '',
    channels: {},
    channelsSent: 0,
    channelsReadAt: 0,
  };
}

/** The state of a tab, when it was shown once. */
export function pubsubTabOf(tab: string): PubSubTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepPubSubTab(tab: string, state: PubSubTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changePubSubTab(tab: string, change: (state: PubSubTab) => PubSubTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    const changed = change(state);
    if (changed !== state) {
      tabs.set(tab, changed);
      changedAll();
    }
  }
}

/** The tab with nothing selected and the inspector island emptied. */
export function withoutSelection(state: PubSubTab): PubSubTab {
  const { anchor: _anchor, inspected: _inspected, format: _format, ...rest } = state;
  return state.selected.length === 0 && state.inspected === undefined ? state : { ...rest, selected: [] };
}

/** Forgets the tabs that are closed. */
export function forgetClosedPubSubTabs(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function usePubSubTab(tab: string | undefined): PubSubTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
