/**
 * What the key tab keeps of its value in the window alone (`value.show`; architecture, "State": the items of a value
 * are not kept in the main process): what was read (the type, the count, a string's bytes, the rows of the other
 * types and where the next page starts), the filter, the sort, the selection, the formats chosen, the text typed and
 * not saved, and the editor open over a cell. A tab's value lives until the tab is closed.
 */
import { useSyncExternalStore } from 'react';
import { noSelection, type KeySelection } from '../../../features/key/select';
import type { Format } from '../../../features/value/format';
import type { EditedCell } from '../../../features/value/item-editor';
import type { ScanState } from '../../../features/value/read-hash';
import type { StringLoad } from '../../../features/value/read-string';
import type { ValueRow } from '../../../features/value/show';
import type { Json } from '../../../shared/engine-request';
import type { ConnectionId } from '../../../shared/ids';

/** The key of a key tab. */
export interface ValueWhere {
  readonly connection: ConnectionId;
  readonly database: number;
  readonly key: Uint8Array;
}

/** The editor open over a cell (`value.item-editor`): the row by its name, the column, what is typed. */
export interface CellEditing {
  readonly row: string;
  readonly column: string;
  readonly cell: EditedCell;
  readonly choice?: Format;
  readonly typed?: string;
  /** What the write refused, or why nothing was saved, shown in place of the hint. */
  readonly refused?: string;
}

/** A line under the string's editor: what cannot be read, what the save refused, or a note. */
export interface EditorLine {
  readonly kind: 'problem' | 'note';
  readonly text: string;
}

/** What one key tab keeps of its value. */
export interface ValueTab {
  readonly where: ValueWhere;
  /** The read in progress: a newer one (a refresh, a filter) makes an older one stop. */
  readonly run: number;
  readonly status: 'loading' | 'ready' | 'gone' | 'error';
  readonly error?: string;
  /** What `TYPE` answered; empty until it is known. */
  readonly type: string;
  /** The type the tab read before a refresh found another. */
  readonly was?: string;
  /** The type a refresh found while the text typed was kept, and the view stayed that of `type`. */
  readonly found?: string;
  readonly count?: number;
  readonly string?: StringLoad;
  /** *The value changed while it was read: loaded again.* */
  readonly changedWhileRead?: boolean;
  /** The rows read, in the server's order, and the scan of a hash or a set. */
  readonly rows: readonly ValueRow[];
  readonly scan?: ScanState<ValueRow>;
  /** The arguments of **Load more** for a list, a sorted set or a stream; none when everything is loaded. */
  readonly next?: Json;
  readonly loadingMore: boolean;
  /** What is typed in **Filter fields**, and the filter the rows were read with. */
  readonly field: string;
  readonly filter: string;
  /** Some field of a hash has an expiry of its own. */
  readonly fieldExpiry: boolean;
  readonly selection: KeySelection;
  /** The column of the cell last clicked, which `Ctrl+C` copies with one row selected. */
  readonly column?: string;
  readonly sort?: { readonly column: string; readonly order: 'ascending' | 'descending' };
  /** The format chosen for the string (`value`) and for each column. */
  readonly choices: Readonly<Record<string, Format>>;
  /** The string's text typed and not saved. */
  readonly draft?: string;
  readonly line?: EditorLine;
  readonly editing?: CellEditing;
  /** A refresh this tab asked for (a save, **Refresh**): the text typed is dropped when it comes. */
  readonly ownRefresh: boolean;
  /** The refresh of the connection last followed (`state.runner.refreshed.times`). */
  readonly refreshes: number;
}

const tabs = new Map<string, ValueTab>();
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

/** A tab never read: loading, nothing selected, no filter. */
export function freshValue(where: ValueWhere, refreshes: number): ValueTab {
  return {
    where,
    run: 0,
    status: 'loading',
    type: '',
    rows: [],
    loadingMore: false,
    field: '',
    filter: '',
    fieldExpiry: false,
    selection: noSelection,
    choices: {},
    ownRefresh: false,
    refreshes,
  };
}

/** The value of a tab, when it was shown once. */
export function valueTabOf(tab: string): ValueTab | undefined {
  return tabs.get(tab);
}

/** Keeps the value of a tab for the first time. */
export function keepValueTab(tab: string, state: ValueTab): void {
  tabs.set(tab, state);
  changedAll();
}

/** Changes the value of a tab, when it has one. */
export function changeValue(tab: string, change: (state: ValueTab) => ValueTab): void {
  const state = tabs.get(tab);
  if (state !== undefined) {
    tabs.set(tab, change(state));
    changedAll();
  }
}

/** Forgets the values of the tabs that are closed. */
export function forgetClosedValues(open: ReadonlySet<string>): void {
  for (const tab of [...tabs.keys()]) {
    if (!open.has(tab)) {
      tabs.delete(tab);
    }
  }
}

/** The value of a tab, drawn again whenever any tab's value changes. */
export function useValueTab(tab: string | undefined): ValueTab | undefined {
  useSyncExternalStore(subscribe, () => version);
  return tab === undefined ? undefined : tabs.get(tab);
}
