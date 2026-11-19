/**
 * Feature: saved-query.move
 *
 * Moves a saved query between the two places: **Move to the folder** writes a query for me as a file of the queries
 * folder (asking the folder when the connection has none, and to replace another query of that name), then forgets it
 * for me; **Move to my queries**, confirmed, saves it for me, without its `connection`, then deletes its file. Started
 * with `{ connection, database, collection, saved }` (`savedRefOf`). The main process deletes the folders the file
 * leaves empty, up to the queries folder, which is kept.
 */
import { noDanger, run, type Answers, type Context, type OperationFeature, type Outcome } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { CollectionQueries } from './list';
import { listAnswer, readList } from './recent';
import { folderWrite, lastPlaceKey } from './save';
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

interface Where {
  readonly scope: CollectionScope;
  readonly list: CollectionQueries;
}

function toFolder(context: Context, answers: Answers, where: Where, query: MySavedQuery): Outcome {
  const { scope } = where;
  const saving = {
    name: query.name,
    ...(query.description === undefined ? {} : { description: query.description }),
    query: query.query,
  };
  const write = folderWrite(context, answers, where, saving);
  if (!('steps' in write)) {
    return write;
  }
  const remaining = mineIn(where.list.saved).filter((each) => each !== query);
  const forget = mineStep(scope, remaining, text.move.removeMine(query.name, namespaceOf(scope), scope.connectionName));
  const replaced = write.replaced;
  return run({
    title: replaced === undefined ? text.move.toFolderTitle : text.save.replaceQuestion(scope.collection, query.name),
    steps: [...write.steps, forget],
    danger:
      replaced === undefined
        ? noDanger
        : { kind: 'confirm', text: text.save.replaceText(replaced.file), button: text.save.replaceButton },
    undo: { cannot: text.move.cannotUndo },
    publishes: false,
    after: [...write.after, { kind: 'remember', key: lastPlaceKey, value: 'folder' }],
  });
}

function toMine(context: Context, where: Where, query: FolderSavedQuery): Outcome {
  const { scope } = where;
  const folder = scope.queriesFolder;
  if (folder === undefined) {
    return nothingToDo(text.move.toMineTitle, text.move.cannotUndo);
  }
  const entry: MySavedQuery = {
    place: 'me',
    name: query.name,
    ...(query.description === undefined ? {} : { description: query.description }),
    database: scope.database,
    collection: scope.collection,
    query: query.query,
    at: context.now,
  };
  const mine = [entry, ...mineIn(where.list.saved).filter((each) => each.name !== query.name)];
  const place = { queriesFolder: folder, file: query.file, platform: context.platform };
  return run({
    title: text.move.question(query.name),
    steps: [
      mineStep(scope, mine, text.save.forMeStep(query.name, namespaceOf(scope), scope.connectionName)),
      fileStep('delete', place, text.steps.delete(fullPath(folder, query.file, context.platform))),
    ],
    danger: { kind: 'confirm', text: text.move.text(query.file), button: text.move.button },
    undo: { cannot: text.move.cannotUndo },
    publishes: false,
    after: [],
  });
}

/** Feature: saved-query.move — writes a query for me in the folder, or brings one of the folder back for me. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const ref = savedRefOf(answers);
  if (scope === undefined || ref === undefined) {
    return nothingToDo(text.move.toFolderTitle, text.move.cannotUndo);
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const query = findSaved(list.saved, ref);
  if (query === undefined) {
    return nothingToDo(text.move.toFolderTitle, text.move.cannotUndo);
  }
  return query.place === 'me'
    ? toFolder(context, answers, { scope, list }, query)
    : toMine(context, { scope, list }, query);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.move'), plan };
