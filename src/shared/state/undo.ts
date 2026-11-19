/**
 * The part of the app's state about the undo history (undo.md): the operations of `undo/index.json`, newest first,
 * whether the index may be written, the undos running and the last message of the **Undo history** page. What the
 * page alone remembers (its filter, the row expanded with its details) has its place here too, so that the page's View
 * reads one state; the window keeps those fields for itself and the main process never sets them.
 */
import type { Json } from '../engine-request';
import type { ConnectionId } from '../ids';

/** The identifier of an operation of the undo history, which also names its file. */
export type OperationId = string & { readonly __brand: 'OperationId' };

/** What all operations of the index have. */
interface EntryBase {
  readonly id: OperationId;
  /** When it was recorded, in milliseconds since 1970. */
  readonly time: number;
  readonly connection: ConnectionId;
  /** The connection's name when it was recorded, shown when the connection is gone. */
  readonly connectionName: string;
  /** The plan's title, cut to 300 characters. */
  readonly title: string;
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  /** The bytes of its compressed file; 0 once undone. */
  readonly size: number;
  /** When it was undone. */
  readonly undone?: number;
  /** The operation this one undid. */
  readonly undoOf?: OperationId;
}

/** An operation of the undo history (glossary, "operation"), on a collection or on a database of keys. */
export type UndoEntry = EntryBase &
  (
    | { readonly engine: 'mongodb'; readonly database: string; readonly collection: string }
    | { readonly engine: 'redis'; readonly database: number }
  );

/** A row of the table of a document: a field, its value now and after the undo; `—` when missing on one side. */
export interface FieldRow {
  readonly field: string;
  readonly now: string;
  readonly after: string;
  readonly nowTooltip?: string;
  readonly afterTooltip?: string;
}

/** A key's cell: its type, the size of its dump and its expiry, or `—` when it is missing on that side. */
export interface KeyCell {
  readonly text: string;
  readonly tooltip?: string;
}

/** One document or key of the details of an operation (`undo.details`). */
export interface DetailItem {
  /** The `_id` in mongosh syntax, or the key's name. */
  readonly name: string;
  /** `updated: the undo restores it`. */
  readonly what: string;
  readonly changedSince: boolean;
  /** *Already as it was: the undo changes nothing.* or *Already deleted.* */
  readonly note?: string;
  readonly fields?: readonly FieldRow[];
  readonly key?: { readonly now: KeyCell; readonly after: KeyCell };
}

/** What the expanded row of the page shows (`undo.details`). */
export type DetailsBox =
  | { readonly kind: 'loading'; readonly text: string }
  | { readonly kind: 'refused'; readonly text: string }
  | {
      readonly kind: 'shown';
      /** *First 100 of 2,500 documents.* */
      readonly first?: string;
      /** *3 documents changed after the operation: undoing overwrites those changes too.* */
      readonly changed?: string;
      readonly items: readonly DetailItem[];
    };

/** The last message of the page: the result of the last undo started from it. */
export interface PageMessage {
  readonly text: string;
  readonly failed: boolean;
}

/** The part of the app's state about the undo history. */
export interface UndoState {
  /** Newest first. */
  readonly entries: readonly UndoEntry[];
  /** False when `undo/index.json` was written by a newer Datardo: changes are not saved (data.md, "Versions"). */
  readonly writable: boolean;
  /** The text of the page's filter, kept while another tab is active (kept by the window). */
  readonly filter: string;
  /** The row whose details are shown (kept by the window). */
  readonly expanded?: OperationId;
  /** What the expanded row shows: loading, the details, or why there are none (kept by the window). */
  readonly details?: DetailsBox;
  /** The operations being undone. */
  readonly undoing: readonly OperationId[];
  readonly message?: PageMessage;
}

/** No operation. */
export const initialUndoState: UndoState = { entries: [], writable: true, filter: '', undoing: [] };

/** The events of this part of the state. */
export type UndoEvent =
  | {
      readonly slice: 'undo';
      readonly type: 'loaded';
      readonly entries: readonly UndoEntry[];
      readonly writable: boolean;
    }
  | { readonly slice: 'undo'; readonly type: 'recorded'; readonly entry: UndoEntry }
  | { readonly slice: 'undo'; readonly type: 'removed'; readonly operations: readonly OperationId[] }
  | { readonly slice: 'undo'; readonly type: 'undone'; readonly operation: OperationId; readonly time: number }
  | { readonly slice: 'undo'; readonly type: 'filtered'; readonly filter: string }
  | { readonly slice: 'undo'; readonly type: 'expanded'; readonly operation?: OperationId }
  | { readonly slice: 'undo'; readonly type: 'details'; readonly operation: OperationId; readonly box: DetailsBox }
  | { readonly slice: 'undo'; readonly type: 'undoing'; readonly operation: OperationId; readonly running: boolean }
  | { readonly slice: 'undo'; readonly type: 'message'; readonly message?: PageMessage };

/** Changes this part of the state. */
export function reduceUndo(state: UndoState, event: UndoEvent): UndoState {
  switch (event.type) {
    case 'loaded':
      return { ...state, entries: event.entries, writable: event.writable };
    case 'recorded':
      return { ...state, entries: [event.entry, ...state.entries.filter((each) => each.id !== event.entry.id)] };
    case 'removed':
      return removed(state, event.operations);
    case 'undone':
      return {
        ...state,
        entries: state.entries.map((each) =>
          each.id === event.operation ? { ...each, undone: event.time, size: 0 } : each,
        ),
      };
    case 'filtered':
      return { ...state, filter: event.filter };
    case 'expanded':
      return expanded(state, event.operation);
    case 'details':
      return state.expanded === event.operation ? { ...state, details: event.box } : state;
    case 'undoing':
      return {
        ...state,
        undoing: event.running
          ? [...state.undoing.filter((each) => each !== event.operation), event.operation]
          : state.undoing.filter((each) => each !== event.operation),
      };
    case 'message':
      return withMessage(state, event.message);
  }
}

function removed(state: UndoState, operations: readonly OperationId[]): UndoState {
  const gone = new Set<string>(operations);
  const entries = state.entries.filter((each) => !gone.has(each.id));
  return state.expanded !== undefined && gone.has(state.expanded)
    ? expanded({ ...state, entries }, undefined)
    : { ...state, entries };
}

function expanded(state: UndoState, operation: OperationId | undefined): UndoState {
  const { expanded: _row, details: _box, ...rest } = state;
  return operation === undefined ? rest : { ...rest, expanded: operation };
}

function withMessage(state: UndoState, message: PageMessage | undefined): UndoState {
  if (message !== undefined) {
    return { ...state, message };
  }
  const { message: _cleared, ...rest } = state;
  return rest;
}

/** An operation as JSON, for the arguments of an app step. */
export function entryJson(entry: UndoEntry): Json {
  return entry as unknown as Json;
}
