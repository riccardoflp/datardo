/**
 * Feature: index.create-search
 *
 * Creates an Atlas Search or Vector Search index from its name, type and definition. The dialog answers with `name`,
 * `type` and `definition` (`ParsedText`).
 */
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { defaultSearchNames, typeMismatch } from './search-checks';
import { searchDialogQuestion } from './search-dialog';
import { text } from './text';
import {
  isDocument,
  jsonText,
  mongoRequest,
  parsedAnswer,
  readArgs,
  subjectOf,
  writeStep,
  type JsonDocument,
  type SearchIndexList,
  type SearchIndexType,
} from './types';

/** What the dialog answered: a definition of a type, or why it is refused with its text. */
export type AnsweredSearch =
  | { readonly kind: 'definition'; readonly type: SearchIndexType; readonly definition: JsonDocument }
  | { readonly kind: 'unknown-type' | 'invalid' | 'not-an-object' | 'type-mismatch'; readonly text: string };

/** Whether a value is one of the two types of search index. */
export function isSearchType(value: unknown): value is SearchIndexType {
  return value === 'search' || value === 'vectorSearch';
}

/** Feature: index.create-search — the type and the definition answered, checked as `index.search-checks` says. */
export function answeredSearch(answers: Answers, fixedType?: SearchIndexType): AnsweredSearch {
  const type = fixedType ?? answers['type'] ?? 'search';
  if (!isSearchType(type)) {
    return { kind: 'unknown-type', text: text.search.unknownType(jsonText(type)) };
  }
  const parsed = parsedAnswer(answers['definition']);
  if (parsed.kind === 'empty') {
    return { kind: 'invalid', text: text.search.definitionEmpty };
  }
  if (parsed.kind === 'invalid') {
    return { kind: 'invalid', text: text.search.definitionInvalid(parsed.message) };
  }
  if (!isDocument(parsed.value)) {
    return { kind: 'not-an-object', text: text.search.notAnObject };
  }
  const mismatch = typeMismatch(type, parsed.value);
  return mismatch === undefined
    ? { kind: 'definition', type, definition: parsed.value }
    : { kind: 'type-mismatch', text: mismatch };
}

function refusal(answered: Exclude<AnsweredSearch, { kind: 'definition' }>): Outcome {
  switch (answered.kind) {
    case 'unknown-type':
      return refuse('index.create-search/unknown-type', answered.text);
    case 'invalid':
      return refuse('index.create-search/invalid', answered.text);
    case 'not-an-object':
      return refuse('index.create-search/not-an-object', answered.text);
    case 'type-mismatch':
      return refuse('index.create-search/type-mismatch', answered.text);
  }
}

/** The name answered, or the one an empty name gets. */
export function answeredName(answers: Answers, type: SearchIndexType): string {
  const name = answers['name'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : defaultSearchNames[type];
}

/**
 * Feature: index.create-search — `db.movies.createSearchIndex("default", { … })`, or with `"vectorSearch"` before the
 * definition; a name already taken is refused when the list of search indexes can be read.
 */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  if (subject === undefined) {
    throw new Error('index.create-search needs { connection, database, collection }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.create-search/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.create-search/view', text.viewNoSearchIndexes);
  }
  if (answers['definition'] === undefined) {
    return ask(searchDialogQuestion(text.searchDialog.createTitle(subject.collection), text.searchDialog.create));
  }
  const answered = answeredSearch(answers);
  if (answered.kind !== 'definition') {
    return refusal(answered);
  }
  const name = answeredName(answers, answered.type);
  const list = answers['searchIndexes'] as SearchIndexList | undefined;
  if (list === undefined) {
    return needRead('searchIndexes', 'index.list-search', readArgs(subject, { name }));
  }
  if (list.kind === 'indexes' && list.indexes.some((index) => index.name === name)) {
    return refuse('index.create-search/name-taken', text.search.nameTaken(name));
  }
  const args =
    answered.type === 'vectorSearch' ? [name, 'vectorSearch', answered.definition] : [name, answered.definition];
  return run({
    title: text.search.createPlan(name),
    steps: [writeStep(subject, mongoRequest(subject, 'createSearchIndex', args))],
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [
      { kind: 'refresh', connection: subject.connection.id },
      { kind: 'notify', level: 'success', text: text.search.created(name) },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.create-search'), plan };
