/**
 * Feature: value.item-editor — the editor that opens over a cell of a value's table, for one field's value or name,
 * one element or one score: the item whole, in the format `value.format` gives it (an item that is not text in
 * **Hex**, as pairs of digits), with the hint of its keys, or the problem of what is typed in its place. A long item,
 * or one of several lines, opens the same editor as a dialog.
 */
import { decidedFormat, hexPairs, shown, type Format } from './format';
import { viewText } from './text';
import { typedBytes } from './typed-bytes';
import type { ValueType } from './types';

/** The cells an editor opens on. */
export type EditedCell = 'value' | 'name' | 'element' | 'score';

/** An item longer than 200 characters (Datardo's choice), or of several lines, is edited in a dialog. */
export const longestInCell = 200;

/** What the editor is opened on and what has been typed in it. */
export interface ItemEditorState {
  readonly cell: EditedCell;
  /** The bytes of the item; for a score, its text as UTF-8. */
  readonly bytes: Uint8Array;
  /** The name of the item, for the dialog's title. */
  readonly name: string;
  readonly readOnly: boolean;
  /** The format chosen with **Text**, **JSON** or **Hex**; none for the one `value.format` decides. */
  readonly choice?: Format;
  /** The text in the editor, once the user typed. */
  readonly typed?: string;
  /** What the write refused, shown with the editor still open. */
  readonly refused?: string;
}

/** A control of the editor and the feature it starts, with its identifier. */
export interface EditorControl {
  readonly label: string;
  readonly feature: string;
  readonly element: string;
}

/** What the editor shows. */
export type ItemEditorView =
  | { readonly open: false }
  | {
      readonly open: true;
      readonly as: 'cell' | 'dialog';
      readonly title?: string;
      readonly format?: Format;
      /** The item as it opens, selected. */
      readonly text: string;
      /** **Text**, **JSON**, **Hex**; none for a score, which is typed as a number. */
      readonly formats: readonly EditorControl[];
      /** The hint of the keys, or what cannot be read or what the write refused, in its place. */
      readonly line: { readonly kind: 'hint' | 'problem'; readonly text: string };
      readonly save: EditorControl;
    };

/** The write of each cell, with the identifier of its control in the editor. */
const saves: Readonly<Record<EditedCell, EditorControl>> = {
  value: { label: viewText.save, feature: 'value.edit-field', element: 'value.edit-field@editor' },
  name: { label: viewText.save, feature: 'value.rename-field', element: 'value.rename-field@editor' },
  element: { label: viewText.save, feature: 'value.edit-element', element: 'value.edit-element@editor' },
  score: { label: viewText.save, feature: 'value.change-score', element: 'value.change-score@editor' },
};

const formats: readonly EditorControl[] = [
  { label: 'Text', feature: 'value.format', element: 'value.format@editor' },
  { label: 'JSON', feature: 'value.format', element: 'value.format@editor' },
  { label: 'Hex', feature: 'value.format', element: 'value.format@editor' },
];

/** The item as the editor opens it: hexadecimal as pairs of digits, text and JSON as `value.format` writes them. */
export function editorText(bytes: Uint8Array, format: Format): string {
  return format === 'hex' ? hexPairs(bytes) : shown(bytes, format, 'full').text;
}

/** Whether a cell of a table can be edited, and the tooltip of one that cannot. */
export function cellEditing(
  type: ValueType,
  column: string,
  readOnly: boolean,
): { readonly cell?: EditedCell; readonly tooltip?: string } {
  if (type === 'set') {
    return { tooltip: viewText.memberFixed };
  }
  if (type === 'stream') {
    return { tooltip: viewText.entryFixed };
  }
  if (readOnly) {
    return {};
  }
  const cells: Readonly<Record<string, EditedCell>> = {
    Field: 'name',
    Value: 'value',
    Element: 'element',
    Score: 'score',
  };
  const cell = cells[column];
  return cell === undefined ? {} : { cell };
}

/** Feature: value.item-editor — what the editor shows over a cell, or nothing on a read-only connection. */
export function view(state: ItemEditorState): ItemEditorView {
  if (state.readOnly) {
    return { open: false };
  }
  const format = state.cell === 'score' ? 'text' : (state.choice ?? decidedFormat(state.bytes));
  const text = editorText(state.bytes, format);
  const typed = state.typed ?? text;
  const read = state.cell === 'score' ? undefined : typedBytes(typed, format, state.bytes);
  const problem = state.refused ?? (read !== undefined && 'problem' in read ? read.problem : undefined);
  const long = Array.from(text).length > longestInCell || text.includes('\n');
  return {
    open: true,
    as: long ? 'dialog' : 'cell',
    ...(long ? { title: viewText.editDialog(state.name) } : {}),
    ...(state.cell === 'score' ? {} : { format }),
    text,
    formats: state.cell === 'score' ? [] : formats,
    line: problem === undefined ? { kind: 'hint', text: viewText.hint } : { kind: 'problem', text: problem },
    save: saves[state.cell],
  };
}
