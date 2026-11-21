/**
 * Feature: transfer.copy-collection
 *
 * Copies the documents of a collection or view, optionally filtered, with its indexes and options, into a collection
 * of any database on any MongoDB connection. The documents are read with every value in its BSON type and inserted
 * batch by batch from a feed (`DocumentsFeed` of kind `query`), so that a copy of millions of documents is a plan of
 * a few steps.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Answers, Context, Outcome, Plan, ReadFeature, ReadRequest, Step } from '../../shared/feature';
import { ask, needRead, refuse, run } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { groupThousands } from '../../shared/text-units';
import { nothingToDo } from '../task/types';
import { argsOf, failureOf, isObject, numberOf, textArg } from '../tree/types';
import { askDestination, type Destination } from './ask/destination';
import { parseQueryText } from './export';
import { copyText as text, counted, destinationText } from './text';
import {
  copiedOptions,
  createCollectionStep,
  dropStep,
  fedStep,
  indexCount,
  indexSteps,
  insertUndo,
  isPlainObject,
  type JsonDocument,
  type Namespace,
} from './types';

/** How a copy writes into a collection that exists. */
export type CopyMode = 'append' | 'replace' | 'drop';

/** What the source is, read before the questions that depend on it. */
export interface SourceInfo {
  /** `collection`, `view` or `timeseries`. */
  readonly type: string;
  readonly options: JsonDocument;
  readonly indexes: readonly JsonDocument[];
  /** The documents of the destination, when it exists. */
  readonly destinationCount?: number;
}

/** How long the count may take, in milliseconds (the card's `maxTimeMS: 60000`). */
export const countTimeLimitMs = 60_000;

function isSourceInfo(value: unknown): value is SourceInfo {
  return isPlainObject(value) && typeof value['type'] === 'string' && Array.isArray(value['indexes']);
}

function namespaceText(connection: string, on: Namespace): string {
  return `${connection} › ${on.database}.${on.collection}`;
}

/** The mode, when the destination exists: asked. */
function modeOf(answers: Answers, destination: Destination, info: SourceInfo, title: (step: string) => string) {
  const mode = answers['mode'];
  if (!destination.exists || mode === 'append' || mode === 'replace' || mode === 'drop') {
    return destination.exists ? (mode as CopyMode) : undefined;
  }
  const count = groupThousands(info.destinationCount ?? 0);
  const choices = [
    { value: 'append', ...text.modes.append },
    { value: 'replace', ...text.modes.replace },
    {
      value: 'drop',
      label: text.modes.drop.label,
      description: text.modes.drop.description(count, destination.collection),
    },
  ];
  const step = title(text.existsStep(destination.collection, destination.view.name, destination.database));
  return ask({
    title: step,
    button: destinationText.next,
    fields: [{ kind: 'pick-one', key: 'mode', label: step, choices }],
  });
}

/** The filter, parsed: asked once; asked again with the error while it does not parse. */
function filterOf(answers: Answers, title: (step: string) => string): Outcome | { text: string; filter: Json } {
  const typed = answers['filter'];
  const question = (problem?: string): Outcome => {
    const step = title(text.filterStep);
    return ask({
      title: step,
      text: problem ?? text.filterPrompt,
      button: destinationText.next,
      fields: [{ kind: 'text', key: 'filter', label: step, placeholder: text.filterExample }],
    });
  };
  if (typeof typed !== 'string') {
    return question();
  }
  if (typed.trim() === '') {
    return { text: '', filter: {} };
  }
  try {
    return { text: typed.trim(), filter: parseQueryText(typed) };
  } catch (error) {
    return question(error instanceof Error ? error.message : String(error));
  }
}

/** What else is copied: the indexes, and for a new or recreated collection its options. */
function alsoOf(answers: Answers, info: SourceInfo, creates: boolean, title: (step: string) => string) {
  const indexes = indexCount(info.indexes);
  const choices = [
    ...(indexes > 0 ? [{ value: 'indexes', label: text.indexes, description: text.indexesBesides(indexes) }] : []),
    ...(creates ? [{ value: 'options', label: text.options, description: text.optionsDescription }] : []),
  ];
  if (info.type === 'view' || choices.length === 0) {
    return { indexes: false, options: false };
  }
  const also = answers['also'];
  if (!Array.isArray(also)) {
    const step = title(text.alsoStep);
    const values = choices.map((choice) => choice.value);
    return ask({
      title: step,
      button: destinationText.next,
      fields: [{ kind: 'pick-many', key: 'also', label: step, choices, default: values }],
    });
  }
  return { indexes: also.includes('indexes') && indexes > 0, options: also.includes('options') && creates };
}

/** The steps: drop, create, the documents batch by batch, the indexes. */
function copySteps(
  context: Context,
  source: Namespace,
  to: Destination,
  how: {
    mode: CopyMode | undefined;
    filter: Json;
    indexes: boolean;
    options: boolean;
    info: SourceInfo;
    count: number;
    destination: string;
  },
): Step[] {
  const creates = how.mode === undefined || how.mode === 'drop';
  const { connection, database, collection } = source;
  const feed = { kind: 'query', connection, database, collection, filter: how.filter } as const;
  const method = how.mode === 'replace' ? 'bulkWrite' : 'insertMany';
  return [
    ...(how.mode === 'drop' ? [dropStep(to, context.target)] : []),
    ...(creates ? [createCollectionStep(to, how.options ? copiedOptions(how.info.options) : {}, context.target)] : []),
    fedStep(
      to,
      { method, options: { ordered: false }, from: `documents of ${source.collection}`, feed },
      context.target,
      { title: text.progressTitle(`${database}.${collection}`, how.destination), total: how.count, unit: 'documents' },
    ),
    ...(how.indexes ? indexSteps(to, how.info.indexes, context.target) : []),
  ];
}

/** The plan once everything is known. */
function copyPlan(
  context: Context,
  source: Namespace & { readonly name: string },
  to: Destination,
  how: {
    mode: CopyMode | undefined;
    filter: { text: string; filter: Json };
    indexes: boolean;
    options: boolean;
    info: SourceInfo;
    count: number;
  },
): Plan {
  const from = namespaceText(source.name, source);
  const destination = namespaceText(to.view.name, to);
  const verb = text.verbs[how.mode ?? 'new'];
  const lines = [
    text.confirm(how.count, from, destination),
    text.destinationLine(verb, destination),
    how.filter.text === '' ? text.allDocuments : text.filterLine(how.filter.text),
    ...(how.indexes ? [text.indexesAfter] : []),
    ...(how.options ? [text.withOptions] : []),
  ];
  const title = how.filter.text === '' ? text.undoTitle(from) : text.undoTitleFiltered(from);
  const kind = how.mode === 'replace' ? 'replaced' : 'inserted';
  const undo =
    how.mode === 'drop'
      ? { cannot: text.cannotUndo }
      : insertUndo(context, to.view, how.count, {
          kind,
          connection: to.connection,
          database: to.database,
          collection: to.collection,
          title,
        });
  const steps = copySteps(context, source, to, { ...how, filter: how.filter.filter, destination });
  return {
    title,
    steps,
    danger:
      how.mode === 'drop'
        ? { kind: 'destructive', text: lines.join('\n'), button: text.button, name: to.collection }
        : { kind: 'confirm', text: lines.join('\n'), button: text.button },
    touches: counted(how.count, 'document'),
    undo,
    publishes: false,
    after: [{ kind: 'refresh', connection: to.connection }],
  };
}

/** Feature: transfer.copy-collection — on a collection or view: the destination, the mode, the filter, what else. */
export function plan(context: Context, answers: Answers): Outcome {
  const target = context.target;
  const connection = 'connection' in target ? savedConnection(context.state.connections, target.connection) : undefined;
  if (target.kind !== 'collection' || connection === undefined) {
    return nothingToDo(text.command, '');
  }
  const source = { connection: target.connection, database: target.database, collection: target.collection };
  const title = (step: string): string => text.title(`${source.database}.${source.collection}`, step);
  const destination = askDestination(
    context,
    source,
    {
      title,
      where: text.where,
      collectionPrompt: text.collectionPrompt,
      sameDatabaseName: `${source.collection}_copy`,
      viewName: text.viewName,
      refuseSource: text.beingCopied,
      readOnly: (name) => refuse('transfer.copy-collection/read-only', text.readOnly(name)),
      notConnected: (message) => refuse('transfer.copy-collection/not-connected', message),
    },
    answers,
  );
  if ('kind' in destination) {
    return destination;
  }
  const info = answers['source'];
  if (!isSourceInfo(info)) {
    const to = destination.exists
      ? { connection: destination.connection, database: destination.database, collection: destination.collection }
      : null;
    return needRead('source', 'transfer.copy-collection:read', { ...source, destination: to });
  }
  const mode = modeOf(answers, destination, info, title);
  if (typeof mode === 'object') {
    return mode;
  }
  const filter = filterOf(answers, title);
  if ('kind' in filter) {
    return filter;
  }
  const also = alsoOf(answers, info, mode === undefined || mode === 'drop', title);
  if ('kind' in also) {
    return also;
  }
  const count = numberOf(answers['count']);
  if (count === undefined) {
    return needRead('count', 'transfer.copy-collection:count', {
      ...source,
      filter: filter.filter,
      view: info.type === 'view',
    });
  }
  return run(
    copyPlan(context, { ...source, name: connection.name }, destination, { mode, filter, ...also, info, count }),
  );
}

function onCollection(on: Namespace, method: string, args: readonly Json[], limit?: number): MongoRequest {
  return {
    engine: 'mongodb',
    database: on.database,
    collection: on.collection,
    method,
    arguments: args,
    ...(limit === undefined ? {} : { limit }),
    timeLimitMs: countTimeLimitMs,
  };
}

/** `db.getCollectionInfos({ name: "<collection>" })`. */
function listRequest(on: Namespace): MongoRequest {
  return {
    engine: 'mongodb',
    database: on.database,
    method: 'listCollections',
    arguments: [{ name: on.collection }, {}],
    timeLimitMs: countTimeLimitMs,
  };
}

function namespaceArg(args: Json, name?: string): Namespace {
  const of = name === undefined ? args : (argsOf(args)[name] ?? null);
  return {
    connection: connectionId(textArg(of, 'connection')),
    database: textArg(of, 'database'),
    collection: textArg(of, 'collection'),
  };
}

function checked(reply: unknown): unknown {
  const failure = failureOf(reply);
  if (failure !== undefined) {
    throw new Error(failure);
  }
  return reply;
}

/** `transfer.copy-collection:read`: the source's type and options, its indexes, and the destination's count. */
export const sourceRead: ReadFeature = {
  kind: 'read',
  id: featureId('transfer.copy-collection:read'),
  request: (_context: Context, args: Json): ReadRequest => {
    const source = namespaceArg(args);
    const to = argsOf(args)['destination'];
    const requests = [
      { connection: source.connection, request: listRequest(source) },
      { connection: source.connection, request: onCollection(source, 'listIndexes', [], 1000) },
      ...(isObject(to)
        ? [
            {
              connection: namespaceArg(args, 'destination').connection,
              request: onCollection(namespaceArg(args, 'destination'), 'estimatedDocumentCount', []),
            },
          ]
        : []),
    ];
    return { kind: 'engine', requests };
  },
  parse: (replies: readonly unknown[]): SourceInfo => {
    const [listed, indexes, count] = replies;
    const entries = checked(listed);
    const entry = Array.isArray(entries) ? (entries[0] as unknown) : undefined;
    const type = isObject(entry) && typeof entry['type'] === 'string' ? entry['type'] : 'collection';
    const options = isObject(entry) && isPlainObject(entry['options']) ? (entry['options'] as JsonDocument) : {};
    const specs = type === 'view' ? [] : checked(indexes);
    return {
      type,
      options,
      indexes: (Array.isArray(specs) ? specs : []).filter(isPlainObject) as JsonDocument[],
      ...(count === undefined ? {} : { destinationCount: numberOf(count) ?? 0 }),
    };
  },
};

/** `transfer.copy-collection:count`: `countDocuments(<filter>)` with a filter or on a view, else the estimate. */
export const countRead: ReadFeature = {
  kind: 'read',
  id: featureId('transfer.copy-collection:count'),
  request: (_context: Context, args: Json): ReadRequest => {
    const source = namespaceArg(args);
    const filter = argsOf(args)['filter'] ?? {};
    const all = isObject(filter) && Object.keys(filter).length === 0 && argsOf(args)['view'] !== true;
    const request = all
      ? onCollection(source, 'estimatedDocumentCount', [])
      : onCollection(source, 'countDocuments', [filter, { maxTimeMS: { $numberInt: String(countTimeLimitMs) } }]);
    return { kind: 'engine', requests: [{ connection: source.connection, request }] };
  },
  parse: (replies: readonly unknown[]): number => numberOf(checked(replies[0])) ?? 0,
};
