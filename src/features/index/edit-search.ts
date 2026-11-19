/**
 * Feature: index.edit-search
 *
 * Gives a search index a new definition; the server builds it in the background, and queries use the old one until
 * then. Started with `{ connection, database, collection, index }`, and the row's `type` and `definition` when it has
 * them; the dialog answers with `definition` (`ParsedText`).
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
import { answeredSearch, isSearchType } from './create-search';
import { definitionType } from './search-checks';
import { searchDialogQuestion, type EditedSearchIndex } from './search-dialog';
import { dynamicDefinition } from './search-form';
import { text } from './text';
import {
  isDocument,
  mongoRequest,
  readArgs,
  subjectOf,
  writeStep,
  type IndexSubject,
  type SearchIndexList,
} from './types';

/** The index being edited: from the arguments, or from the list read; a dropped one opens on the template. */
function editedIndex(subject: IndexSubject, name: string, list: SearchIndexList | undefined): EditedSearchIndex {
  const { type, definition } = subject.args;
  if (isSearchType(type) && isDocument(definition)) {
    return { name, type, definition };
  }
  const found = list?.kind === 'indexes' ? list.indexes.find((index) => index.name === name) : undefined;
  const foundType = isSearchType(found?.type) ? found.type : definitionType(found?.definition);
  return { name, type: foundType ?? 'search', definition: found?.definition ?? dynamicDefinition() };
}

function hasRowDefinition(subject: IndexSubject): boolean {
  return isSearchType(subject.args['type']) && isDocument(subject.args['definition']);
}

/** Feature: index.edit-search — `db.movies.updateSearchIndex("titles", { … })`, with the name and the type fixed. */
export function plan(context: Context, answers: Answers): Outcome {
  const subject = subjectOf(context, answers);
  const name = subject?.args['index'];
  if (subject === undefined || typeof name !== 'string') {
    throw new Error('index.edit-search needs { connection, database, collection, index }.');
  }
  if (subject.connection.readOnly) {
    return refuse('index.edit-search/read-only', text.readOnly(subject.connection.name));
  }
  if (subject.view) {
    return refuse('index.edit-search/view', text.viewNoSearchIndexes);
  }
  const list = answers['searchIndexes'] as SearchIndexList | undefined;
  if (list === undefined && !hasRowDefinition(subject)) {
    return needRead('searchIndexes', 'index.list-search', readArgs(subject, { name }));
  }
  const edited = editedIndex(subject, name, list);
  if (answers['definition'] === undefined) {
    return ask(searchDialogQuestion(text.searchDialog.editTitle(name), text.searchDialog.save, edited));
  }
  const answered = answeredSearch(answers, edited.type);
  switch (answered.kind) {
    case 'definition':
      break;
    case 'invalid':
      return refuse('index.edit-search/invalid', answered.text);
    case 'not-an-object':
      return refuse('index.edit-search/not-an-object', answered.text);
    case 'type-mismatch':
    case 'unknown-type':
      return refuse('index.edit-search/type-mismatch', answered.text);
  }
  return run({
    title: text.search.editPlan(name),
    steps: [writeStep(subject, mongoRequest(subject, 'updateSearchIndex', [name, answered.definition]))],
    danger: noDanger,
    undo: { cannot: text.cannotUndo },
    publishes: false,
    after: [
      { kind: 'refresh', connection: subject.connection.id },
      { kind: 'notify', level: 'success', text: text.search.edited(name) },
    ],
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('index.edit-search'), plan };
