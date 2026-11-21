/**
 * Feature: saved-query.rename
 *
 * Gives a saved query another name: **Rename…** in its **…** menu, started with `{ connection, database, collection,
 * saved }` (`savedRefOf`). A query for me is renamed in Datardo's data; a query in the folder keeps its folder, its
 * description, its `connection` and its query, and its file takes the file name of the new name, `-2`, `-3`… when
 * another file has it. The same name does nothing.
 */
import {
  ask,
  noDanger,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { queryFileText } from './file-format';
import { renamedFilePath } from './file-path';
import type { CollectionQueries } from './list';
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
  pinSteps,
  savedRefOf,
  scopeOf,
  type CollectionScope,
  type FolderSavedQuery,
  type MySavedQuery,
  type SavedQuery,
} from './types';

/** The question of the new name, starting with the name it has; a name another query of the same place has is refused. */
export function renameQuestion(query: SavedQuery, list: CollectionQueries): Question {
  const others = list.saved.filter((each) => each.place === query.place && each !== query).map((each) => each.name);
  return {
    title: text.rename.title,
    button: text.rename.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: query.place === 'folder' ? text.rename.newNameOfFile(query.file) : text.rename.newName,
        default: query.name,
        rules: [
          { kind: 'not-empty', message: text.rename.enterName },
          {
            kind: 'not-one-of',
            values: others,
            message: query.place === 'folder' ? text.rename.takenFolder : text.rename.takenMine,
          },
        ],
      },
    ],
  };
}

function plainPlan(steps: Parameters<typeof run>[0]['steps']): Outcome {
  return run({
    title: text.rename.title,
    steps,
    danger: noDanger,
    undo: { cannot: text.rename.cannotUndo },
    publishes: false,
    after: [],
  });
}

function renameMine(context: Context, where: Where, query: MySavedQuery, name: string): Outcome {
  const { scope } = where;
  const renamed = { ...query, name };
  const queries = mineIn(where.list.saved).map((each) => (each === query ? renamed : each));
  return plainPlan([
    mineStep(scope, queries, text.rename.forMeStep(query.name, namespaceOf(scope), name)),
    ...pinSteps(context, scope, query, renamed),
  ]);
}

interface Where {
  readonly scope: CollectionScope;
  readonly list: CollectionQueries;
}

function renameFile(
  context: Context,
  where: { readonly scope: CollectionScope; readonly list: CollectionQueries },
  query: FolderSavedQuery,
  name: string,
): Outcome {
  const folder = where.scope.queriesFolder;
  if (folder === undefined) {
    return nothingToDo(text.rename.title, text.rename.cannotUndo);
  }
  const file = renamedFilePath(query.file, name, where.list.files);
  const { place: _place, file: _file, ...content } = query;
  const write = fileStep(
    'write',
    { queriesFolder: folder, file, platform: context.platform },
    text.steps.write(fullPath(folder, file, context.platform)),
    { text: queryFileText({ ...content, name }), failure: text.rename.couldNotRename },
  );
  const pins = pinSteps(context, where.scope, query, { ...query, name, file });
  if (file === query.file) {
    return plainPlan([write, ...pins]);
  }
  const newName = file.slice(file.lastIndexOf('/') + 1);
  const renameStep = fileStep(
    'rename',
    { queriesFolder: folder, file: query.file, platform: context.platform },
    text.steps.rename(fullPath(folder, query.file, context.platform), newName),
    { to: file, failure: text.rename.couldNotRename },
  );
  return plainPlan([renameStep, write, ...pins]);
}

/** Feature: saved-query.rename — asks the new name, then renames the query for me, or the file and its `name`. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  const ref = savedRefOf(answers);
  if (scope === undefined || ref === undefined) {
    return nothingToDo(text.rename.title, text.rename.cannotUndo);
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const query = findSaved(list.saved, ref);
  if (query === undefined) {
    return nothingToDo(text.rename.title, text.rename.cannotUndo);
  }
  const answered = answers['name'];
  if (typeof answered !== 'string' || answered.trim() === '') {
    return ask(renameQuestion(query, list));
  }
  const name = answered.trim();
  if (name === query.name) {
    return nothingToDo(text.rename.title, text.rename.cannotUndo);
  }
  return query.place === 'me'
    ? renameMine(context, { scope, list }, query, name)
    : renameFile(context, { scope, list }, query, name);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.rename'), plan };
