/**
 * Feature: undo.show — the **Undo history** page: the recorded operations of every connection, newest first, with what
 * each one did and the space it takes; from here an operation is undone, inspected or removed.
 */
import type { ConnectionView } from '../../shared/connection';
import type { Json } from '../../shared/engine-request';
import type { SettingsState } from '../../shared/state/settings';
import { sizeText } from '../task/show';
import type { DetailsBox } from './details';
import type { PageMessage, UndoState } from './state/history';
import { pageText } from './text';
import type { UndoEntry } from './types';
import { placeText, undoSettings, whereText } from './types';

/** What the page is drawn from. */
export interface ShowState {
  readonly undo: UndoState;
  /** The saved connections, for the name each has now. */
  readonly connections: readonly ConnectionView[];
  readonly settings: SettingsState;
  readonly now: number;
}

/** A button of the page and the identifier of its control. */
export interface ButtonView<E extends string> {
  readonly label: string;
  readonly element: E;
  readonly enabled: boolean;
  readonly tooltip?: string;
}

/** One operation of the table. */
export interface RowView {
  readonly id: UndoEntry['id'];
  readonly when: { readonly text: string; readonly tooltip: string };
  readonly target: string;
  readonly operation: string;
  /** `1 inserted, 2 updated` or `undone`. */
  readonly changes: string;
  readonly changesTooltip?: string;
  /** None once undone. */
  readonly size?: string;
  readonly undo: ButtonView<'undo.revert@table'>;
  readonly remove: ButtonView<'undo.remove@table'>;
  /** A click or `Enter` on a row that isn't undone expands it with its details. */
  readonly expand?: 'undo.details@table';
  readonly expanded: boolean;
  readonly details?: DetailsBox;
}

/** The **Undo history** page. */
export interface ShowView {
  readonly title: string;
  readonly toolbar: {
    readonly filter: { readonly placeholder: string; readonly value: string };
    readonly summary: { readonly text: string; readonly tooltip: string };
    readonly undoLast: ButtonView<'undo.last@toolbar'>;
    /** Opens the Settings page at the settings of the undo history (`settings.page`). */
    readonly settings: { readonly label: string; readonly feature: 'settings.page'; readonly args: Json };
    readonly clear: ButtonView<'undo.clear@toolbar'>;
  };
  /** With `datardo.undo.enabled` off. */
  readonly notice?: string;
  readonly message?: PageMessage;
  readonly columns: readonly string[];
  readonly empty?: string;
  readonly rows: readonly RowView[];
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

function dayOf(date: Date): string {
  return `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** **when**: today `14:05:09`, yesterday `yesterday 14:05`, older `10-08 14:05`; the tooltip has the whole date. */
export function whenText(time: number, now: number): { readonly text: string; readonly tooltip: string } {
  const date = new Date(time);
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const minutes = `${two(date.getHours())}:${two(date.getMinutes())}`;
  const seconds = `${minutes}:${two(date.getSeconds())}`;
  const tooltip = `${dayOf(date)} ${seconds}`;
  if (dayOf(date) === dayOf(today)) {
    return { text: seconds, tooltip };
  }
  if (dayOf(date) === dayOf(yesterday)) {
    return { text: pageText.yesterday(minutes), tooltip };
  }
  return { text: `${two(date.getMonth() + 1)}-${two(date.getDate())} ${minutes}`, tooltip };
}

/** **changes**: `1 inserted, 2 updated, 3 deleted`, or `1 created, 2 changed, 3 deleted` for keys, without the zeros. */
export function changesText(entry: UndoEntry): string {
  const words = entry.engine === 'mongodb' ? ['inserted', 'updated', 'deleted'] : ['created', 'changed', 'deleted'];
  const counts = [entry.inserted, entry.updated, entry.deleted];
  return counts.flatMap((count, index) => (count > 0 ? [`${String(count)} ${words[index] ?? ''}`] : [])).join(', ');
}

function connectionName(state: ShowState, entry: UndoEntry): string {
  return state.connections.find((each) => each.id === entry.connection)?.name ?? entry.connectionName;
}

/** Whether an operation matches the filter: its connection's name, its target without the connection, its title. */
export function matchesFilter(entry: UndoEntry, name: string, filter: string): boolean {
  const wanted = filter.trim().toLowerCase();
  return wanted === '' || [name, placeText(entry), entry.title].some((text) => text.toLowerCase().includes(wanted));
}

function rowOf(state: ShowState, entry: UndoEntry): RowView {
  const name = connectionName(state, entry);
  const undone = entry.undone !== undefined;
  const undoing = state.undo.undoing.includes(entry.id);
  const expanded = !undone && state.undo.expanded === entry.id;
  return {
    id: entry.id,
    when: whenText(entry.time, state.now),
    target: whereText(name, entry),
    operation: entry.title,
    changes: undone ? pageText.undone : changesText(entry),
    ...(entry.undone === undefined
      ? {}
      : { changesTooltip: pageText.undoneAt(whenText(entry.undone, state.now).tooltip) }),
    ...(undone ? {} : { size: sizeText(entry.size) }),
    undo: {
      label: undoing ? pageText.undoing : pageText.undo,
      element: 'undo.revert@table',
      enabled: !undone && !undoing,
      tooltip: entry.engine === 'mongodb' ? pageText.undoDocuments : pageText.undoKeys,
    },
    remove: { label: pageText.remove, element: 'undo.remove@table', enabled: true, tooltip: pageText.removeTooltip },
    ...(undone ? {} : { expand: 'undo.details@table' as const }),
    expanded,
    ...(expanded && state.undo.details !== undefined ? { details: state.undo.details } : {}),
  };
}

function summaryOf(state: ShowState, shown: number): { readonly text: string; readonly tooltip: string } {
  const settings = undoSettings(state.settings);
  const entries = state.undo.entries;
  const used = entries.reduce((sum, each) => sum + each.size, 0);
  const total = pageText.summary(entries.length, sizeText(used), sizeText(settings.maxBytes));
  return {
    text: state.undo.filter.trim() === '' ? total : `${pageText.shown(shown)} · ${total}`,
    tooltip: pageText.limits(
      settings.maxDays,
      settings.maxEntries,
      sizeText(settings.maxBytes),
      settings.maxDocumentsPerOperation,
    ),
  };
}

/** Feature: undo.show. */
export function view(state: ShowState): ShowView {
  const { undo } = state;
  const rows = undo.entries
    .filter((entry) => matchesFilter(entry, connectionName(state, entry), undo.filter))
    .map((entry) => rowOf(state, entry));
  const empty = undo.entries.length === 0 ? pageText.empty : rows.length === 0 ? pageText.noMatch : undefined;
  const settings = undoSettings(state.settings);
  return {
    title: pageText.title,
    toolbar: {
      filter: { placeholder: pageText.filter, value: undo.filter },
      summary: summaryOf(state, rows.length),
      undoLast: {
        label: pageText.undoLast,
        element: 'undo.last@toolbar',
        enabled: undo.entries.some((each) => each.undone === undefined),
      },
      settings: { label: pageText.settings, feature: 'settings.page', args: { group: 'Undo history' } },
      clear: { label: pageText.clear, element: 'undo.clear@toolbar', enabled: undo.entries.length > 0 },
    },
    ...(settings.enabled ? {} : { notice: pageText.off }),
    ...(undo.message === undefined ? {} : { message: undo.message }),
    columns: pageText.columns,
    ...(empty === undefined ? {} : { empty }),
    rows,
  };
}
