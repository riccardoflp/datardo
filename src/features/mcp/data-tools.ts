/**
 * Feature: mcp.data-tools
 *
 * The basic tools: what is saved in Datardo (`list_connections`, both engines), what each MongoDB deployment holds
 * (`list_databases`, `list_collections`), the shape of a collection (`describe_collection`), and documents found with
 * a query (`find_documents`) or an aggregation (`aggregate`). None of them writes: they send only `listDatabases`,
 * `listCollections`, `$sample`, `listIndexes`, `$listSearchIndexes`, `find`, `countDocuments` and `aggregate` without
 * `$out` or `$merge`. No connection string, password, SSH passphrase or user name is ever returned.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { connectionState } from '../../shared/state/connections';
import { groupThousands } from '../../shared/text-units';
import { collectionArgs, intArg, requiredArg, toolConnection } from './arguments';
import { bounds, COUNT_CAP, counted, MOST_FIELDS } from './output-limits';
import { fieldLine, sampledFields } from './tool/fields';
import {
  documentsText,
  listOf,
  mongoCall,
  mongoCommand,
  numberIn,
  recordOf,
  shellText,
  textIn,
  type MongoPlace,
} from './tool/mongo';
import { replyOrProblem, type ToolSession } from './tool/program';
import { pipelineArg, queryArgs } from './tool/query';
import {
  collectionProp,
  connectionProp,
  databaseProp,
  endOf,
  filterProp,
  groupOf,
  integerProp,
  pipelineProp,
  projectionProp,
  sortProp,
} from './tool/schemas';
import { isFailed, type ToolCall, type ToolEnd, type ToolStep } from './types';

function listConnections(session: ToolSession): string {
  const { connections } = session.context.state;
  if (connections.saved.length === 0) {
    return 'No connections are saved in Datardo.';
  }
  const listed = connections.saved.map((each) => ({
    name: each.name,
    id: each.id,
    engine: each.engine,
    ...(each.folder === undefined ? {} : { folder: each.folder }),
    ...(each.readOnly ? { readOnly: true } : {}),
    connected: connectionState(connections, each.id) === 'connected',
  }));
  return JSON.stringify(listed, null, 2);
}

function listDatabases(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const [reply] = session.send([
    mongoCommand({ connection: connection.id, database: 'admin' }, { listDatabases: 1, nameOnly: false }),
  ]);
  const databases = listOf(recordOf(replyOrProblem(reply))['databases']).map((each) => {
    const database = recordOf(each);
    return {
      name: textIn(database['name']) ?? '',
      sizeOnDisk: numberIn(database['sizeOnDisk']) ?? 0,
      empty: database['empty'] === true,
    };
  });
  return JSON.stringify(databases, null, 2);
}

function listCollections(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const database = requiredArg(session.args, 'database');
  const [reply] = session.send([mongoCall({ connection: connection.id, database }, 'listCollections', [{}, {}])]);
  const entries = listOf(replyOrProblem(reply)).map(recordOf);
  if (entries.length === 0) {
    return `${database} has no collections.`;
  }
  const listed = entries
    .map((entry) => {
      const viewOn = textIn(recordOf(entry['options'])['viewOn']);
      return {
        name: textIn(entry['name']) ?? '',
        type: textIn(entry['type']) ?? 'collection',
        ...(viewOn === undefined ? {} : { viewOn }),
      };
    })
    .sort((one, other) => (one.name < other.name ? -1 : one.name > other.name ? 1 : 0));
  return JSON.stringify(listed, null, 2);
}

/** `- name: { key } unique sparse TTL 3600s partial { … } hidden`. */
export function indexLine(index: Readonly<Record<string, unknown>>): string {
  const ttl = numberIn(index['expireAfterSeconds']);
  return [
    `- ${textIn(index['name']) ?? ''}: ${shellText(index['key'] ?? {})}`,
    ...(index['unique'] === true ? ['unique'] : []),
    ...(index['sparse'] === true ? ['sparse'] : []),
    ...(ttl === undefined ? [] : [`TTL ${String(ttl)}s`]),
    ...(index['partialFilterExpression'] === undefined
      ? []
      : [`partial ${shellText(index['partialFilterExpression'])}`]),
    ...(index['hidden'] === true ? ['hidden'] : []),
  ].join(' ');
}

function searchIndexLines(reply: unknown): readonly string[] {
  const indexes = isFailed(reply) ? [] : listOf(reply).map(recordOf);
  if (indexes.length === 0) {
    return [];
  }
  return [
    '',
    'Search indexes (the `index` of $search and $vectorSearch, which must be the first stage):',
    ...indexes.map((index) => {
      const status = textIn(index['status']);
      const type = textIn(index['type']) ?? 'search';
      return `- ${textIn(index['name']) ?? ''}: ${type}${status === undefined ? '' : ` ${status}`} ${shellText(index['latestDefinition'] ?? {})}`;
    }),
  ];
}

function describeCollection(session: ToolSession): string {
  const sample = intArg(session.args, 'sample', [200, 1, 1000]);
  const target = collectionArgs(session);
  const place: MongoPlace = {
    connection: target.connection.id,
    database: target.database,
    collection: target.collection,
  };
  const [estimate, documents, indexes, search] = session.send([
    mongoCall(place, 'estimatedDocumentCount', [{}]),
    mongoCall(place, 'aggregate', [[{ $sample: { size: sample } }], {}], sample),
    mongoCall(place, 'listIndexes', [{}]),
    mongoCall(place, 'aggregate', [[{ $listSearchIndexes: {} }], {}]),
  ]);
  const count = isFailed(estimate) ? undefined : numberIn(estimate);
  const sampled = listOf(replyOrProblem(documents)) as readonly Json[];
  const fields = sampledFields(sampled);
  const indexList = isFailed(indexes) ? [] : listOf(indexes).map(recordOf);
  const isView = target.entry['type'] === 'view';
  return [
    `${target.database}.${target.collection}: ${count === undefined ? 'unknown number of' : `about ${counted(count, 'document')},`} ${counted(sampled.length, 'document')} sampled.`,
    '',
    'Indexes:',
    ...(indexList.length === 0 || isView ? ['- none (a view)'] : indexList.map(indexLine)),
    ...searchIndexLines(search),
    '',
    'Fields (path: types, % of documents that have it):',
    ...fields.slice(0, MOST_FIELDS).map((field) => fieldLine(field, sampled.length)),
    ...(fields.length > MOST_FIELDS ? ['- … more fields were not listed'] : []),
  ].join('\n');
}

function matchingText(total: unknown): string {
  const count = isFailed(total) ? undefined : numberIn(total);
  if (count === undefined) {
    return 'An unknown number of documents match';
  }
  return count >= COUNT_CAP
    ? `At least ${counted(COUNT_CAP, 'document')} match`
    : `${counted(count, 'document')} match`;
}

function findDocuments(session: ToolSession): string {
  const query = queryArgs(session);
  const skip = intArg(session.args, 'skip', [0, 0, Number.MAX_SAFE_INTEGER]);
  const range = bounds.documents;
  const limit = intArg(session.args, 'limit', range);
  const target = collectionArgs(session);
  const place: MongoPlace = {
    connection: target.connection.id,
    database: target.database,
    collection: target.collection,
  };
  const options = {
    ...(query.sort === undefined ? {} : { sort: query.sort }),
    ...(query.projection === undefined ? {} : { projection: query.projection }),
    skip,
    limit,
  };
  const [found, total] = session.send([
    mongoCall(place, 'find', [query.filter, options], limit),
    mongoCall(place, 'countDocuments', [query.filter, { limit: COUNT_CAP }]),
  ]);
  const documents = listOf(replyOrProblem(found));
  const shown =
    documents.length === 0
      ? 'none returned'
      : `showing ${groupThousands(skip + 1)}–${groupThousands(skip + documents.length)}`;
  return `${target.database}.${target.collection}: ${matchingText(total)}, ${shown}.\n\n${documentsText(documents)}`;
}

function aggregate(session: ToolSession): string {
  const pipeline = pipelineArg(session);
  const range = bounds.documents;
  const limit = intArg(session.args, 'limit', range);
  const target = collectionArgs(session);
  const place: MongoPlace = {
    connection: target.connection.id,
    database: target.database,
    collection: target.collection,
  };
  const [reply] = session.send([mongoCall(place, 'aggregate', [pipeline.pipeline, {}], limit + 1)]);
  const results = listOf(replyOrProblem(reply));
  const more = results.length > limit;
  const shown = results.slice(0, limit);
  const head = `${target.database}.${target.collection}: ${counted(shown.length, 'result')}${more ? ` (the first ${String(limit)}; there are more)` : ''}.`;
  return `${head}\n\n${documentsText(shown)}`;
}

const documentsLimit = integerProp(1, 100, 20, 'Documents returned.');

/** The tools of this group. */
export const group = groupOf('mcp.data-tools', [
  {
    name: 'list_connections',
    title: 'List connections',
    description:
      'The connections saved in Datardo, MongoDB and Redis: name, id, engine, folder, whether they are read-only and connected. Connection strings and passwords are never returned.',
    properties: {},
    required: [],
    run: listConnections,
  },
  {
    name: 'list_databases',
    title: 'List databases',
    description: 'The databases of a MongoDB connection, with their size on disk.',
    properties: { connection: connectionProp },
    required: ['connection'],
    run: listDatabases,
  },
  {
    name: 'list_collections',
    title: 'List collections',
    description: 'The collections and views of a MongoDB database.',
    properties: { connection: connectionProp, database: databaseProp },
    required: ['connection', 'database'],
    run: listCollections,
  },
  {
    name: 'describe_collection',
    title: 'Describe a collection',
    description:
      'The structure of a collection: estimated number of documents, indexes, and the fields found in a random sample of documents with their BSON types and how often they are present. Use it to write correct filters and pipelines.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      sample: integerProp(1, 1000, 200, 'Documents sampled.'),
    },
    required: ['connection', 'database', 'collection'],
    run: describeCollection,
  },
  {
    name: 'find_documents',
    title: 'Find documents',
    description:
      'Runs a find query and returns the matching documents in mongosh syntax (ObjectId(…), ISODate(…), NumberLong(…)), with how many match in total. Read only.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      filter: filterProp,
      sort: sortProp,
      projection: projectionProp,
      skip: { type: 'integer', minimum: 0, default: 0 },
      limit: documentsLimit,
    },
    required: ['connection', 'database', 'collection'],
    readsData: true,
    run: findDocuments,
  },
  {
    name: 'aggregate',
    title: 'Run an aggregation',
    description:
      'Runs an aggregation pipeline and returns its first results in mongosh syntax. Pipelines with $out or $merge are refused. Read only.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      pipeline: pipelineProp,
      limit: integerProp(1, 100, 20, 'Results returned.'),
    },
    required: ['connection', 'database', 'collection', 'pipeline'],
    readsData: true,
    run: aggregate,
  },
]);

/** Feature: mcp.data-tools — what the tool of a call sends next, given the replies of its rounds so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.data-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
