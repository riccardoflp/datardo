/**
 * Feature: saved-query.delete
 *
 * Deletes a saved query: one for me at once, one in the folder after a confirmation, with its file. Started with
 * `{ connection, database, collection, saved }` (`savedRefOf`). The recent query equal to it stays. The main process
 * deletes the folders the file leaves empty, up to the queries folder, which is kept.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { listAnswer, readList } from './recent';
import { text } from './text';
import {
  fileStep,
  findSaved,
  fullPath,
  mineIn,
  mineStep,
  namespaceOf,
  nothingToDo,
  savedRefOf,
  scopeOf,
  type CollectionScope,
  type FolderSavedQuery,
  type MySavedQuery,
} from './types';
import type { CollectionQueries } from './list';

function deleteMine(scope: CollectionScope, list: CollectionQueries, query: MySavedQuery): Outcome {
  const queries = mineIn(list.saved).filter((each) => each !== query);
  return run({
    title: text.delete.title,
    steps: [mineStep(scope, queries, text.delete.forMeStep(query.name, namespaceOf(scope), scope.connectionName))],
    danger: noDanger,
    undo: { cannot: text.delete.cannotUndo },
    publishes: false,
    after: [],
  });
}

function deleteFile(context: Context, scope: CollectionScope, query: FolderSavedQuery): Outcome {
  const folder = scope.queriesFolder;
  if (folder === undefined) {
    return nothingToDo(text.delete.title, text.delete.cannotUndo);
  }
  const where = { queriesFolder: folder, file: query.file, platform: context.platform };
  return run({
    title: text.delete.question(query.name),
    steps: [fileStep('delete', where, text.steps.delete(fullPath(folder, query.file, context.platform)))],
    danger: { kind: 'confirm', text: text.delete.text(query.file), button: text.delete.button },
    undo: { cannot: text.delete.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** Feature: saved-query.delete — forgets a query for me, or deletes the file of one in the folder, confirmed. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const ref = savedRefOf(answers);
  if (scope === undefined || ref === undefined) {
    return nothingToDo(text.delete.title, text.delete.cannotUndo);
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const query = findSaved(list.saved, ref);
  if (query === undefined) {
    return nothingToDo(text.delete.title, text.delete.cannotUndo);
  }
  return query.place === 'me' ? deleteMine(scope, list, query) : deleteFile(context, scope, query);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.delete'), plan };
