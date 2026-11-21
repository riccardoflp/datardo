/**
 * Feature: saved-query.save
 *
 * Keeps the query or the pipeline of the tab, or a recent one, under a name: *for me*, in Datardo's data for this
 * connection, or *in the folder*, as a file of the connection's queries folder in Mongoster's format. What is saved is
 * what is typed, run or not: `args.query` (`readQueryText`), or the pipeline editor as the pipeline editor sends it
 * (`args.pipeline`), every stage included. `args.place` (`folder` for **Save query in the folder…**) says where
 * without asking.
 *
 * The answers, in order: `list` (`saved-query.list`), `name`, `place`, then for a connection with no queries folder
 * `folder` (`saved-query.choose-folder`) and `chosen`, the files already in the folder chosen.
 */
import {
  ask,
  needRead,
  noDanger,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
  type Step,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import type { Question } from '../../shared/question';
import { stagesOfEditor } from '../aggregate/edit-as-text';
import { makersOf, readEditor } from '../aggregate/types';
import { chosenFolder, chosenNotice, folderNeed, folderStep } from './choose-folder';
import { queryFileText } from './file-format';
import { queryFilePath } from './file-path';
import { matchesCollection, type CollectionQueries } from './list';
import type { FolderQueries } from './read-folder';
import { listAnswer, readList, sameQuery } from './recent';
import { text } from './text';
import {
  argumentsOf,
  fileStep,
  fullPath,
  isEmptyFind,
  keptQuery,
  mineIn,
  mineStep,
  namespaceOf,
  nothingToDo,
  readQueryText,
  scopeOf,
  type CollectionScope,
  type FolderSavedQuery,
  type QueryText,
  type SavedQueryPlace,
} from './types';

/** The key under which the place chosen last is remembered until Datardo quits. */
export const lastPlaceKey = 'saved-query.save';

/** A query about to be saved: its name, its description when it keeps one, and the query. */
export interface Saving {
  readonly name: string;
  readonly description?: string;
  readonly query: QueryText;
}

type QueryToSave = { readonly ok: true; readonly query: QueryText } | { readonly ok: false; readonly outcome: Outcome };

/** The query of the tab, or the refusal that says there is nothing to save. */
export function queryToSave(context: Context, answers: Answers): QueryToSave {
  const args = argumentsOf(answers);
  const editor = readEditor(args['pipeline']);
  let query = readQueryText(args['query']);
  if (query === undefined && editor !== undefined) {
    const read = stagesOfEditor(editor, makersOf(context));
    if (!read.ok) {
      return { ok: false, outcome: refuse('saved-query.save/invalid-text', read.message) };
    }
    query = { kind: 'pipeline', stages: read.stages };
  }
  const kept = keptQuery(query ?? { kind: 'find', filter: '', sort: '', projection: '' });
  if (kept.kind === 'find' && isEmptyFind(kept)) {
    return { ok: false, outcome: refuse('saved-query.save/empty', text.save.emptyFind) };
  }
  if (kept.kind === 'pipeline' && kept.stages.length === 0) {
    return { ok: false, outcome: refuse('saved-query.save/empty', text.save.emptyPipeline) };
  }
  return { ok: true, query: kept };
}

function placeArg(answers: Answers): SavedQueryPlace | undefined {
  const place = argumentsOf(answers)['place'];
  return place === 'me' || place === 'folder' ? place : undefined;
}

function nameQuestion(
  scope: CollectionScope,
  list: CollectionQueries,
  query: QueryText,
  place?: SavedQueryPlace,
): Question {
  const equal = list.saved.find((each) => sameQuery(each.query, query));
  const question: Question = {
    title: place === 'folder' ? text.save.titleInFolder : text.save.title,
    button: text.save.button,
    fields: [
      {
        kind: 'text',
        key: 'name',
        label: text.save.name(scope.collection),
        ...(equal === undefined ? {} : { default: equal.name }),
        rules: [{ kind: 'not-empty', message: text.save.enterName }],
      },
    ],
  };
  return question;
}

/** The question of where, with the place chosen last time first (the first time, **For me**). */
export function placeQuestion(context: Context, scope: CollectionScope): Question {
  const last = context.state.runner.remembered[lastPlaceKey] === 'folder' ? 'folder' : 'me';
  const where = scope.queriesFolder ?? '';
  const choices = [
    { value: 'me', label: text.save.forMe, description: text.save.forMeDescription(scope.connectionName) },
    {
      value: 'folder',
      label: text.save.inFolder,
      description: where === '' ? text.save.inChosenFolder : text.save.inFolderDescription(where, namespaceOf(scope)),
    },
  ];
  return {
    title: text.save.title,
    button: text.save.button,
    fields: [
      {
        kind: 'pick-one',
        key: 'place',
        label: text.save.where,
        choices: last === 'folder' ? [...choices].reverse() : choices,
        default: last,
      },
    ],
  };
}

/** What a write to the folder needs once the folder is known: its steps, and the file of the same name it replaces. */
export interface FolderWrite {
  readonly steps: readonly Step[];
  readonly after: readonly After[];
  /** The path of the file inside the queries folder. */
  readonly file: string;
  /** The file of this collection with this name and no `connection`, when its query is another. */
  readonly replaced?: FolderSavedQuery;
}

function folderFiles(scope: CollectionScope, folder: FolderQueries): Pick<CollectionQueries, 'saved' | 'files'> {
  const where = { connectionName: scope.connectionName, database: scope.database, collection: scope.collection };
  return { saved: folder.queries.filter((each) => matchesCollection(each, where)), files: folder.files };
}

/**
 * The steps that write a query in the folder (`saved-query.save`, `saved-query.move`): the folder asked first when
 * the connection has none, and the file of the same name with no `connection` written again in place, its
 * description kept. Returns what to ask or read first, when something is missing.
 */
export function folderWrite(
  context: Context,
  answers: Answers,
  where: { readonly scope: CollectionScope; readonly list: CollectionQueries; readonly failure?: string },
  saving: Saving,
): FolderWrite | Outcome {
  const { scope } = where;
  const connection = context.state.connections.saved.find((each) => each.id === scope.connection);
  const chosen = scope.queriesFolder === undefined ? chosenFolder(answers) : undefined;
  if (scope.queriesFolder === undefined) {
    const need = connection === undefined ? undefined : folderNeed(connection, answers, 'save');
    if (need !== undefined) {
      return need;
    }
    if (connection === undefined || chosen === undefined) {
      // No connection, or the system's folder dialog closed without a folder: nothing is saved.
      return nothingToDo(text.save.title, text.save.cannotUndo);
    }
  }
  if (chosen !== undefined && !('chosen' in answers)) {
    return needRead('chosen', 'saved-query.read-folder', { connection: scope.connection, queriesFolder: chosen });
  }
  const folder = scope.queriesFolder ?? chosen ?? '';
  const known = chosen === undefined ? where.list : folderFiles(scope, answers['chosen'] as FolderQueries);
  const same = known.saved.find(
    (each): each is FolderSavedQuery =>
      each.place === 'folder' && each.connection === undefined && each.name === saving.name,
  );
  const file = same?.file ?? queryFilePath(scope.database, scope.collection, saving.name, known.files);
  const description = saving.description ?? same?.description;
  const content = queryFileText({
    name: saving.name,
    ...(description === undefined ? {} : { description }),
    database: scope.database,
    collection: scope.collection,
    query: saving.query,
  });
  const write = fileStep(
    'write',
    { queriesFolder: folder, file, platform: context.platform },
    text.steps.write(fullPath(folder, file, context.platform)),
    { text: content, failure: where.failure ?? text.save.couldNotSave },
  );
  return {
    steps: [...(chosen === undefined || connection === undefined ? [] : [folderStep(connection, chosen)]), write],
    after: chosen === undefined ? [] : [chosenNotice(chosen)],
    file,
    ...(same !== undefined && !sameQuery(same.query, saving.query) ? { replaced: same } : {}),
  };
}

function isFolderWrite(value: FolderWrite | Outcome): value is FolderWrite {
  return 'steps' in value;
}

function inFolder(
  context: Context,
  answers: Answers,
  where: { scope: CollectionScope; list: CollectionQueries },
  saving: Saving,
): Outcome {
  const write = folderWrite(context, answers, where, saving);
  if (!isFolderWrite(write)) {
    return write;
  }
  const replaced = write.replaced;
  return run({
    title: replaced === undefined ? text.save.title : text.save.replaceQuestion(where.scope.collection, saving.name),
    steps: write.steps,
    danger:
      replaced === undefined
        ? noDanger
        : { kind: 'confirm', text: text.save.replaceText(replaced.file), button: text.save.replaceButton },
    undo: { cannot: text.save.cannotUndo },
    publishes: false,
    after: [
      ...write.after,
      { kind: 'notify', level: 'success', text: text.save.saved(write.file) },
      { kind: 'remember', key: lastPlaceKey, value: 'folder' },
    ],
  });
}

function forMe(context: Context, where: { scope: CollectionScope; list: CollectionQueries }, saving: Saving): Outcome {
  const { scope } = where;
  const mine = mineIn(where.list.saved);
  const before = mine.find((each) => each.name === saving.name);
  const description = saving.description ?? before?.description;
  const entry = {
    place: 'me' as const,
    name: saving.name,
    ...(description === undefined ? {} : { description }),
    database: scope.database,
    collection: scope.collection,
    query: saving.query,
    at: context.now,
  };
  const queries = [entry, ...mine.filter((each) => each.name !== saving.name)];
  return run({
    title: text.save.title,
    steps: [mineStep(scope, queries, text.save.forMeStep(saving.name, namespaceOf(scope), scope.connectionName))],
    danger: noDanger,
    undo: { cannot: text.save.cannotUndo },
    publishes: false,
    after: [{ kind: 'remember', key: lastPlaceKey, value: 'me' }],
  });
}

function answeredText(answers: Answers, key: string): string | undefined {
  const value = answers[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Feature: saved-query.save — asks the name and where, then saves for me or writes the file in the folder. */
export function plan(context: Context, answers: Answers): Outcome {
  const scope = scopeOf(context, answers);
  if (scope === undefined) {
    return nothingToDo(text.save.title, text.save.cannotUndo);
  }
  const toSave = queryToSave(context, answers);
  if (!toSave.ok) {
    return toSave.outcome;
  }
  const list = listAnswer(answers);
  if (list === undefined) {
    return readList(scope);
  }
  const fixed = placeArg(answers);
  const name = answeredText(answers, 'name');
  if (name === undefined) {
    return ask(nameQuestion(scope, list, toSave.query, fixed));
  }
  const answered = answers['place'];
  const place = fixed ?? (answered === 'me' || answered === 'folder' ? answered : undefined);
  if (place === undefined) {
    return ask(placeQuestion(context, scope));
  }
  const saving = { name, query: toSave.query };
  return place === 'me' ? forMe(context, { scope, list }, saving) : inFolder(context, answers, { scope, list }, saving);
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('saved-query.save'), plan };
