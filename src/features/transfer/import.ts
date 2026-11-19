/**
 * Feature: transfer.import
 *
 * Inserts the documents of a JSON, JSON Lines or CSV file, or of a file in mongosh syntax, into a collection, in
 * batches of 1,000, recorded in the undo history as one operation that keeps the `_id`s of the inserted documents.
 */
import type { Json } from '../../shared/engine-request';
import type { Answers, Context, Outcome, ReadFeature, ReadRequest } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { nothingToDo } from '../task/types';
import { isObject, textArg } from '../tree/types';
import { newObjectIds } from './generate-values';
import { largestImport, parseImport } from './import-files';
import { counted, importText as text } from './text';
import { answerText, batchSize, insertUndo, writeStep, type JsonDocument, type Namespace } from './types';

/** The name of a file, without its folder. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/u).pop() ?? path;
}

/** The documents, each without `_id` given a new `ObjectId`, so that the undo can delete it. */
export function withIds(documents: readonly JsonDocument[], ids: readonly Json[]): JsonDocument[] {
  let next = 0;
  return documents.map((document) => {
    if ('_id' in document) {
      return document;
    }
    const _id = ids[next] ?? null;
    next += 1;
    return { _id, ...document };
  });
}

/** The batches of an import: `insertMany([<1,000 documents>], { ordered: false })` each. */
function batches(on: Namespace, documents: readonly JsonDocument[], context: Context) {
  const steps = [];
  for (let first = 0; first < documents.length; first += batchSize) {
    const batch = documents.slice(first, first + batchSize);
    steps.push(writeStep(on, { method: 'insertMany', arguments: [batch, { ordered: false }] }, context.target));
  }
  return steps;
}

/** The read file: its text, or why it could not be read. */
interface ReadFile {
  readonly text?: string;
  readonly error?: string;
}

function isReadFile(value: unknown): value is ReadFile {
  return isObject(value) && (typeof value['text'] === 'string' || typeof value['error'] === 'string');
}

/** Whether the collection is a view, from the database's contents. */
function isView(contents: unknown, collection: string): boolean {
  const entries: unknown = isObject(contents) ? contents['entries'] : undefined;
  return (
    Array.isArray(entries) &&
    entries.some((entry: unknown) => isObject(entry) && entry['name'] === collection && entry['kind'] === 'view')
  );
}

/** Feature: transfer.import — on a collection: the file, read and parsed; then its documents in batches. */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  if (target.kind !== 'collection') {
    return nothingToDo(text.command, '');
  }
  const namespace = `${target.database}.${target.collection}`;
  const connection = savedConnection(context.state.connections, target.connection);
  if (connection === undefined || connection.readOnly) {
    return refuse('transfer.import/read-only', text.readOnly(namespace));
  }
  const contents = answers['contents'];
  if (contents === undefined) {
    return needRead('contents', 'tree.list-collections', { connection: target.connection, database: target.database });
  }
  if (isView(contents, target.collection)) {
    return refuse('transfer.import/view', text.readOnly(namespace));
  }
  const path = answerText(answers['file']);
  if (path === '') {
    const title = text.title(namespace);
    return ask({ title, text: text.filter, button: text.open, fields: [{ kind: 'text', key: 'file', label: title }] });
  }
  const read = answers['read'];
  if (!isReadFile(read)) {
    return needRead('read', 'transfer.import:read', { path });
  }
  const file = fileNameOf(path);
  let parsed: JsonDocument[];
  try {
    if (read.error !== undefined) {
      throw new Error(read.error);
    }
    parsed = parseImport(read.text ?? '', file);
  } catch (error) {
    return refuse('transfer.import/unreadable', text.unreadable(file, error instanceof Error ? error.message : ''));
  }
  if (parsed.length === 0) {
    return refuse('transfer.import/empty', text.empty(file));
  }
  const on = { connection: target.connection, database: target.database, collection: target.collection };
  const undo = insertUndo(context, connection, parsed.length, { ...on, title: text.undoTitle(file) });
  const lacking = parsed.filter((document) => !('_id' in document)).length;
  const salt = `${path}\n${String(read.text?.length ?? 0)}`;
  const documents = 'keeps' in undo ? withIds(parsed, newObjectIds(lacking, context.now, salt)) : parsed;
  const having = parsed.length - lacking;
  const lines = [text.confirm(parsed.length, file, namespace), having > 0 ? text.withIds(having) : text.newIds];
  return run({
    title: text.undoTitle(file),
    steps: batches(on, documents, context),
    danger: { kind: 'confirm', text: lines.join('\n'), button: text.button },
    touches: counted(parsed.length, 'document'),
    undo,
    publishes: false,
    after: [{ kind: 'refresh', connection: target.connection }],
  });
}

/** `transfer.import:read`: the text of the file at `args.path`, read by the main process up to {@link largestImport}. */
export const fileRead: ReadFeature = {
  kind: 'read',
  id: featureId('transfer.import:read'),
  request: (_context: Context, args: Json): ReadRequest => ({
    kind: 'app',
    action: 'transfer.read-file',
    args: { path: textArg(args, 'path'), most: largestImport },
  }),
  parse: (replies: readonly unknown[], args: Json): ReadFile => {
    const reply = replies[0];
    if (typeof reply === 'string') {
      return { text: reply };
    }
    const error = isObject(reply) && typeof reply['error'] === 'string' ? reply['error'] : undefined;
    return { error: error ?? text.notRead(textArg(args, 'path')) };
  },
};
