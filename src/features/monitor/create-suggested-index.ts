/**
 * Feature: monitor.create-suggested-index
 *
 * Creates on the collection the index that would serve a slow query, after saying what building it costs:
 * `db.getSiblingDB("shop").orders.createIndex({ status: 1, createdAt: -1 })`, with no options, so that the server
 * names it. Started with `{ connection, namespace, keys, view, reread }`: the group's namespace, its suggestion as a
 * key document (`monitor.group-slow-queries`), whether the collection is a view, and the arguments of the read of the
 * slow operations to send again once it ran. It reads the indexes of the collection first (`index.list`, built in
 * M22: its result is read here as a list of index documents with `name` and `key`, or an object with `indexes`), to
 * refuse when one has the same keys in the same order. Ported from Mongoster's `src/monitor.ts › createIndex`.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type After,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { isRecord, listOf, recordOf, textOf } from './parts/ejson';
import { collectionCall, mongoStep, splitNamespace, writeTimeLimitMs } from './parts/requests';
import { text } from './text';
import {
  defaultIndexName,
  indexKeyDocument,
  indexKeyOf,
  indexKeyText,
  isOn,
  isSameKey,
  requiredConnection,
  startArgs,
  textArg,
  type IndexKey,
  type MonitorConnection,
} from './types';

/** An index the collection already has, by its name and its keys. */
export interface ExistingIndex {
  readonly name: string;
  readonly key: IndexKey;
}

/** The indexes of the read of `index.list`: a list of index documents, or an object with `indexes`. */
export function existingIndexes(read: unknown): readonly ExistingIndex[] {
  const list = Array.isArray(read) ? (read as readonly Json[]) : listOf(recordOf(read)['indexes']);
  return list.flatMap((each) => {
    const name = textOf(recordOf(each)['name']);
    return name === undefined || !isRecord(recordOf(each)['key'])
      ? []
      : [{ name, key: indexKeyOf(recordOf(each)['key']) }];
  });
}

function afterCreate(connection: MonitorConnection, name: string, namespace: string, reread: Json): readonly After[] {
  const target = { kind: 'connection', connection: connection.id } as const;
  return [
    { kind: 'notify', level: 'success', text: text.slow.createSuggested.created(name, namespace) },
    { kind: 'refresh', connection: connection.id },
    ...(isRecord(reread)
      ? [{ kind: 'start', feature: featureId('monitor.read-slow-queries'), target, args: reread } as const]
      : []),
  ];
}

/** What a failure says: *Index not created: <the server's message>*. */
export function failureText(message: string): string {
  return text.slow.createSuggested.notCreated(message);
}

/** Feature: monitor.create-suggested-index — refused on a read-only connection, on a view and when it exists. */
export function plan(context: Context, answers: Answers): Outcome {
  const args = startArgs(answers);
  const connection = requiredConnection(context, args);
  const namespace = textArg(args, 'namespace') ?? '';
  const keys = indexKeyOf(args['keys']);
  const words = text.slow.createSuggested;
  if (connection.readOnly) {
    return refuse('monitor.create-suggested-index/read-only', text.readOnly(connection.name));
  }
  if (isOn(args, 'view')) {
    return refuse('monitor.create-suggested-index/view', words.view(namespace));
  }
  const { database, collection } = splitNamespace(namespace);
  if (keys.length === 0 || collection === '') {
    throw new Error('monitor.create-suggested-index is started on a namespace with the keys of a suggestion.');
  }
  if (!('indexes' in answers)) {
    return needRead('indexes', 'index.list', { connection: connection.id, database, collection });
  }
  const shown = indexKeyText(keys);
  const same = existingIndexes(answers['indexes']).find((index) => isSameKey(index.key, keys));
  if (same !== undefined) {
    return refuse('monitor.create-suggested-index/exists', words.exists(namespace, same.name, shown));
  }
  const request = collectionCall({
    database,
    collection,
    method: 'createIndex',
    arguments: [indexKeyDocument(keys)],
    timeLimitMs: writeTimeLimitMs,
  });
  return run({
    title: words.title(shown, namespace),
    steps: [mongoStep(connection.id, request, true)],
    danger: { kind: 'confirm', text: `${words.question(shown, namespace)}\n${words.warning}`, button: words.button },
    undo: { cannot: words.cannotUndo },
    publishes: false,
    after: afterCreate(connection, defaultIndexName(keys), namespace, args['reread'] ?? null),
  });
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('monitor.create-suggested-index'), plan };
