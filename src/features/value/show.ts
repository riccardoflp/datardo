/**
 * Feature: value.show — what a key holds, with the view of its type: in short in the inspector island (the compact
 * form: the count and the first items, nothing that writes, **Open in a tab**), in full in the key tab (the toolbar of
 * the type, the editor of a string or the table of the other types, the selected item in the inspector island). The
 * key's own lines and toolbar are `key.inspect`'s.
 */
import { countText, firstItemsText } from './count';
import { shown, type Format, type Form, type Shown } from './format';
import { cellEditing, type EditedCell } from './item-editor';
import { bytesShown, canLoadWhole, isEditable, nextPart, stringNote, type StringLoad } from './read-string';
import { entryTime, fieldsLine, type StreamEntry } from './read-stream';
import { checkText, itemWords, viewText } from './text';
import { compactItems, filterPattern, isValueType, utf8, type ValueType } from './types';

/** A control of the view: its label, the feature it starts and its identifier, and its key when it has one. */
export interface Control {
  readonly label: string;
  readonly feature?: string;
  readonly element?: string;
  readonly key?: string;
}

/** A row of a value's table, as read: the cells' bytes by column, or their text for indexes, ranks and scores; an entry. */
export interface ValueRow {
  readonly cells: Readonly<Record<string, Uint8Array | string>>;
  readonly entry?: StreamEntry;
}

/** What the view of a key is given: the form, the key, what was read and what the user chose. */
export interface ValueState {
  readonly form: Form;
  /** The key's name as text. */
  readonly key: string;
  /** What `TYPE` answered: one of the six types, or a module's type. */
  readonly type: string;
  readonly readOnly: boolean;
  readonly status: 'loading' | 'ready' | 'gone' | 'error';
  readonly error?: string;
  /** The type the tab read before a refresh found another. */
  readonly was?: string;
  readonly unsaved?: boolean;
  readonly count?: number;
  /** A string as loaded. */
  readonly string?: StringLoad;
  /** The rows of the other types, as read, and whether **Load more** goes on. */
  readonly rows?: readonly ValueRow[];
  readonly more?: boolean;
  readonly filter?: string;
  /** Sorted sets: a range of scores is set, so there is no **Rank**. */
  readonly ranged?: boolean;
  /** Hashes: some field of the page has an expiry of its own (Redis 7.4 or later). */
  readonly fieldExpiry?: boolean;
  /** The column the loaded rows of a hash or a set are sorted by. */
  readonly sortedBy?: string;
  /** The format chosen for the string's editor, or for each column. */
  readonly choices?: Readonly<Record<string, Format>>;
  /** The index of the selected row. */
  readonly selected?: number;
}

/** A column of the table, and the editor its cells open, or the tooltip of a cell that cannot be changed. */
export interface Column {
  readonly name: string;
  readonly cell?: EditedCell;
  readonly tooltip?: string;
}

/** What the view shows. */
export interface ValueView {
  readonly status: ValueState['status'];
  /** *user:7 is now a list: it was a hash when this tab read it.* */
  readonly notice?: string;
  /** What is shown in the place of the value: the key gone, a module's type, an error, an empty value. */
  readonly message?: { readonly text: string; readonly actions: readonly Control[] };
  readonly count?: string;
  readonly toolbar: readonly Control[];
  readonly editor?: Shown & { readonly length: string; readonly note?: string; readonly more: readonly Control[] };
  readonly table?: {
    readonly columns: readonly Column[];
    readonly rows: readonly (readonly string[])[];
    readonly loadMore?: Control;
    readonly note?: string;
  };
  readonly openInTab?: Control;
  /** The inspector island of the key tab: the selected item in full, or **Nothing selected**. */
  readonly inspector?: { readonly title: string; readonly text: string };
}

/** The toolbar of each type, in the key tab; `writes` are hidden on a read-only connection. */
const toolbars: Readonly<Record<ValueType, readonly (Control & { readonly writes?: boolean })[]>> = {
  string: [
    { label: 'Text', feature: 'value.format', element: 'value.format@toolbar' },
    { label: 'JSON', feature: 'value.format', element: 'value.format@toolbar' },
    { label: 'Hex', feature: 'value.format', element: 'value.format@toolbar' },
    { label: 'Save', feature: 'value.save-string', element: 'value.save-string@toolbar', key: 'Ctrl+S', writes: true },
    { label: 'Revert', writes: true },
    { label: 'Copy', feature: 'value.copy', element: 'value.copy@toolbar' },
  ],
  hash: [
    { label: 'Filter fields', feature: 'value.read-hash', element: 'value.read-hash@toolbar' },
    { label: 'Add field', feature: 'value.add-field', element: 'value.add-field@toolbar', writes: true },
  ],
  list: [
    { label: 'From the head', feature: 'value.read-list', element: 'value.read-list@toolbar' },
    { label: 'From the tail', feature: 'value.read-list', element: 'value.read-list@toolbar' },
    { label: 'Go to index', feature: 'value.read-list', element: 'value.read-list@toolbar' },
    { label: 'Push…', feature: 'value.push-element', element: 'value.push-element@toolbar', writes: true },
    { label: 'Trim…', feature: 'value.trim-list', element: 'value.trim-list@toolbar', writes: true },
  ],
  set: [
    { label: 'Filter members', feature: 'value.read-set', element: 'value.read-set@toolbar' },
    { label: 'Add member', feature: 'value.add-member', element: 'value.add-member@toolbar', writes: true },
  ],
  zset: [
    { label: 'Lowest first', feature: 'value.read-sorted-set', element: 'value.read-sorted-set@toolbar' },
    { label: 'Highest first', feature: 'value.read-sorted-set', element: 'value.read-sorted-set@toolbar' },
    { label: 'Min score', feature: 'value.read-sorted-set', element: 'value.read-sorted-set@toolbar' },
    { label: 'Max score', feature: 'value.read-sorted-set', element: 'value.read-sorted-set@toolbar' },
    {
      label: 'Add member',
      feature: 'value.add-scored-member',
      element: 'value.add-scored-member@toolbar',
      writes: true,
    },
  ],
  stream: [
    { label: 'Newest first', feature: 'value.read-stream', element: 'value.read-stream@toolbar' },
    { label: 'Oldest first', feature: 'value.read-stream', element: 'value.read-stream@toolbar' },
    { label: 'From', feature: 'value.read-stream', element: 'value.read-stream@toolbar' },
    { label: 'To', feature: 'value.read-stream', element: 'value.read-stream@toolbar' },
    { label: 'Add entry', feature: 'value.add-entry', element: 'value.add-entry@toolbar', writes: true },
    { label: 'Trim…', feature: 'value.trim-stream', element: 'value.trim-stream@toolbar', writes: true },
  ],
};

/** **Load more** under each table. */
const loadMores: Readonly<Record<ValueType, Control>> = {
  string: { label: viewText.loadMore, feature: 'value.read-string', element: 'value.read-string@toolbar' },
  hash: { label: viewText.loadMore, feature: 'value.read-hash', element: 'value.read-hash@table' },
  list: { label: viewText.loadMore, feature: 'value.read-list', element: 'value.read-list@table' },
  set: { label: viewText.loadMore, feature: 'value.read-set', element: 'value.read-set@table' },
  zset: { label: viewText.loadMore, feature: 'value.read-sorted-set', element: 'value.read-sorted-set@table' },
  stream: { label: viewText.loadMore, feature: 'value.read-stream', element: 'value.read-stream@table' },
};

/** The bytes a row is known by, which the selection keeps: a field's name, a member, an index, an entry's ID. */
export function rowName(row: ValueRow): Uint8Array {
  if (row.entry !== undefined) {
    return utf8(row.entry.id);
  }
  const first = row.cells['Field'] ?? row.cells['Member'] ?? row.cells['Index'] ?? '';
  return typeof first === 'string' ? utf8(first) : first;
}

function compared(one: Uint8Array | string | undefined, other: Uint8Array | string | undefined): number {
  const left = typeof one === 'string' ? utf8(one) : (one ?? new Uint8Array());
  const right = typeof other === 'string' ? utf8(other) : (other ?? new Uint8Array());
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

/**
 * The loaded rows of a hash or a set sorted by a click on a column header: by the bytes of the column, compared one
 * by one (the order of the characters for UTF-8 text), lowest first or highest first. The other types keep their own
 * order.
 */
export function sortedRows(
  type: ValueType,
  rows: readonly ValueRow[],
  sort: { readonly column: string; readonly order: 'ascending' | 'descending' } | undefined,
): readonly ValueRow[] {
  if (sort === undefined || (type !== 'hash' && type !== 'set')) {
    return rows;
  }
  const sign = sort.order === 'ascending' ? 1 : -1;
  return [...rows].sort((one, other) => sign * compared(one.cells[sort.column], other.cells[sort.column]));
}

/** The columns of each type's table. */
export function columnsOf(type: ValueType, state: Pick<ValueState, 'ranged' | 'fieldExpiry'>): readonly string[] {
  switch (type) {
    case 'string':
      return [];
    case 'hash':
      return state.fieldExpiry === true ? ['Field', 'Value', 'Expiry'] : ['Field', 'Value'];
    case 'list':
      return ['Index', 'Element'];
    case 'set':
      return ['Member'];
    case 'zset':
      return state.ranged === true ? ['Member', 'Score'] : ['Rank', 'Member', 'Score'];
    case 'stream':
      return ['ID', 'Time', 'Fields'];
  }
}

function cellText(value: Uint8Array | string | undefined, choice: Format | undefined): string {
  if (value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : shown(value, choice, 'compact').text;
}

/** A row of a stream as its cells: the ID, the time, and the pairs on one line. */
function streamCells(row: ValueRow): readonly string[] {
  const id = row.entry?.id ?? '';
  return [id, entryTime(id), row.entry === undefined ? '' : fieldsLine(row.entry)];
}

function rowCells(type: ValueType, columns: readonly string[], row: ValueRow, state: ValueState): readonly string[] {
  return type === 'stream'
    ? streamCells(row)
    : columns.map((column) => cellText(row.cells[column], state.choices?.[column]));
}

function inspectorOf(type: ValueType, state: ValueState): ValueView['inspector'] {
  if (state.form === 'compact' || type === 'string') {
    return undefined;
  }
  const row = state.selected === undefined ? undefined : state.rows?.[state.selected];
  if (row === undefined) {
    return { title: viewText.nothingSelected, text: viewText.selectRow };
  }
  const columns = columnsOf(type, state);
  const main = type === 'hash' ? 'Value' : type === 'list' ? 'Element' : 'Member';
  const value = row.cells[main];
  const title = cellText(row.cells[columns[0] ?? ''], undefined);
  if (type === 'stream') {
    const lines = (row.entry?.fields ?? []).map(
      ([name, each]) => `${shown(name, undefined, 'compact').text}=${shown(each, undefined, 'full').text}`,
    );
    return { title: streamCells(row)[0] ?? '', text: lines.join('\n') };
  }
  return {
    title,
    text: value instanceof Uint8Array ? shown(value, state.choices?.[main], 'full').text : (value ?? ''),
  };
}

function stringView(state: ValueState, base: ValueView): ValueView {
  const load = state.string ?? { length: 0, loaded: new Uint8Array() };
  const bytes = bytesShown(load);
  const value = shown(bytes, state.choices?.['value'], state.form);
  const note = stringNote(load, state.form);
  const more: Control[] =
    state.form === 'full' && nextPart(load) !== undefined
      ? [
          loadMores.string,
          ...(canLoadWhole(load)
            ? [{ label: viewText.loadWhole, feature: 'value.read-string', element: 'value.read-string@toolbar' }]
            : []),
        ]
      : [];
  const editor = {
    ...value,
    editable: value.editable && isEditable(load) && !state.readOnly,
    length: viewText.bytesLong(countText('string', load.length).replace(/ \S+$/u, '')),
    ...(note === undefined ? {} : { note }),
    more,
  };
  return load.length === 0 ? { ...base, message: { text: viewText.emptyString, actions: [] } } : { ...base, editor };
}

function tableNote(type: ValueType, state: ValueState): string | undefined {
  const [, many] = itemWords[type];
  if (state.form === 'compact') {
    return firstItemsText(type, Math.min(compactItems, state.rows?.length ?? 0), state.count ?? 0);
  }
  return state.sortedBy !== undefined && state.more === true
    ? viewText.sortedAmong(state.rows?.length ?? 0, many)
    : undefined;
}

function emptyMessage(type: ValueType, state: ValueState): string | undefined {
  if ((state.rows?.length ?? 0) > 0) {
    return undefined;
  }
  const pattern = filterPattern(state.filter ?? '');
  if (pattern !== undefined) {
    return viewText.noMatch(itemWords[type][1], pattern);
  }
  return type === 'stream' ? viewText.noEntries : undefined;
}

function tableView(type: ValueType, state: ValueState, base: ValueView): ValueView {
  const names = columnsOf(type, state);
  const columns = names.map((name) => ({
    name,
    ...cellEditing(type, name, state.readOnly || state.form === 'compact'),
  }));
  const rows = (state.form === 'compact' ? (state.rows ?? []).slice(0, compactItems) : (state.rows ?? [])).map((row) =>
    rowCells(type, names, row, state),
  );
  const note = tableNote(type, state);
  const empty = emptyMessage(type, state);
  const loadMore = state.form === 'full' && state.more === true ? { loadMore: loadMores[type] } : {};
  const inspector = inspectorOf(type, state);
  return {
    ...base,
    ...(empty === undefined ? {} : { message: { text: empty, actions: state.more === true ? [loadMores[type]] : [] } }),
    table: { columns, rows, ...loadMore, ...(note === undefined ? {} : { note }) },
    ...(inspector === undefined ? {} : { inspector }),
  };
}

function stateMessage(state: ValueState): ValueView['message'] {
  if (state.status === 'gone') {
    const close: Control[] = state.form === 'full' ? [{ label: viewText.closeTab, feature: 'tab.close' }] : [];
    return { text: checkText.gone(state.key), actions: close };
  }
  if (state.status === 'error') {
    return { text: state.error ?? '', actions: [{ label: viewText.retry, feature: 'value.refresh' }] };
  }
  if (state.status === 'ready' && !isValueType(state.type)) {
    return {
      text: viewText.moduleType(state.type),
      actions: [{ label: viewText.openConsole, feature: 'console.show' }],
    };
  }
  return undefined;
}

/** Feature: value.show — what the inspector island (compact) or the key tab (full) shows of the value of a key. */
export function view(state: ValueState): ValueView {
  const message = stateMessage(state);
  const type = state.type;
  if (message !== undefined || state.status === 'loading' || !isValueType(type)) {
    return { status: state.status, toolbar: [], ...(message === undefined ? {} : { message }) };
  }
  const changed = state.was !== undefined && state.was !== type;
  const reload: Control[] =
    changed && state.unsaved === true ? [{ label: viewText.reload, feature: 'value.refresh' }] : [];
  const toolbar =
    state.form === 'compact' ? [] : toolbars[type].filter((control) => !(state.readOnly && control.writes === true));
  const base: ValueView = {
    status: state.status,
    toolbar: [...toolbar.map(({ writes: _writes, ...control }) => control), ...reload],
    ...(changed ? { notice: checkText.typeChangedNotice(state.key, type, state.was) } : {}),
    ...(state.count === undefined ? {} : { count: countText(type, state.count) }),
    ...(state.form === 'compact'
      ? { openInTab: { label: viewText.openInTab, feature: 'key.open', element: 'key.open@inspector' } }
      : {}),
  };
  return type === 'string' ? stringView(state, base) : tableView(type, state, base);
}
