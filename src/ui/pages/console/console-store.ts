/**
 * What each console tab keeps in the window alone (`console.show`): the text of the input and where `Up` and `Down`
 * are in the history, the list of suggestions, what the output was asked to show more of, the value selected for the
 * inspector island, and the commands the server knows (`console.command-docs`). The output, the session and the
 * history are the app's state, which the main process keeps.
 */
import { useSyncExternalStore } from 'react';
import type { Opening } from '../../../features/console/autocomplete';
import type { CommandDocs } from '../../../features/console/command-docs';
import { notBrowsing, type HistoryBrowsing } from '../../../features/console/history';
import type { ConnectionId } from '../../../shared/ids';

/** A string of a reply, selected for the inspector island. */
export interface SelectedValue {
  readonly entry: number;
  readonly line: number;
  readonly string: number;
}

/** The list of suggestions, while it is open: how it was opened, and the one selected. */
export interface OpenList {
  readonly opening: Opening;
  readonly selected: number;
}

/** What one console tab keeps. */
export interface ConsoleTab {
  readonly connection: ConnectionId;
  readonly typed: string;
  readonly caret: number;
  /** Raised when the text is put in the input from outside (the history, a run), so that the editor shows it. */
  readonly put: number;
  readonly browsing: HistoryBrowsing;
  readonly list?: OpenList;
  /** By entry: how many elements are shown, after **Show 1,000 more**. */
  readonly shown: Readonly<Record<number, number>>;
  /** The entries whose **Show all** was pressed. */
  readonly whole: readonly number[];
  readonly scrolledUp: boolean;
  readonly selected?: SelectedValue;
  /** The commands of `COMMAND DOCS`, and the opening of the console's connection they were read for. */
  readonly docs?: { readonly read: CommandDocs; readonly opened: number };
  /** Lines of the input are being run, one after the other. */
  readonly running: boolean;
  /** Raised to put the focus in the input. */
  readonly focus: number;
}

const tabs = new Map<string, ConsoleTab>();
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

/** A console tab never shown. */
export function freshTab(connection: ConnectionId): ConsoleTab {
  return {
    connection,
    typed: '',
    caret: 0,
    put: 0,
    browsing: notBrowsing,
    shown: {},
    whole: [],
    scrolledUp: false,
    running: false,
    focus: 0,
  };
}

/** The state of a tab, when it was shown once. */
export function consoleTabOf(tab: string): ConsoleTab | undefined {
  return tabs.get(tab);
}

/** Keeps the state of a tab for the first time. */
export function keepTab(tab: string, state: ConsoleTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the state of a tab, when it has one. */
export function changeTab(tab: string, change: (state: ConsoleTab) => ConsoleTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** The tab with a text put in its input from outside, the caret at its end. */
export function withText(state: ConsoleTab, typed: string): ConsoleTab {
  const { list: _closed, ...rest } = state;
  return { ...rest, typed, caret: typed.length, put: state.put + 1 };
}

/** Forgets the tabs that are closed. */
export function forgetClosed(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The state of a tab, drawn again whenever any tab changes. */
export function useConsoleTab(tab: string | undefined): ConsoleTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
