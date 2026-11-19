/**
 * Feature: query.builder
 *
 * Builds the filter from rows of a field, an operator and a value, for whoever does not want to write mongosh syntax.
 * The rows and the text of **Filter** follow each other: rows typed write the filter (`query.builder-filter`), a filter
 * typed, dropped or loaded gives the rows (`query.builder-rows`).
 */
import {
  builderOperators,
  builderTypes,
  filterOfRows,
  isComplete,
  takesNoValue,
  type BuilderOperator,
  type BuilderRow,
  type Combine,
} from './builder-filter';
import { rowsOfFilter } from './builder-rows';
import type { FieldHint } from './field-hints';
import { formattedValue } from './format';
import { parsedValue } from './parse';
import { text } from './text';

/** A row with nothing in it, the operator `=`. */
export const emptyRow: BuilderRow = { field: '', operator: 'eq', value: '' };

/** The rows of the builder, and why they cannot be shown when they cannot. */
export interface BuilderRows {
  readonly combine: Combine;
  readonly rows: readonly BuilderRow[];
  /** The rows say the filter; when not, the builder shows no rows and this note. */
  readonly note?: string;
  /** **+ Condition** and the choice of *all* or *any* are disabled. */
  readonly locked: boolean;
}

/**
 * The rows of the builder for the text of **Filter**: its rows, then the rows still being filled in; one empty row
 * for an empty filter; no rows and a note for a filter with a syntax error or one rows cannot say.
 */
export function rowsOfText(written: string, kept: readonly BuilderRow[], now = 0): BuilderRows {
  const pending = kept.filter((row) => !isComplete(row));
  if (written.trim() === '') {
    return { combine: 'all', rows: pending.length === 0 ? [emptyRow] : pending, locked: false };
  }
  const parsed = parsedValue(written, now, () => '000000000000000000000000');
  if (!parsed.ok) {
    return { combine: 'all', rows: [], note: text.builder.syntaxNote, locked: true };
  }
  const found = rowsOfFilter(parsed.value);
  if (found === undefined) {
    return { combine: 'all', rows: [], note: text.builder.cannotShowNote, locked: false };
  }
  return { combine: found.combine, rows: [...found.rows, ...pending], locked: false };
}

/** What a change of the rows writes in **Filter**: the new text, or the note of a value that does not fit. */
export function textOfRows(
  rows: readonly BuilderRow[],
  combine: Combine,
  now = 0,
): { readonly text: string } | { readonly note: string } {
  const result = filterOfRows(rows, combine, now);
  return result.ok ? { text: result.text } : { note: result.error };
}

/** A row with another operator: `type` puts `string`, `exists` and `missing` remove the value, leaving `type` empties it. */
export function withOperator(row: BuilderRow, operator: BuilderOperator): BuilderRow {
  if (operator === 'type') {
    return { ...row, operator, value: row.operator === 'type' ? row.value : 'string' };
  }
  if (takesNoValue(operator) || row.operator === 'type') {
    return { ...row, operator, value: '' };
  }
  return { ...row, operator };
}

/** **Clear**: no rows but one empty row, and an empty **Filter**; the query is not run. */
export function cleared(): { readonly rows: readonly BuilderRow[]; readonly text: string } {
  return { rows: [emptyRow], text: '' };
}

/** The control of the value of a row. */
export type ValueControl =
  | { readonly kind: 'none' }
  | { readonly kind: 'types'; readonly value: string; readonly options: readonly string[] }
  | {
      readonly kind: 'text';
      readonly value: string;
      readonly placeholder: string;
      readonly suggestions: readonly string[];
    };

/** A row as the builder draws it. */
export interface RowView {
  readonly field: {
    readonly value: string;
    readonly name: string;
    readonly placeholder: string;
    readonly suggestions: readonly string[];
  };
  readonly operator: {
    readonly value: BuilderOperator;
    readonly name: string;
    readonly options: readonly { readonly operator: BuilderOperator; readonly label: string; readonly tip: string }[];
  };
  readonly value: ValueControl & { readonly name: string };
  readonly remove: { readonly tip: string; readonly element: string };
  /** A row without a field, or without a value its operator needs: dashed, not part of the filter. */
  readonly dashed: boolean;
}

/** What the builder shows. */
export interface BuilderView {
  readonly element: string;
  readonly head: {
    readonly match: string;
    readonly combine: Combine;
    readonly choices: readonly { readonly combine: Combine; readonly label: string }[];
    readonly ofThese: string;
    readonly add: {
      readonly label: string;
      readonly tip: string;
      readonly disabled: boolean;
      readonly element: string;
    };
    readonly clear: { readonly label: string; readonly tip: string; readonly element: string };
    readonly disabled: boolean;
  };
  readonly rows: readonly RowView[];
  readonly note?: string;
}

/** What the builder is drawn from. */
export interface BuilderState {
  readonly rows: BuilderRows;
  readonly fields: readonly FieldHint[];
  /** The note of the last change of the rows, such as *tags: size needs a whole number*. */
  readonly note?: string;
}

const operatorOptions = builderOperators.map((operator) => ({ operator, ...text.builder.operators[operator] }));

function placeholderOf(operator: BuilderOperator): string {
  switch (operator) {
    case 'in':
    case 'nin':
      return text.builder.listPlaceholder;
    case 'regex':
      return text.builder.regexPlaceholder;
    case 'size':
      return text.builder.sizePlaceholder;
    case 'eq':
    case 'exists':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'missing':
    case 'ne':
    case 'type':
      return text.builder.valuePlaceholder;
  }
}

function valueOf(row: BuilderRow, fields: readonly FieldHint[]): ValueControl {
  if (takesNoValue(row.operator)) {
    return { kind: 'none' };
  }
  if (row.operator === 'type') {
    return { kind: 'types', value: row.value, options: builderTypes };
  }
  const hint = fields.find((each) => each.path === row.field.trim());
  return {
    kind: 'text',
    value: row.value,
    placeholder: placeholderOf(row.operator),
    suggestions: (hint?.values ?? []).map((each) => formattedValue(each.value)),
  };
}

function rowView(row: BuilderRow, index: number, fields: readonly FieldHint[]): RowView {
  const number = index + 1;
  return {
    field: {
      value: row.field,
      name: text.builder.fieldName(number),
      placeholder: text.builder.fieldPlaceholder,
      suggestions: fields.map((each) => each.path),
    },
    operator: { value: row.operator, name: text.builder.operatorName(number), options: operatorOptions },
    value: { ...valueOf(row, fields), name: text.builder.valueName(number) },
    remove: { tip: text.builder.removeTip, element: 'query.builder@query-bar' },
    dashed: !isComplete(row),
  };
}

/**
 * Feature: query.builder
 *
 * The head (**Match** *all* or *any* **of these conditions**, **+ Condition**, **Clear**), one row per condition with its
 * field, operator and value, and the note when there is something to say.
 */
export function view(state: BuilderState): BuilderView {
  const { rows } = state;
  const note = state.note ?? rows.note;
  return {
    element: 'query.builder@query-bar',
    head: {
      match: text.builder.match,
      combine: rows.combine,
      choices: [
        { combine: 'all', label: text.builder.all },
        { combine: 'any', label: text.builder.any },
      ],
      ofThese: text.builder.ofThese,
      add: {
        label: text.builder.addCondition,
        tip: text.builder.addConditionTip,
        disabled: rows.locked,
        element: 'query.builder@query-bar',
      },
      clear: { label: text.builder.clear, tip: text.builder.clearTip, element: 'query.builder@query-bar' },
      disabled: rows.locked,
    },
    rows: rows.rows.map((row, index) => rowView(row, index, state.fields)),
    ...(note === undefined ? {} : { note }),
  };
}
