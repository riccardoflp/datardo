/**
 * Feature: index.search-dialog
 *
 * The dialog where a search index is named and defined: the definition as text, with a form above it that follows
 * what is typed and rewrites the parts of it that it shows. `index.create-search` and `index.edit-search` ask through
 * it. The text typed is read by `query.parse` in the window and arrives here as `ParsedText`.
 */
import type { Json } from '../../shared/engine-request';
import { mongoshValue } from '../../shared/mongosh-value';
import type { Question } from '../../shared/question';
import { stable } from './change-plan';
import { searchIndexCommand } from './command';
import { defaultSearchNames } from './search-checks';
import {
  dynamicDefinition,
  mappedPaths,
  quantizations,
  searchFieldTypes,
  similarities,
  staticDefinition,
  vectorForm,
  withFieldMapped,
  withVectorForm,
  type VectorForm,
} from './search-form';
import { mappedFields } from './search-summary';
import { text } from './text';
import {
  inputOf,
  isDocument,
  type JsonDocument,
  type SampledField,
  type SearchIndexList,
  type SearchIndexType,
  type TextInput,
} from './types';

/** The BSON types of the fields `$vectorSearch` can pre-filter on. */
const filterTypes = new Set(['string', 'int', 'long', 'double', 'decimal', 'bool', 'date', 'objectId', 'binData']);

/** The index being edited: its name and type cannot change. */
export interface EditedSearchIndex {
  readonly name: string;
  readonly type: SearchIndexType;
  readonly definition: JsonDocument;
}

/** What the search index dialog holds. */
export interface SearchDialogState {
  readonly collection: string;
  readonly editing?: EditedSearchIndex;
  readonly name: string;
  readonly type: SearchIndexType;
  readonly definition: TextInput;
  /** What was written for the other type, put back when switching to it again. */
  readonly kept: Partial<Readonly<Record<SearchIndexType, TextInput>>>;
  /** The sampled fields; `undefined` before the sample has arrived. */
  readonly fields?: readonly SampledField[];
  /** Whether the user typed the dimensions: until then they follow the longest sampled array of the path. */
  readonly dimensionsTyped: boolean;
  readonly searchIndexes?: SearchIndexList;
  readonly busy: boolean;
  /** The error of the last attempt, or of a change through the form while the definition does not parse. */
  readonly error?: string;
}

function shown(definition: JsonDocument): TextInput {
  return inputOf(mongoshValue(definition), definition);
}

/** The arrays of numbers among the sampled fields. */
export function vectorPaths(fields: readonly SampledField[] | undefined): readonly SampledField[] {
  return (fields ?? []).filter((field) => field.vector !== undefined);
}

/** Feature: index.search-dialog — the template of a type: dynamic mapping, or a vector field on the first array found. */
export function template(type: SearchIndexType, fields: readonly SampledField[] | undefined): JsonDocument {
  if (type === 'search') {
    return dynamicDefinition();
  }
  const first = vectorPaths(fields)[0];
  return withVectorForm(
    {},
    {
      path: first?.path ?? '',
      ...(first?.vector === undefined ? {} : { numDimensions: first.vector.max }),
      similarity: 'cosine',
      quantization: 'none',
      filters: [],
    },
  );
}

/** Feature: index.search-dialog — the dialog to create a search index, or to change the definition of one. */
export function openSearchDialog(start: {
  readonly collection: string;
  readonly editing?: EditedSearchIndex;
  readonly fields?: readonly SampledField[];
  readonly searchIndexes?: SearchIndexList;
}): SearchDialogState {
  const { collection, editing, fields, searchIndexes } = start;
  const type = editing?.type ?? 'search';
  return {
    collection,
    ...(editing === undefined ? {} : { editing }),
    name: editing?.name ?? '',
    type,
    definition: shown(editing?.definition ?? template(type, fields)),
    kept: {},
    ...(fields === undefined ? {} : { fields }),
    dimensionsTyped: false,
    ...(searchIndexes === undefined ? {} : { searchIndexes }),
    busy: false,
  };
}

/** The sampled fields arrived: a new vector index without a path takes the first array of numbers found. */
export function withFields(state: SearchDialogState, fields: readonly SampledField[]): SearchDialogState {
  const next = { ...state, fields };
  const typed = typedDefinition(state);
  const untouched =
    state.editing === undefined && typed !== undefined && stable(typed) === stable(template(state.type, undefined));
  return untouched ? { ...next, definition: shown(template(state.type, fields)) } : next;
}

/** Feature: index.search-dialog — the other type: what was written for each is kept and put back. */
export function switchedType(state: SearchDialogState, type: SearchIndexType): SearchDialogState {
  if (state.editing !== undefined || type === state.type) {
    return state;
  }
  const { error: _error, ...rest } = state;
  return {
    ...rest,
    type,
    definition: state.kept[type] ?? shown(template(type, state.fields)),
    kept: { ...state.kept, [state.type]: state.definition },
  };
}

/** What was typed in **Definition**, as `query.parse` read it. */
export function withDefinitionTyped(state: SearchDialogState, definition: TextInput): SearchDialogState {
  const { error: _error, ...rest } = state;
  return { ...rest, definition };
}

/** The definition typed when it is an object, the form can then change it. */
export function typedDefinition(state: SearchDialogState): JsonDocument | undefined {
  const { parsed } = state.definition;
  return parsed.kind === 'value' && isDocument(parsed.value) ? parsed.value : undefined;
}

/**
 * Feature: index.search-dialog — a change through the form, written into the definition; while the definition does
 * not parse it changes nothing and says *Fix the definition before changing it with the form: …*.
 */
export function changedByForm(
  state: SearchDialogState,
  change: (definition: JsonDocument) => JsonDocument,
): SearchDialogState {
  const definition = typedDefinition(state);
  if (definition === undefined) {
    const { parsed } = state.definition;
    const message = parsed.kind === 'invalid' ? parsed.message : text.search.notAnObject;
    return { ...state, error: text.searchDialog.fixFirst(message) };
  }
  return withDefinitionTyped(state, shown(change(definition)));
}

/** **Dynamic mapping** or **Static mappings**: the definition replaced with the template. */
export function withMapping(state: SearchDialogState, mapping: 'dynamic' | 'static'): SearchDialogState {
  return changedByForm(state, () =>
    mapping === 'dynamic' ? dynamicDefinition() : staticDefinition(state.fields ?? []),
  );
}

/** A box of **Fields** ticked or unticked. */
export function withFieldTicked(state: SearchDialogState, path: string, on: boolean): SearchDialogState {
  return changedByForm(state, (definition) => withFieldMapped(definition, path, on, state.fields ?? []));
}

/** The vector part of the form changed; a new path takes its dimensions until the user typed some. */
export function withVector(
  state: SearchDialogState,
  change: Partial<VectorForm>,
  dimensionsTyped = state.dimensionsTyped || change.numDimensions !== undefined,
): SearchDialogState {
  const next = changedByForm(state, (definition) => {
    const form = { ...vectorForm(definition), ...change };
    const seen = vectorPaths(state.fields).find((field) => field.path === form.path)?.vector;
    const follows = !dimensionsTyped && change.path !== undefined && seen !== undefined;
    return withVectorForm(definition, follows ? { ...form, numDimensions: seen.max } : form);
  });
  return next.error === undefined ? { ...next, dimensionsTyped } : next;
}

/** The name an empty **Name** gets. */
export function searchName(state: SearchDialogState): string {
  return state.name.trim() === '' ? defaultSearchNames[state.type] : state.name.trim();
}

function vectorNotes(state: SearchDialogState, definition: JsonDocument): readonly string[] {
  const form = vectorForm(definition);
  const field = (state.fields ?? []).find((each) => each.path === form.path);
  if (form.path === '' || field === undefined) {
    return [];
  }
  if (field.vector === undefined) {
    return [text.searchDialog.notVector(form.path)];
  }
  const { min, max } = field.vector;
  const typed = form.numDimensions;
  if (typed === undefined || (min === max && typed === max)) {
    return [];
  }
  return [text.searchDialog.otherLength(form.path, text.searchDialog.seenLengths(min, max), typed)];
}

function nothingMapped(definition: JsonDocument): boolean {
  const mappings = definition['mappings'];
  return isDocument(mappings) && mappings['dynamic'] !== true && mappedFields(definition) === undefined;
}

/** Whether the definition typed differs from the one of the index being edited. */
export function hasChanges(state: SearchDialogState): boolean {
  const definition = typedDefinition(state);
  return (
    state.editing === undefined || definition === undefined || stable(definition) !== stable(state.editing.definition)
  );
}

/** Feature: index.search-dialog — the notes, which warn without refusing. */
export function searchDialogNotes(state: SearchDialogState): readonly string[] {
  const notes: string[] = [];
  const name = searchName(state);
  const list = state.searchIndexes;
  if (state.editing === undefined && list?.kind === 'indexes' && list.indexes.some((index) => index.name === name)) {
    notes.push(text.searchDialog.nameTaken(name));
  }
  const definition = typedDefinition(state);
  if (definition !== undefined && state.type === 'vectorSearch') {
    notes.push(...vectorNotes(state, definition));
  }
  if (definition !== undefined && state.type === 'search' && nothingMapped(definition)) {
    notes.push(text.searchDialog.noFieldMapped);
  }
  if (state.editing !== undefined) {
    notes.push(hasChanges(state) ? text.searchDialog.rebuilt : text.searchDialog.noChanges);
  }
  return notes;
}

/**
 * The question `index.create-search` and `index.edit-search` ask, drawn by the window from `about` (the collection and
 * the index being edited, `index.search-dialog@dialog`); a generic form shows its fields.
 */
export function searchDialogQuestion(
  title: string,
  button: string,
  editing?: EditedSearchIndex,
  about?: Readonly<Record<string, Json>>,
): Question {
  const types = (['search', 'vectorSearch'] as const).map((value) => ({
    value,
    label: text.searchDialog.typeLabels[value],
  }));
  return {
    title,
    button,
    element: 'index.search-dialog@dialog',
    about: { ...about, ...(editing === undefined ? {} : { editing: editing as unknown as Json }) },
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.searchDialog.name,
        default: editing?.name ?? '',
        placeholder: defaultSearchNames.search,
      },
      {
        kind: 'pick-one',
        key: 'type',
        label: text.searchDialog.type,
        choices: types,
        default: editing?.type ?? 'search',
      },
      {
        kind: 'text',
        key: 'definition',
        label: text.searchDialog.definition,
        default: mongoshValue(editing?.definition ?? dynamicDefinition()),
      },
    ],
  };
}

/** What the dialog answers when its main button is pressed: the name, the type and the definition read. */
export function searchDialogAnswers(state: SearchDialogState): Readonly<Record<string, Json>> {
  return { name: state.name.trim(), type: state.type, definition: state.definition.parsed };
}

/** A box of **Fields** or **Filter fields**. */
export interface SearchFieldRow {
  readonly path: string;
  readonly ticked: boolean;
  /** The search types it would get, for **Fields**. */
  readonly types: readonly string[];
  readonly tooltip: string;
  readonly enabled: boolean;
}

/** An array of numbers **Path** suggests, with its length. */
export interface VectorPath {
  readonly path: string;
  readonly label: string;
}

/** What the search index dialog shows. */
export interface SearchDialogView {
  readonly title: string;
  readonly name: {
    readonly value: string;
    readonly placeholder: string;
    readonly locked: boolean;
    readonly hint?: string;
  };
  readonly type: { readonly value: SearchIndexType; readonly locked: boolean };
  readonly fields: readonly SearchFieldRow[];
  /** What the list of fields says when it is empty. */
  readonly fieldsEmpty?: string;
  readonly vector?: VectorForm & {
    readonly paths: readonly VectorPath[];
    readonly filterRows: readonly SearchFieldRow[];
  };
  readonly similarities: readonly string[];
  readonly quantizations: readonly string[];
  readonly definition: string;
  readonly command: string;
  readonly notes: readonly string[];
  readonly error?: string;
  readonly button: { readonly label: string; readonly enabled: boolean };
}

function fieldRow(field: SampledField | undefined, path: string, ticked: boolean, enabled: boolean): SearchFieldRow {
  const types = searchFieldTypes(field);
  const tooltip =
    field === undefined
      ? text.searchDialog.notSampled
      : text.searchDialog.sampled(field.types, Math.round((field.ratio ?? 1) * 100));
  return { path, ticked, types, tooltip, enabled };
}

/** The rows of **Fields**: the sampled fields that can be indexed, then those mapped and not sampled. */
export function searchFieldRows(
  state: SearchDialogState,
  definition: JsonDocument | undefined,
): readonly SearchFieldRow[] {
  const mapped = definition === undefined ? [] : mappedPaths(definition);
  const sampled = (state.fields ?? []).filter((field) => searchFieldTypes(field).length > 0);
  const known = new Set(sampled.map((field) => field.path));
  const enabled = definition !== undefined;
  return [
    ...sampled.map((field) => fieldRow(field, field.path, mapped.includes(field.path), enabled)),
    ...mapped.filter((path) => !known.has(path)).map((path) => fieldRow(undefined, path, true, enabled)),
  ];
}

/** The rows of **Filter fields**: the sampled fields of a type that can be filtered on, not vectors. */
export function filterRows(state: SearchDialogState, form: VectorForm, enabled: boolean): readonly SearchFieldRow[] {
  const sampled = (state.fields ?? []).filter(
    (field) => field.vector === undefined && field.types.some((type) => filterTypes.has(type)),
  );
  const known = new Set(sampled.map((field) => field.path));
  return [
    ...sampled.map((field) => fieldRow(field, field.path, form.filters.includes(field.path), enabled)),
    ...form.filters.filter((path) => !known.has(path)).map((path) => fieldRow(undefined, path, true, enabled)),
  ];
}

function vectorPart(
  state: SearchDialogState,
  definition: JsonDocument | undefined,
): NonNullable<SearchDialogView['vector']> {
  const form = vectorForm(definition ?? {});
  const paths = vectorPaths(state.fields).map((field) => ({
    path: field.path,
    label: text.searchDialog.numbers(field.vector?.min ?? 0, field.vector?.max ?? 0),
  }));
  return { ...form, paths, filterRows: filterRows(state, form, definition !== undefined) };
}

/** Feature: index.search-dialog — what the dialog shows for its state. */
export function view(state: SearchDialogState): SearchDialogView {
  const definition = typedDefinition(state);
  const editing = state.editing !== undefined;
  const fields = state.type === 'search' ? searchFieldRows(state, definition) : [];
  const fieldsEmpty =
    state.fields === undefined
      ? text.searchDialog.sampling
      : fields.length === 0
        ? text.searchDialog.noFieldToList
        : undefined;
  const label = editing
    ? state.busy
      ? text.searchDialog.saving
      : text.searchDialog.save
    : state.busy
      ? text.searchDialog.creating
      : text.searchDialog.create;
  return {
    title: editing ? text.searchDialog.editTitle(state.name) : text.searchDialog.createTitle(state.collection),
    name: {
      value: state.name,
      placeholder: defaultSearchNames[state.type],
      locked: editing,
      ...(editing ? { hint: text.searchDialog.nameLocked } : {}),
    },
    type: { value: state.type, locked: editing },
    fields,
    ...(state.type === 'search' && fieldsEmpty !== undefined ? { fieldsEmpty } : {}),
    ...(state.type === 'vectorSearch' ? { vector: vectorPart(state, definition) } : {}),
    similarities,
    quantizations,
    definition: state.definition.text,
    command: searchIndexCommand(state.collection, {
      name: searchName(state),
      type: state.type,
      definition: definition ?? {},
      update: editing,
    }),
    notes: searchDialogNotes(state),
    ...(state.error === undefined ? {} : { error: state.error }),
    button: { label, enabled: !state.busy && hasChanges(state) },
  };
}
