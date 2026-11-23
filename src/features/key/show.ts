/**
 * Feature: key.show
 *
 * The page of a keys tab: the keys of one database, or of one namespace of it, in a table that fills a page of the
 * scan at a time, with the pattern field, the type filter, **Scan more**, **Refresh**, **New key** and **More**.
 */
import type { Json } from '../../shared/engine-request';
import {
  run,
  type Answers,
  type AppStep,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId, type ConnectionId } from '../../shared/ids';
import type { TabShows } from '../../shared/state/tabs';
import { appPlan } from '../nav/types';
import { sameTab } from '../tab/open';
import { sizeText } from '../connection/overview';
import { expiryCellText } from './format-expiry';
import { pattern, type KeyPattern } from './pattern';
import type { ScanState } from './scan';
import { mostKeys, scannedAbout } from './scan';
import { selectedInOrder, type KeySelection } from './select';
import { headerSorts, sortedKeys, sortNotice, type KeySort, type SortColumn } from './sort';
import { text } from './text';
import type { KeyName, KeyType, TypeFilter } from './types';
import { argsOf, databaseName, hexOf, knownTypes, nameText, placeOf, separatorOf, typeLabel } from './types';

/** What `key.details` read of a key, kept for the tab until **Refresh**. */
export interface ReadDetails {
  /** The date of expiry; `null` for a persistent key. */
  readonly expiresAt: number | null;
  readonly size?: number;
  readonly gone?: boolean;
  /** Read before the scan started again: still shown, and read again once its row is on screen. */
  readonly stale?: boolean;
}

/** The last scan: what was typed, the pattern it gave, and the type. */
export interface LastScan {
  readonly typed: string;
  readonly pattern: KeyPattern;
  readonly type: TypeFilter;
}

/** A scan as the table draws it: its rows and what it was asked with. */
export interface ShownScan {
  readonly scan: ScanState;
  readonly last: LastScan;
}

/** What the page is drawn from. */
export interface KeysPageState {
  readonly connection: {
    readonly id: ConnectionId;
    readonly name: string;
    readonly readOnly: boolean;
    readonly connected: boolean;
  };
  readonly database: number;
  readonly namespace?: string;
  /** What the pattern field holds now: nothing is sent until `Enter`. */
  readonly field: string;
  readonly last: LastScan;
  /** The scan so far; absent until the first reply. */
  readonly scan?: ScanState;
  /** The scan before, still drawn while the new one has not given its first page: nothing blanks meanwhile. */
  readonly previous?: ShownScan;
  /** The server's message when the scan failed. */
  readonly error?: string;
  /** What `key.details` read, by name in hexadecimal. */
  readonly details: ReadonlyMap<string, ReadDetails>;
  /** The server refused `MEMORY USAGE`: every size is `—`. */
  readonly sizesRefused: boolean;
  readonly sort: KeySort;
  readonly selection: KeySelection;
  readonly now: number;
}

/** The pattern a tab starts with: the namespace's (`orders:*`), or an empty field for a database. */
export function startingField(namespace: string | undefined): string {
  return namespace === undefined ? '' : pattern({ kind: 'namespace', namespace }).pattern;
}

/** The last scan of a tab that starts: its field as the pattern, **All types** unless the tab kept another. */
export function startingScan(namespace: string | undefined, type: TypeFilter = 'all'): LastScan {
  const typed = startingField(namespace);
  return { typed, pattern: pattern({ kind: 'typed', text: typed }), type };
}

/** The arguments of `key.scan` for the scan of the page from a cursor: `0` for a new scan. */
export function scanArgsOf(state: KeysPageState, cursor: string): Json {
  return {
    connection: state.connection.id,
    database: state.database,
    pattern: state.last.pattern.pattern,
    type: state.last.type,
    cursor,
    ...(state.last.pattern.plain && cursor === '0' ? { plain: state.last.typed } : {}),
  };
}

/**
 * A control of the page, the feature it starts and its identifier; none for a control of another area's feature whose
 * card does not list the place yet (**Pin** in the menu of a row, **Connect** on the page).
 */
export interface PageControl {
  readonly label: string;
  readonly feature: string;
  readonly element?: string;
  readonly enabled?: boolean;
  readonly tooltip?: string;
}

/** A row of the table, as it is drawn. */
export interface KeyRow {
  readonly id: string;
  readonly name: KeyName;
  readonly key: string;
  readonly type: string;
  readonly expiry: string;
  readonly size: string;
  readonly gone: boolean;
  readonly selected: boolean;
  /** Whether `key.details` read it since the scan started: a row not read is read once it is on screen. */
  readonly read: boolean;
}

/** What the table shows in place of rows, or `rows`. */
export type TableState =
  | { readonly kind: 'not-connected'; readonly connect: PageControl }
  | { readonly kind: 'loading' }
  | { readonly kind: 'rows' }
  | { readonly kind: 'empty-database'; readonly text: string; readonly actions: readonly PageControl[] }
  | { readonly kind: 'no-match'; readonly text: string }
  | { readonly kind: 'none-yet'; readonly text: string; readonly scanMore: PageControl }
  | { readonly kind: 'error'; readonly text: string; readonly retry: PageControl };

/** The page. */
export interface KeysPageView {
  readonly toolbar: {
    readonly field: {
      readonly placeholder: string;
      readonly value: string;
      readonly sent?: string;
      readonly element: string;
    };
    readonly type: {
      readonly value: TypeFilter;
      readonly options: readonly { readonly value: TypeFilter; readonly label: string }[];
      readonly element: string;
    };
    readonly scanMore: PageControl;
    readonly refresh: PageControl;
    readonly newKey?: PageControl;
    readonly more: readonly PageControl[];
    readonly notice?: string;
  };
  readonly columns: readonly {
    readonly column: SortColumn;
    readonly label: string;
    readonly sorted?: KeySort;
    readonly tooltip?: string;
  }[];
  readonly rows: readonly KeyRow[];
  readonly table: TableState;
  /** A new scan has not given its first page yet: the table still shows the scan before. */
  readonly busy: boolean;
  /** What the status line counts. */
  readonly count: string;
  /** The entries of the context menu of a row, for one key. */
  readonly rowMenu: readonly PageControl[];
}

const control = (label: string, feature: string, element?: string, more: Partial<PageControl> = {}): PageControl => ({
  label,
  feature,
  ...(element === undefined ? {} : { element }),
  ...more,
});

function scanMoreControl(state: KeysPageState, element: string): PageControl {
  const complete = state.scan?.ended === 'complete';
  const full = (state.scan?.rows.length ?? 0) >= mostKeys;
  const tooltip = complete ? text.show.everyKey : full ? text.show.mostLoaded : undefined;
  return control(text.show.scanMore, 'key.scan', element, {
    enabled: state.scan?.ended === 'stopped' && !full,
    ...(tooltip === undefined ? {} : { tooltip }),
  });
}

function moreControls(readOnly: boolean): readonly PageControl[] {
  const exportKeys = control(text.show.exportKeys, 'key.export', 'key.export@toolbar');
  return readOnly
    ? [exportKeys]
    : [
        control(text.show.deleteByPattern, 'key.delete-by-pattern', 'key.delete-by-pattern@toolbar'),
        exportKeys,
        control(text.show.importKeys, 'key.import', 'key.import@toolbar'),
      ];
}

/** The context menu of a row, in order; without the entries of a write on a read-only connection. */
export function rowMenu(readOnly: boolean, hasExpiry: boolean): readonly PageControl[] {
  const menu = text.show.menu;
  const entries: readonly (PageControl | false)[] = [
    control(menu.open, 'key.open', 'key.open@row-menu'),
    !readOnly && control(menu.rename, 'key.rename', 'key.rename@row-menu'),
    !readOnly && control(menu.copy, 'key.copy', 'key.copy@row-menu'),
    !readOnly && control(menu.setExpiry, 'key.set-expiry', 'key.set-expiry@row-menu'),
    !readOnly && hasExpiry && control(menu.persist, 'key.persist', 'key.persist@row-menu'),
    control(menu.copyName, 'key.copy-name', 'key.copy-name@row-menu'),
    control(menu.export, 'key.export', 'key.export@row-menu'),
    control(menu.pin, 'nav.pin'),
    !readOnly && control(menu.delete, 'key.delete', 'key.delete@row-menu'),
  ];
  return entries.filter((entry): entry is PageControl => entry !== false);
}

function rowOf(state: KeysPageState, row: { name: KeyName; type?: KeyType; gone?: boolean }): KeyRow {
  const id = hexOf(row.name);
  const read = state.details.get(id);
  const gone = row.gone === true || read?.gone === true;
  const dash = text.expiry.none;
  return {
    id,
    name: row.name,
    key: nameText(row.name),
    type: gone ? dash : row.type === undefined ? '' : typeLabel(row.type),
    expiry: gone ? dash : read === undefined ? '' : expiryCellText(read.expiresAt ?? undefined, state.now),
    size: gone || state.sizesRefused ? dash : read?.size === undefined ? '' : sizeText(read.size),
    gone,
    selected: !gone && state.selection.keys.has(id),
    read: read !== undefined && read.stale !== true,
  };
}

/**
 * The state the table and the count are drawn from: while a new scan has not given its first page, the scan before
 * with what it was asked; the toolbar shows what is asked now.
 */
function drawnOf(state: KeysPageState): KeysPageState {
  return state.scan === undefined && state.previous !== undefined
    ? { ...state, scan: state.previous.scan, last: state.previous.last }
    : state;
}

/** Whether a new scan has not given its first page yet, and the table still shows the scan before. */
function busyOf(state: KeysPageState): boolean {
  return state.scan === undefined && state.previous !== undefined && state.error === undefined;
}

function sortedRows(state: KeysPageState): readonly KeyRow[] {
  const loaded = (state.scan?.rows ?? []).map((row) => {
    const read = state.details.get(hexOf(row.name));
    return {
      ...row,
      ...(read === undefined
        ? {}
        : { expiresAt: read.expiresAt, ...(read.size === undefined ? {} : { size: read.size }) }),
      gone: row.gone === true || read?.gone === true,
    };
  });
  const sorted = state.sort === undefined ? loaded : sortedKeys(loaded, state.sort.column, state.sort.direction);
  return sorted.map((row) => rowOf(state, row));
}

function tableState(state: KeysPageState, rows: number, busy: boolean): TableState {
  if (!state.connection.connected) {
    return {
      kind: 'not-connected',
      connect: control(text.show.connect, 'connection.connect'),
    };
  }
  if (state.error !== undefined) {
    return { kind: 'error', text: state.error, retry: control(text.show.retry, 'key.scan', 'key.scan@empty-state') };
  }
  const scan = state.scan;
  if (scan === undefined) {
    return { kind: 'loading' };
  }
  if (rows > 0) {
    return { kind: 'rows' };
  }
  if (scan.total === 0) {
    const actions = state.connection.readOnly
      ? []
      : [
          control(text.show.newKey, 'key.new', 'key.new@empty-state'),
          control(text.show.importKeys, 'key.import', 'key.import@empty-state'),
        ];
    return { kind: 'empty-database', text: text.show.emptyDatabase(databaseName(state.database)), actions };
  }
  if (scan.ended === 'complete') {
    const shown = state.last.pattern.pattern;
    return {
      kind: 'no-match',
      text:
        state.last.type === 'all'
          ? text.show.noMatch(shown)
          : text.show.noMatchOfType(typeLabel(state.last.type), shown),
    };
  }
  return {
    kind: 'none-yet',
    text: text.show.noneYet(scannedAbout(scan), scan.total ?? 0),
    scanMore: busy
      ? { ...scanMoreControl(state, 'key.scan@empty-state'), enabled: false }
      : scanMoreControl(state, 'key.scan@empty-state'),
  };
}

/** What the status line counts: **500 of 1,204,331 keys**, **1,204 keys**, **37 keys found · about …**, **37 of …**. */
export function countText(asked: KeysPageState): string {
  const state = drawnOf(asked);
  const scan = state.scan;
  if (scan === undefined) {
    return '';
  }
  const loaded = scan.rows.length;
  const total = scan.total ?? loaded;
  const complete = scan.ended === 'complete';
  const filtered = state.last.pattern.pattern !== '*' || state.last.type !== 'all';
  if (!filtered) {
    return complete ? text.show.countComplete(loaded) : text.show.countIncomplete(loaded, total);
  }
  return complete
    ? text.show.foundComplete(loaded, total)
    : text.show.foundIncomplete(loaded, scannedAbout(scan), total);
}

/** Feature: key.show — the toolbar, the table and what the status line counts, in each state of the page. */
export function view(state: KeysPageState): KeysPageView {
  const readOnly = state.connection.readOnly;
  const drawn = drawnOf(state);
  const busy = busyOf(state);
  const rows = sortedRows(drawn);
  const loaded = drawn.scan?.rows.length ?? 0;
  const notice = sortNotice(state.sort, loaded, drawn.scan?.ended === 'complete');
  const sent = state.last.pattern.plain && state.field === state.last.typed ? state.last.pattern.pattern : undefined;
  const columns: readonly SortColumn[] = ['key', 'type', 'expiry', 'size'];
  return {
    toolbar: {
      field: {
        placeholder: text.show.placeholder,
        value: state.field,
        ...(sent === undefined ? {} : { sent }),
        element: 'key.scan@toolbar',
      },
      type: {
        value: state.last.type,
        options: [
          { value: 'all', label: text.allTypes },
          ...knownTypes.map((type) => ({ value: type, label: typeLabel(type) })),
        ],
        element: 'key.scan@toolbar',
      },
      scanMore: scanMoreControl(state, 'key.scan@toolbar'),
      refresh: control(text.show.refresh, 'key.refresh', 'key.refresh@toolbar'),
      ...(readOnly ? {} : { newKey: control(text.show.newKey, 'key.new', 'key.new@toolbar') }),
      more: moreControls(readOnly),
      ...(notice === undefined ? {} : { notice }),
    },
    columns: columns.map((column) => {
      const sorts = headerSorts(column, loaded);
      return {
        column,
        label: text.show.columns[column],
        ...(state.sort?.column === column ? { sorted: state.sort } : {}),
        ...(sorts.tooltip === undefined
          ? column === 'size' && state.sizesRefused
            ? { tooltip: text.details.noSize }
            : {}
          : { tooltip: sorts.tooltip }),
      };
    }),
    rows,
    table: tableState(drawn, rows.length, busy),
    busy,
    count: countText(state),
    rowMenu: rowMenu(readOnly, true),
  };
}

/** The selected keys of the page, in the order of the table. */
export function selectedKeys(state: KeysPageState): readonly KeyName[] {
  return selectedInOrder(
    state.selection,
    sortedRows(drawnOf(state)).map((row) => row.name),
  );
}

/** The step that opens the keys tab of a database or a namespace, or makes the one open active as it is. */
function openStep(context: Context, shows: Extract<TabShows, { kind: 'keys' }>, connection: string): AppStep {
  const open = sameTab(context.state, shows);
  const words = [databaseName(shows.database), connection] as const;
  return open === undefined
    ? {
        kind: 'app',
        action: 'tab.open',
        args: { shows: shows as Json, background: false },
        text: text.show.step(...words),
      }
    : { kind: 'app', action: 'tab.activate', args: { tab: open.id }, text: text.show.activate(...words) };
}

/**
 * Feature: key.show. Opening the keys tab of `args.database` (or of the database of the target, `db0` for a
 * connection), of `args.namespace` when one is given; no step on the deployment. While the connection is not
 * connected the page offers **Connect**.
 */
function plan(context: Context, answers: Answers): Outcome {
  const place = placeOf(context, answers);
  if (place === undefined) {
    throw new Error('key.show needs a Redis connection.');
  }
  const args = argsOf(answers);
  const database = typeof args['database'] === 'number' ? args['database'] : place.database;
  const shows = {
    kind: 'keys' as const,
    connection: place.connection.id,
    database,
    separator: separatorOf(context),
    ...(place.namespace === undefined ? {} : { namespace: place.namespace }),
  };
  return run(appPlan(text.show.title, [openStep(context, shows, place.connection.name)]));
}

/** `key.show`, as the runner starts it: from the rail, Go to, a database of the scope bar. */
export const open: OperationFeature = { kind: 'operation', id: featureId('key.show'), plan };
