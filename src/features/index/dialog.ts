/**
 * Feature: index.dialog
 *
 * The dialog where an index is defined, as a form or as the keys and options `createIndex` takes, with the command and
 * what saving takes shown while editing. `index.create`, `index.duplicate` and `index.edit` ask through it. The texts
 * typed in mongosh syntax are held with what `query.parse` read of them (`TextInput`).
 */
import type { Json } from '../../shared/engine-request';
import { mongoshValue } from '../../shared/mongosh-value';
import { groupThousands } from '../../shared/text-units';
import {
  editableDefinition,
  generatedName,
  indexChange,
  indexName,
  normalized,
  ttlParts,
  ttlSeconds,
  type TtlUnit,
} from './change-plan';
import { indexCommand } from './command';
import { text } from './text';
import {
  emptyInput,
  inputOf,
  isDocument,
  jsonText,
  type IndexDefinition,
  type IndexList,
  type JsonDocument,
  type TextInput,
} from './types';
import { wildcardWarnings } from './wildcard-checks';

/** The directions and index types a field of the form takes, in the order of its list. */
export const fieldTypes = ['1', '-1', 'text', '2dsphere', '2d', 'hashed'] as const;

/** From this many documents, creating an index says that the build takes a while. */
export const largeCollection = 100_000;

/** The options with a control of their own in the form; the others go to **More options**. */
const formOptions = new Set(
  'name unique sparse hidden expireAfterSeconds partialFilterExpression collation weights default_language'.split(' '),
);

/** A row of **Fields**: the path, its direction or type, and the weight of a `text` field, as typed. */
export interface FieldRow {
  readonly field: string;
  readonly type: string;
  readonly weight: string;
}

/** An option of the form that is ticked and has a value typed in mongosh syntax. */
export interface TickedInput {
  readonly on: boolean;
  readonly input: TextInput;
}

/** The **Form** of the dialog. */
export interface IndexForm {
  readonly rows: readonly FieldRow[];
  readonly name: string;
  readonly unique: boolean;
  readonly sparse: boolean;
  readonly hidden: boolean;
  readonly ttl: { readonly on: boolean; readonly value: string; readonly unit: TtlUnit };
  readonly partial: TickedInput;
  readonly collation: TickedInput;
  readonly language: string;
  readonly more: TextInput;
}

/** Everything the dialog is drawn from. */
export interface IndexDialogState {
  readonly collection: string;
  /** The index being changed, as it is now; absent when creating one. */
  readonly editing?: { readonly name: string; readonly definition: IndexDefinition };
  readonly mode: 'form' | 'text';
  readonly form: IndexForm;
  readonly keys: TextInput;
  readonly options: TextInput;
  /** The indexes and the documents of the collection (`index.list`), for the note. */
  readonly list?: IndexList;
  /** The change is running. */
  readonly busy: boolean;
  /** The error of the last attempt, or of a switch of mode. */
  readonly error?: string;
}

/** What the dialog reads: a definition, or the message of what stops it. */
export type DefinitionRead =
  | { readonly kind: 'definition'; readonly definition: IndexDefinition }
  | { readonly kind: 'error'; readonly message: string };

const emptyRow: FieldRow = { field: '', type: '1', weight: '' };

/** An empty form, with one empty row. */
export const emptyForm: IndexForm = {
  rows: [emptyRow],
  name: '',
  unique: false,
  sparse: false,
  hidden: false,
  ttl: { on: false, value: '', unit: 'days' },
  partial: { on: false, input: emptyInput },
  collation: { on: false, input: emptyInput },
  language: '',
  more: emptyInput,
};

/** The input that shows a value in mongosh syntax. */
function shown(value: Json): TextInput {
  return inputOf(mongoshValue(value), value);
}

function ticked(value: Json | undefined): TickedInput {
  return isDocument(value) ? { on: true, input: shown(value) } : { on: false, input: emptyInput };
}

function textWeights(definition: IndexDefinition): JsonDocument | undefined {
  const weights = definition.options['weights'];
  const usable =
    isDocument(weights) &&
    Object.entries(weights).every(([field, weight]) => definition.keys[field] === 'text' && typeof weight === 'number');
  return usable ? weights : undefined;
}

/** What the form cannot show of the options: **More options**. */
function moreOf(options: JsonDocument, weights: JsonDocument | undefined): JsonDocument {
  const more: Record<string, Json> = {};
  for (const [option, value] of Object.entries(options)) {
    const shownByForm =
      formOptions.has(option) &&
      (['unique', 'sparse', 'hidden'].includes(option) ? typeof value === 'boolean' : true) &&
      (option === 'expireAfterSeconds' ? typeof value === 'number' : true) &&
      (['partialFilterExpression', 'collation'].includes(option) ? isDocument(value) : true) &&
      (option === 'weights' ? weights !== undefined : true) &&
      (['name', 'default_language'].includes(option) ? typeof value === 'string' : true);
    if (!shownByForm) {
      more[option] = value;
    }
  }
  return more;
}

/** The form showing a definition; `undefined` when a key is neither `1`, `-1` nor text. */
export function formOf(definition: IndexDefinition): IndexForm | undefined {
  const { keys, options } = definition;
  const entries = Object.entries(keys);
  if (!entries.every(([, value]) => value === 1 || value === -1 || typeof value === 'string')) {
    return undefined;
  }
  const weights = textWeights(definition);
  const ttl = options['expireAfterSeconds'];
  const parts = typeof ttl === 'number' ? ttlParts(ttl) : undefined;
  const more = moreOf(options, weights);
  const flag = (name: string): boolean => options[name] === true;
  return {
    rows:
      entries.length === 0
        ? [emptyRow]
        : entries.map(([field, type]) => ({ field, type: jsonText(type), weight: jsonText(weights?.[field] ?? '') })),
    name: typeof options['name'] === 'string' ? options['name'] : '',
    unique: flag('unique'),
    sparse: flag('sparse'),
    hidden: flag('hidden'),
    ttl: {
      on: parts !== undefined,
      value: parts === undefined ? '' : String(parts.value),
      unit: parts?.unit ?? 'days',
    },
    partial: ticked(options['partialFilterExpression']),
    collation: ticked(options['collation']),
    language: typeof options['default_language'] === 'string' ? options['default_language'] : '',
    more: Object.keys(more).length === 0 ? emptyInput : shown(more),
  };
}

/** The **Text** inputs showing a definition. */
export function textOf(definition: IndexDefinition): { readonly keys: TextInput; readonly options: TextInput } {
  const { keys, options } = definition;
  return {
    keys: Object.keys(keys).length === 0 ? emptyInput : shown(keys),
    options: Object.keys(options).length === 0 ? emptyInput : shown(options),
  };
}

/** An object of an input: `{}` when empty, or the message of a text that does not parse or is not an object. */
function objectOf(input: TextInput, name: string): JsonDocument | string {
  switch (input.parsed.kind) {
    case 'empty':
      return {};
    case 'invalid':
      return text.dialog.parseError(name, input.parsed.message);
    case 'value':
      return isDocument(input.parsed.value) ? input.parsed.value : text.dialog.notObject(name);
  }
}

function keysOfRows(rows: readonly FieldRow[]): { keys: JsonDocument; weights: JsonDocument } | string {
  const keys: Record<string, Json> = {};
  const weights: Record<string, Json> = {};
  for (const row of rows) {
    const field = row.field.trim();
    if (field === '') {
      continue;
    }
    if (field in keys) {
      return text.dialog.twice(field);
    }
    keys[field] = row.type === '1' || row.type === '-1' ? Number(row.type) : row.type;
    if (row.type === 'text' && row.weight.trim() !== '') {
      const weight = Number(row.weight);
      if (!Number.isInteger(weight) || weight < 1) {
        return text.dialog.weight(field);
      }
      weights[field] = weight;
    }
  }
  return Object.keys(keys).length === 0 ? text.dialog.noField : { keys, weights };
}

function ticks(form: IndexForm): JsonDocument | string {
  const ttl = Number(form.ttl.value);
  if (form.ttl.on && (form.ttl.value.trim() === '' || !Number.isInteger(ttl) || ttl < 0)) {
    return text.dialog.ttlWrong;
  }
  if (form.partial.on && form.partial.input.parsed.kind === 'empty') {
    return text.dialog.partialEmpty;
  }
  if (form.collation.on && form.collation.input.parsed.kind === 'empty') {
    return text.dialog.collationEmpty;
  }
  const partial = form.partial.on ? objectOf(form.partial.input, text.dialog.inputs.partial) : {};
  const collation = form.collation.on ? objectOf(form.collation.input, text.dialog.inputs.collation) : {};
  if (typeof partial === 'string' || typeof collation === 'string') {
    return typeof partial === 'string' ? partial : collation;
  }
  return {
    ...(form.ttl.on ? { expireAfterSeconds: ttlSeconds(ttl, form.ttl.unit) } : {}),
    ...(form.partial.on ? { partialFilterExpression: partial } : {}),
    ...(form.collation.on ? { collation } : {}),
  };
}

/** The definition the **Form** says, or what stops it. */
export function formDefinition(form: IndexForm): DefinitionRead {
  const fields = keysOfRows(form.rows);
  const more = objectOf(form.more, text.dialog.inputs.more);
  const ticked = typeof fields === 'string' || typeof more === 'string' ? undefined : ticks(form);
  const problem = [fields, more, ticked].find((each): each is string => typeof each === 'string');
  if (problem !== undefined || typeof fields === 'string' || typeof more === 'string' || !isDocument(ticked)) {
    return { kind: 'error', message: problem ?? text.dialog.noField };
  }
  const options: JsonDocument = {
    ...more,
    ...(form.name.trim() === '' ? {} : { name: form.name.trim() }),
    ...(form.unique ? { unique: true } : {}),
    ...(form.sparse ? { sparse: true } : {}),
    ...(form.hidden ? { hidden: true } : {}),
    ...ticked,
    ...(Object.keys(fields.weights).length === 0 ? {} : { weights: fields.weights }),
    ...(form.language.trim() === '' ? {} : { default_language: form.language.trim() }),
  };
  return { kind: 'definition', definition: { keys: fields.keys, options } };
}

/** The definition the **Text** says, or what stops it. */
export function textDefinition(keysInput: TextInput, optionsInput: TextInput): DefinitionRead {
  const keys = objectOf(keysInput, text.dialog.inputs.keys);
  const options = objectOf(optionsInput, text.dialog.inputs.options);
  if (typeof keys === 'string' || typeof options === 'string') {
    return { kind: 'error', message: typeof keys === 'string' ? keys : (options as string) };
  }
  return Object.keys(keys).length === 0
    ? { kind: 'error', message: text.dialog.noKeys }
    : { kind: 'definition', definition: { keys, options } };
}

/** Feature: index.dialog — the definition the dialog says now, in the mode it shows. */
export function dialogDefinition(state: IndexDialogState): DefinitionRead {
  return state.mode === 'form' ? formDefinition(state.form) : textDefinition(state.keys, state.options);
}

/** The dialog opened on a definition: in **Text** when the form cannot show its keys. */
export function openDialog(start: {
  readonly collection: string;
  readonly definition?: IndexDefinition;
  readonly editing?: { readonly name: string; readonly definition: IndexDefinition };
  readonly list?: IndexList;
}): IndexDialogState {
  const definition = start.definition ?? start.editing?.definition ?? { keys: {}, options: {} };
  const form = formOf(definition);
  const inputs = textOf(definition);
  return {
    collection: start.collection,
    ...(start.editing === undefined ? {} : { editing: start.editing }),
    mode: form === undefined ? 'text' : 'form',
    form: form ?? emptyForm,
    keys: inputs.keys,
    options: inputs.options,
    ...(start.list === undefined ? {} : { list: start.list }),
    busy: false,
  };
}

/** Feature: index.dialog — the dialog switched to **Form** or **Text**; it stays where it is, with the error, when it cannot. */
export function switchedMode(state: IndexDialogState, mode: 'form' | 'text'): IndexDialogState {
  const { error: _error, ...rest } = state;
  if (mode === state.mode || state.busy) {
    return state;
  }
  if (mode === 'text') {
    const read = formDefinition(state.form);
    const inputs = read.kind === 'definition' ? textOf(read.definition) : { keys: emptyInput, options: emptyInput };
    return { ...rest, mode, ...inputs };
  }
  const empty = state.keys.parsed.kind === 'empty' && state.options.parsed.kind === 'empty';
  const keys = objectOf(state.keys, text.dialog.inputs.keys);
  const options = objectOf(state.options, text.dialog.inputs.options);
  if (typeof keys === 'string' || typeof options === 'string') {
    return { ...state, error: typeof keys === 'string' ? keys : (options as string) };
  }
  const form = empty ? emptyForm : formOf({ keys, options });
  return form === undefined ? { ...state, error: text.dialog.textOnly } : { ...rest, mode, form };
}

/** Typing the value of **TTL** ticks it. */
export function withTtlTyped(form: IndexForm, value: string, unit: TtlUnit = form.ttl.unit): IndexForm {
  return { ...form, ttl: { on: true, value, unit } };
}

/** Typing the filter of **Partial**, or the value of **Collation**, ticks it. */
export function withTyped(form: IndexForm, option: 'partial' | 'collation', input: TextInput): IndexForm {
  return { ...form, [option]: { on: true, input } };
}

function creatingNote(state: IndexDialogState, definition: IndexDefinition): string | undefined {
  const indexes = state.list?.indexes ?? [];
  const name = indexName(definition);
  const keys = JSON.stringify(definition.keys);
  const named = indexes.find((index) => index.name === name);
  const same = indexes.find(
    (index) => JSON.stringify(editableDefinition(index.name, index.key, index.options).keys) === keys,
  );
  const documents = state.list?.totals.documents ?? 0;
  if (named !== undefined) {
    return text.dialog.named(named.name);
  }
  if (same !== undefined) {
    return text.dialog.sameKeys(same.name);
  }
  return documents >= largeCollection ? text.dialog.large(groupThousands(documents)) : undefined;
}

/** Feature: index.dialog — the note: what creating meets, or what saving the change takes. */
export function dialogNote(state: IndexDialogState, definition: IndexDefinition): string | undefined {
  if (state.editing === undefined) {
    return creatingNote(state, definition);
  }
  const change = indexChange(state.editing.definition, definition);
  switch (change.kind) {
    case 'none':
      return text.dialog.noChanges;
    case 'modify':
      return text.dialog.inPlace;
    case 'recreate':
      return text.dialog.rebuild(change.changed.join(', '));
  }
}

/** What the dialog answers when its main button is pressed: the normalized keys and options, read. */
export function dialogAnswers(state: IndexDialogState): Readonly<Record<string, Json>> | undefined {
  const read = dialogDefinition(state);
  if (read.kind === 'error') {
    return undefined;
  }
  const { keys, options } = normalized(read.definition);
  return { keys: { kind: 'value', value: keys }, options: { kind: 'value', value: options } };
}

/** The placeholder of **Name**: the name MongoDB would generate. */
export function namePlaceholder(read: DefinitionRead): string {
  return read.kind === 'definition' ? generatedName(read.definition.keys) : text.dialog.namePlaceholder;
}

/** The warnings of `index.wildcard-checks` for what the dialog says. */
export function dialogWarnings(read: DefinitionRead): readonly string[] {
  return read.kind === 'definition' ? wildcardWarnings(read.definition) : [];
}

/** The command of `index.command` for what the dialog says; empty while it cannot be read. */
export function dialogCommand(state: IndexDialogState, read: DefinitionRead): string {
  return read.kind === 'definition' ? indexCommand(state.collection, read.definition) : '';
}

/** A row of **Fields** as drawn: the weight only for a `text` field. */
export interface FieldRowView extends FieldRow {
  readonly types: readonly { readonly value: string; readonly label: string }[];
  readonly weighted: boolean;
}

/** What the dialog shows, from the top. */
export interface IndexDialogView {
  readonly title: string;
  readonly mode: 'form' | 'text';
  readonly rows: readonly FieldRowView[];
  readonly namePlaceholder: string;
  /** **Language** is shown only when a field is `text`. */
  readonly language: boolean;
  readonly command: string;
  readonly warnings: readonly string[];
  readonly note?: string;
  readonly error?: string;
  readonly copyEnabled: boolean;
  /** **Cancel**, or **Close** with its tooltip while the change runs. */
  readonly cancel: { readonly label: string; readonly hint?: string };
  /** **Create index** or **Save changes**, **Creating…** or **Saving…** while it runs; `Ctrl+Enter` does the same. */
  readonly main: { readonly label: string; readonly enabled: boolean };
  /** The form cannot be changed while the change runs. */
  readonly locked: boolean;
}

function rowView(row: FieldRow): FieldRowView {
  const types = [...new Set<string>([...fieldTypes, row.type])].map((value) => ({
    value,
    label: text.dialog.typeLabels[value] ?? value,
  }));
  return { ...row, types, weighted: row.type === 'text' };
}

/** Feature: index.dialog — what the dialog shows. */
export function view(state: IndexDialogState): IndexDialogView {
  const read = dialogDefinition(state);
  const note = read.kind === 'definition' ? dialogNote(state, read.definition) : undefined;
  const editing = state.editing;
  const unchanged = editing !== undefined && note === text.dialog.noChanges;
  const idle = editing === undefined ? text.create.button : text.edit.button;
  const busy = editing === undefined ? text.dialog.creating : text.dialog.saving;
  return {
    title: editing === undefined ? text.create.title(state.collection) : text.edit.title(editing.name),
    mode: state.mode,
    rows: state.form.rows.map(rowView),
    namePlaceholder: namePlaceholder(read),
    language: state.form.rows.some((row) => row.type === 'text'),
    command: dialogCommand(state, read),
    warnings: dialogWarnings(read),
    ...(note === undefined ? {} : { note }),
    ...(state.error === undefined ? {} : { error: state.error }),
    copyEnabled: read.kind === 'definition',
    cancel: state.busy ? { label: text.dialog.close, hint: text.dialog.closeHint } : { label: text.dialog.cancel },
    main: { label: state.busy ? busy : idle, enabled: !state.busy && !unchanged },
    locked: state.busy,
  };
}
