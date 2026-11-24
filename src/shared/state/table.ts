/**
 * The part of the app's state about what Datardo remembers of the columns of each collection (`table.columns`): the
 * layout (hidden, order, pinned, widths) and the expanded field paths, for a collection of a connection. They are
 * kept in `state/<connection id>.json` (data.md) and loaded when Datardo starts; `table.expand`, `table.collapse` and
 * `table.arrange-columns` change them through the action `table.save-columns`. It also holds the formatting rules of
 * conditional formatting and whether they are hidden, as `formatting.json` keeps them (`table.add-format-rule`,
 * `table.edit-format-rule`, `table.toggle-formatting`), loaded when Datardo starts.
 */
import { noFormatting, type StoredFormatting } from '../formatting-rules';
import type { ConnectionId } from '../ids';

/** The layout of the columns of a collection, as `table.layout` reads it. */
export interface RememberedLayout {
  readonly hidden?: readonly string[];
  readonly order?: readonly string[];
  readonly pinned?: readonly string[];
  readonly widths?: Readonly<Record<string, number>>;
}

/** What is remembered of the columns of one collection. */
export interface RememberedColumns {
  readonly layout: RememberedLayout;
  readonly expanded: readonly string[];
}

/** Nothing remembered: the natural layout, nothing expanded. */
export const nothingRemembered: RememberedColumns = { layout: {}, expanded: [] };

/** This part of the state: the columns remembered, by {@link columnsKey}. */
export interface TableState {
  readonly columns: Readonly<Record<string, RememberedColumns>>;
  /** Every formatting rule, by scope, and whether **Hide formatting** is on. */
  readonly formatting: StoredFormatting;
}

/** The key of a collection of a connection in {@link TableState.columns}. */
export function columnsKey(connection: string, database: string, collection: string): string {
  return JSON.stringify([connection, database, collection]);
}

/** What is remembered of the columns of a collection of a connection; nothing when nothing was. */
export function rememberedColumns(
  state: TableState,
  where: { readonly connection: string; readonly database: string; readonly collection: string },
): RememberedColumns {
  return state.columns[columnsKey(where.connection, where.database, where.collection)] ?? nothingRemembered;
}

/** The events of this part of the state. */
export type TableEvent =
  | {
      readonly slice: 'table';
      readonly type: 'columns-loaded';
      readonly connection: ConnectionId;
      /** By {@link columnsKey}, every key of that connection. */
      readonly columns: Readonly<Record<string, RememberedColumns>>;
    }
  | {
      readonly slice: 'table';
      readonly type: 'columns-saved';
      readonly key: string;
      readonly columns: RememberedColumns;
    }
  | { readonly slice: 'table'; readonly type: 'connection-forgotten'; readonly connection: ConnectionId }
  /** The formatting rules, or whether they are hidden, changed: everything `formatting.json` holds, as it is now. */
  | { readonly slice: 'table'; readonly type: 'formatting-changed'; readonly formatting: StoredFormatting };

/** Nothing loaded yet: no formatting rule, formatting shown. */
export const initialTableState: TableState = { columns: {}, formatting: { hidden: false, ...noFormatting } };

function connectionOfKey(key: string): string | undefined {
  const parsed: unknown = JSON.parse(key);
  return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : undefined;
}

function without(state: TableState, connection: ConnectionId): TableState['columns'] {
  return Object.fromEntries(Object.entries(state.columns).filter(([key]) => connectionOfKey(key) !== connection));
}

/** Changes this part of the state. */
export function reduceTable(state: TableState, event: TableEvent): TableState {
  switch (event.type) {
    case 'columns-loaded':
      return { ...state, columns: { ...without(state, event.connection), ...event.columns } };
    case 'columns-saved':
      return { ...state, columns: { ...state.columns, [event.key]: event.columns } };
    case 'connection-forgotten':
      return { ...state, columns: without(state, event.connection) };
    case 'formatting-changed':
      return { ...state, formatting: event.formatting };
  }
}
