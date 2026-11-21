/**
 * What the controls of a key tab's value start: the writes of a string and of a hash (`value.save-string`,
 * `value.add-field`, `value.edit-field`, `value.rename-field`, `value.remove-fields`), the removals of the other types
 * (`value.remove-elements`, `value.remove-members`, `value.remove-scored-members`, `value.delete-entries`), the writes
 * of a cell (`value.edit-element`, `value.change-score`), the writes that ask their own form (`value.push-element`,
 * `value.trim-list`, `value.add-member`, `value.add-scored-member`, `value.add-entry`, `value.trim-stream`),
 * `value.copy` and `value.refresh`, each through the bridge with the key as its target and what the window read as its
 * arguments. The window decides nothing about them (R10.7); it only says under the editor what a write refused or did
 * not save.
 */
import { shown, type Format } from '../../../features/value/format';
import type { TypedText } from '../../../features/value/typed-bytes';
import type { CopyAs } from '../../../features/value/copy';
import { rowName, sortedRows, type ValueRow } from '../../../features/value/show';
import { bytesShown } from '../../../features/value/read-string';
import { hashText, memberText } from '../../../features/value/text';
import { hexOf, isValueType, utf8, type ValueType } from '../../../features/value/types';
import type { IntentResult } from '../../../shared/bridge';
import type { Json } from '../../../shared/engine-request';
import { featureId, type Place } from '../../../shared/ids';
import { firstArg } from './value-pages';
import { keyTarget, messageOf } from './value-start';
import { changeValue, valueTabOf, type ValueTab } from './value-store';

/** Bytes as an argument: `{ hex }`. */
function hexJson(bytes: Uint8Array): Json {
  return { hex: hexOf(bytes) };
}

/** Where a control is; none for a command run from its key or from Go to. */
export type From = Place | undefined;

async function start(tab: ValueTab, feature: string, place: From, args: Json): Promise<IntentResult> {
  return window.datardo.start({
    feature: featureId(feature),
    target: keyTarget(tab.where),
    ...(place === undefined ? {} : { place }),
    args,
  });
}

/** The rows in the order of the table: those of a hash or a set sorted as the header says. */
export function rowsInOrder(tab: ValueTab): readonly ValueRow[] {
  return isValueType(tab.type) ? sortedRows(tab.type, tab.rows, tab.sort) : tab.rows;
}

/** The selected rows, in the order of the table. */
export function selectedRows(tab: ValueTab): readonly ValueRow[] {
  return rowsInOrder(tab).filter((row) => tab.selection.keys.has(hexOf(rowName(row))));
}

function cellBytes(row: ValueRow, column: string): Uint8Array {
  const cell = row.cells[column];
  return typeof cell === 'string' ? utf8(cell) : (cell ?? new Uint8Array());
}

/** The words of a row in the order of the type's command: a field and its value, a score and its member, … */
export function rowWords(type: ValueType, row: ValueRow): readonly Uint8Array[] {
  switch (type) {
    case 'hash':
      return [cellBytes(row, 'Field'), cellBytes(row, 'Value')];
    case 'list':
      return [cellBytes(row, 'Element')];
    case 'zset':
      return [cellBytes(row, 'Score'), cellBytes(row, 'Member')];
    case 'stream':
      return row.entry === undefined ? [] : [utf8(row.entry.id), ...row.entry.fields.flat()];
    case 'set':
      return [cellBytes(row, 'Member')];
    case 'string':
      return [];
  }
}

/** The bytes of a cell, as the item editor and **Copy** of a cell take them. */
export function cellOf(row: ValueRow, column: string): Uint8Array {
  return cellBytes(row, column);
}

/** The string as the editor holds it: the text typed, or the loaded bytes in the format shown. */
export function stringFormat(tab: ValueTab): Format {
  const load = tab.string ?? { length: 0, loaded: new Uint8Array() };
  return shown(bytesShown(load), tab.choices['value'], 'full').format;
}

/** What a save leaves under the editor; text typed after the save started stays, unsaved. */
function lineAfter(tab: string, result: IntentResult, saved: string): void {
  changeValue(tab, (now) => {
    if (result.kind === 'done') {
      const { draft, line: _line, ...rest } = now;
      return draft === saved || draft === undefined ? rest : { ...rest, draft };
    }
    if (result.kind === 'cancelled') {
      return { ...now, line: { kind: 'problem', text: hashText.notSaved } };
    }
    return { ...now, line: { kind: 'problem', text: messageOf(result) } };
  });
}

/** **Save** (`Ctrl+S`): the text in the editor, with the bytes it was loaded with (`value.save-string`). */
export async function saveString(tab: string, place: From = 'toolbar'): Promise<void> {
  const state = valueTabOf(tab);
  if (state?.string === undefined || state.draft === undefined) {
    return;
  }
  const { line: _line, ...rest } = state;
  changeValue(tab, () => rest);
  const result = await start(state, 'value.save-string', place, {
    loaded: hexJson(state.string.loaded),
    value: { text: state.draft, format: stringFormat(state) },
  });
  lineAfter(tab, result, state.draft);
}

/** **Revert**: the text typed is dropped, and the editor holds the value as loaded. */
export function revertString(tab: string): void {
  changeValue(tab, (now) => {
    const { draft: _draft, line: _line, ...rest } = now;
    return rest;
  });
}

/** **Refresh** (`F5`) and **Reload**: reads the value again, asking first when text typed is not saved. */
export async function refreshValue(tab: string, place: From = 'toolbar'): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  changeValue(tab, (now) => ({ ...now, ownRefresh: true }));
  const result = await start(state, 'value.refresh', place, state.draft === undefined ? null : { unsaved: true });
  if (result.kind !== 'done') {
    changeValue(tab, (now) => ({ ...now, ownRefresh: false }));
  }
}

/** **Copy** of the string: its value, its hexadecimal pairs, or the command that writes it. */
export async function copyString(tab: string, as: CopyAs, place: From = 'toolbar'): Promise<void> {
  const state = valueTabOf(tab);
  if (state?.string === undefined) {
    return;
  }
  await start(state, 'value.copy', place, {
    as,
    type: 'string',
    loaded: hexJson(state.string.loaded),
    length: state.string.length,
  });
}

/** **Copy** of a cell: the item as it reads, or in hexadecimal. */
export async function copyCell(tab: string, cell: Uint8Array, as: CopyAs, place: From): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  await start(state, 'value.copy', place, { as, type: state.type, cell: hexJson(cell) });
}

/** **Copy** and **Copy as command** of rows: the rows' cells, or the command that writes the key with only them. */
export async function copyRows(tab: string, rows: readonly ValueRow[], as: CopyAs, place: From): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined || !isValueType(state.type) || rows.length === 0) {
    return;
  }
  const type = state.type;
  const items = rows.map((row) => rowWords(type, row).map(hexJson));
  await start(state, 'value.copy', place, { as, type, items });
}

/** The 32 hexadecimal digits of the marker of `value.remove-elements`, drawn for each removal. */
function drawnMarker(): string {
  return hexOf(crypto.getRandomValues(new Uint8Array(16)));
}

/** The removal each type starts, with the rows as its arguments. */
function removalOf(type: string, rows: readonly ValueRow[]): readonly [string, Json] | undefined {
  const names = rows.map((row) => hexJson(rowName(row)));
  switch (type) {
    case 'hash':
      return ['value.remove-fields', { fields: names }];
    case 'list': {
      const elements = rows.map((row) => ({
        index: Number(row.cells['Index']),
        element: hexJson(cellBytes(row, 'Element')),
      }));
      return ['value.remove-elements', { elements, marker: drawnMarker() }];
    }
    case 'set':
      return ['value.remove-members', { members: names }];
    case 'zset':
      return ['value.remove-scored-members', { members: names }];
    case 'stream':
      return ['value.delete-entries', { ids: rows.map((row) => row.entry?.id ?? '') }];
    default:
      return undefined;
  }
}

/**
 * **Remove…** (**Delete entry…** of a stream): the fields, elements, members or entries of the rows, after the
 * confirmation (`value.remove-fields`, `value.remove-elements`, `value.remove-members`, `value.remove-scored-members`,
 * `value.delete-entries`).
 */
export async function removeRows(tab: string, rows: readonly ValueRow[], place: From): Promise<void> {
  const state = valueTabOf(tab);
  const removal = state === undefined || rows.length === 0 ? undefined : removalOf(state.type, rows);
  if (state !== undefined && removal !== undefined) {
    await start(state, removal[0], place, removal[1]);
  }
}

/** The writes of a toolbar that ask their own form, by the type of the value. */
export type FormWrite =
  | 'value.add-field'
  | 'value.push-element'
  | 'value.trim-list'
  | 'value.add-member'
  | 'value.add-scored-member'
  | 'value.add-entry'
  | 'value.trim-stream';

/**
 * **Push…**, **Trim…**, **Add member** or **Add entry**: the form of the write. A new entry of a stream read newest
 * first is the first row once it is read again, and is selected; **Add a copy…** gives the pairs of an entry.
 */
export async function startForm(
  tab: string,
  feature: FormWrite,
  place: From = 'toolbar',
  args: Json = null,
): Promise<void> {
  const state = valueTabOf(tab);
  if (state === undefined) {
    return;
  }
  const newestFirst = feature === 'value.add-entry' && firstArg(state, 'order') !== 'oldest';
  if (newestFirst) {
    changeValue(tab, (now) => ({ ...now, selectFirst: true }));
  }
  const result = await start(state, feature, place, args);
  if (newestFirst && result.kind !== 'done') {
    changeValue(tab, ({ selectFirst: _selectFirst, ...now }) => now);
  }
}

/** **Add field**: the form of `value.add-field`. */
export async function addField(tab: string, place: From = 'toolbar'): Promise<void> {
  await startForm(tab, 'value.add-field', place);
}

/** The write of the cell being edited, with what the window read of its row: the name, the bytes or score shown. */
function cellWrite(cell: string, row: ValueRow, typed: TypedText): readonly [string, Json] {
  const value = { text: typed.text, format: typed.format };
  switch (cell) {
    case 'name':
      return ['value.rename-field', { field: hexJson(rowName(row)), name: value }];
    case 'element':
      return [
        'value.edit-element',
        { index: Number(row.cells['Index']), loaded: hexJson(cellBytes(row, 'Element')), value },
      ];
    case 'score': {
      const score = row.cells['Score'];
      const loaded = typeof score === 'string' ? score : '';
      return ['value.change-score', { member: hexJson(cellBytes(row, 'Member')), loaded, score: typed.text }];
    }
    default:
      return ['value.edit-field', { field: hexJson(rowName(row)), loaded: hexJson(cellBytes(row, 'Value')), value }];
  }
}

/** What the editor says when the question **Overwrite** was closed; none for a write that asks no question. */
function notSavedOf(cell: string): string | undefined {
  if (cell === 'name' || cell === 'element') {
    return undefined;
  }
  return cell === 'score' ? memberText.notSavedScore : hashText.notSaved;
}

/**
 * **Save** of the item editor: the value of a field (`value.edit-field`), its name (`value.rename-field`), an element
 * (`value.edit-element`) or a score (`value.change-score`).
 */
export async function saveCell(tab: string, text: string, format: Format, place: From = 'editor'): Promise<void> {
  const state = valueTabOf(tab);
  const editing = state?.editing;
  const row = state?.rows.find((each) => hexOf(rowName(each)) === editing?.row);
  if (state === undefined || editing === undefined || row === undefined) {
    return;
  }
  const [feature, args] = cellWrite(editing.cell, row, { text, format });
  const result = await start(state, feature, place, args);
  changeValue(tab, (now) => {
    if (now.editing === undefined) {
      return now;
    }
    if (result.kind === 'done') {
      const { editing: _editing, ...rest } = now;
      return rest;
    }
    const { refused: _refused, ...open } = now.editing;
    const notSaved = notSavedOf(editing.cell);
    if (result.kind === 'cancelled' && notSaved === undefined) {
      return { ...now, editing: { ...open, typed: text } };
    }
    const refused = result.kind === 'cancelled' ? (notSaved ?? '') : messageOf(result);
    return { ...now, editing: { ...open, typed: text, refused } };
  });
}
