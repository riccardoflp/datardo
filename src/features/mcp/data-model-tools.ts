/**
 * Feature: mcp.data-model-tools
 *
 * Quick questions about the data model: counts (`count_documents`), the values of a field (`distinct_values`), the
 * references between collections (`describe_relations`), a collection's definition (`collection_options`), the
 * queries the user saved (`list_saved_queries`), and whether a MongoDB connection publishes for redis-oplog
 * (`redis_oplog_status`, which keeps Mongoster's name). None writes to MongoDB or to Redis; `check` sends only `PING`;
 * the linked connection's string is never returned.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { listAction, parse as parseQueries, request as queriesRequest } from '../saved-query/list';
import { boolArg, collectionArgs, intArg, requiredArg, stringArg, toolConnection } from './arguments';
import { COUNT_CAP, clippedLine, counted } from './output-limits';
import { mcpSettings } from './read-data';
import { optionsText } from './tool/collection-options';
import { listOf, mongoCall, numberIn, recordOf, shellText, type MongoPlace } from './tool/mongo';
import { replyOrProblem, ToolProblem, type ToolSession } from './tool/program';
import { queryArgs } from './tool/query';
import { redisOplogStatus } from './tool/oplog-status';
import { savedQueriesText } from './tool/saved-queries';
import {
  booleanProp,
  collectionProp,
  connectionProp,
  databaseProp,
  endOf,
  filterProp,
  groupOf,
  integerProp,
} from './tool/schemas';
import { isFailed, type ToolCall, type ToolEnd, type ToolStep } from './types';

function placeOf(target: ReturnType<typeof collectionArgs>): MongoPlace {
  return { connection: target.connection.id, database: target.database, collection: target.collection };
}

function countDocuments(session: ToolSession): string {
  const query = queryArgs(session);
  const exact = boolArg(session.args, 'exact', false);
  const target = collectionArgs(session);
  const empty = Object.keys(query.filter).length === 0;
  const [count, estimate] = session.send([
    mongoCall(placeOf(target), 'countDocuments', [query.filter, exact ? {} : { limit: COUNT_CAP }]),
    ...(empty ? [mongoCall(placeOf(target), 'estimatedDocumentCount', [{}])] : []),
  ]);
  const number = numberIn(replyOrProblem(count, 'The count failed: ')) ?? 0;
  const capped = !exact && number >= COUNT_CAP;
  const counting = capped ? `at least ${counted(COUNT_CAP, 'document')}` : counted(number, 'document');
  const name = `${target.database}.${target.collection}`;
  const head = empty
    ? `${name} has ${counting}`
    : `${name}: ${counting} ${number === 1 && !capped ? 'matches' : 'match'} ${query.text.filter}`;
  const estimated = estimate === undefined || isFailed(estimate) ? undefined : numberIn(estimate);
  return [
    `${head}${capped ? ' (counting stopped there: pass exact: true for the exact number)' : ''}.`,
    ...(estimated === undefined ? [] : [`Estimate from the collection's metadata: ${counted(estimated, 'document')}.`]),
  ].join('\n');
}

/** The aggregation of `distinct_values`: an array's elements counted once per document, the most frequent first. */
export function distinctPipeline(field: string, filter: Json, limit: number): readonly Json[] {
  const path = `$${field}`;
  const present = { '_id.missing': false, '_id.v': { $ne: null } };
  return [
    ...(Object.keys(recordOf(filter)).length === 0 ? [] : [{ $match: filter }]),
    { $project: { _id: 0, v: { $cond: [{ $isArray: path }, { $setUnion: [path] }, path] } } },
    { $unwind: { path: '$v', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { v: '$v', missing: { $eq: [{ $type: '$v' }, 'missing'] } },
        n: { $sum: 1 },
        types: { $addToSet: { $type: '$v' } },
      },
    },
    {
      $facet: {
        values: [{ $match: present }, { $sort: { n: -1, '_id.v': 1 } }, { $limit: limit }],
        total: [{ $match: present }, { $count: 'n' }],
        nulls: [{ $match: { '_id.missing': false, '_id.v': null } }, { $group: { _id: null, n: { $sum: '$n' } } }],
        missing: [{ $match: { '_id.missing': true } }, { $group: { _id: null, n: { $sum: '$n' } } }],
      },
    },
  ];
}

function facetCount(result: Readonly<Record<string, unknown>>, name: string): number {
  return numberIn(recordOf(listOf(result[name])[0])['n']) ?? 0;
}

function distinctValues(session: ToolSession): string {
  const field = requiredArg(session.args, 'field');
  if (field.startsWith('$') || field.split('.').some((part) => part === '')) {
    throw new ToolProblem(`field must be a field path like address.city, not ${JSON.stringify(field)}.`);
  }
  const query = queryArgs(session);
  const limit = intArg(session.args, 'limit', [50, 1, 500]);
  const target = collectionArgs(session);
  const [reply] = session.send([
    mongoCall(placeOf(target), 'aggregate', [distinctPipeline(field, query.filter, limit), { allowDiskUse: true }], 1),
  ]);
  const result = recordOf(listOf(replyOrProblem(reply, 'The aggregation failed: '))[0]);
  const values = listOf(result['values']).map(recordOf);
  const total = facetCount(result, 'total');
  const types = [...new Set(values.flatMap((value) => listOf(value['types']).map(String)))].sort();
  const where = `${target.database}.${target.collection}${query.text.filter === '' ? '' : ` (filter ${query.text.filter})`}`;
  const typed = types.length > 1 ? `, of types ${types.join(', ')}` : types.length === 1 ? ` (${types[0] ?? ''})` : '';
  const lines = values.map((value) => {
    const shown = clippedLine(shellText(recordOf(value['_id'])['v'] ?? null));
    const ofType = types.length > 1 ? ` (${listOf(value['types']).map(String).join(', ')})` : '';
    return `- ${shown}${ofType}: ${counted(numberIn(value['n']) ?? 0, 'document')}`;
  });
  return [
    `${where}, field ${field}: ${counted(total, 'distinct value')}${total > values.length ? `, the ${String(values.length)} most frequent shown` : ''}${typed}.`,
    ...(lines.length === 0 ? [] : ['', ...lines]),
    '',
    `null: ${counted(facetCount(result, 'nulls'), 'document')}. Missing or an empty array: ${counted(facetCount(result, 'missing'), 'document')}.`,
  ].join('\n');
}

/**
 * A reference between collections as `relation.detect` (M34) finds it. That card is not built yet: the main process
 * answers the app action `relation.detect` with these once it is, and the tool writes them.
 */
export interface DetectedRelation {
  readonly kind: 'reference' | 'dbref' | 'view';
  readonly from: string;
  readonly field?: string;
  readonly to: string;
  readonly toField?: string;
  readonly many?: boolean;
  readonly matched?: number;
  readonly tested?: number;
}

/** `- orders.customerId → customers._id (one per document; 20 of 20 sampled values found, 100%)`. */
export function relationLine(relation: DetectedRelation): string {
  if (relation.kind === 'view') {
    return `- ${relation.from} is a view on ${relation.to}`;
  }
  const how = relation.many === true ? 'an array of references' : 'one per document';
  const matched = relation.matched ?? 0;
  const tested = relation.tested ?? 0;
  const found =
    relation.kind === 'dbref'
      ? 'DBRef'
      : `${String(matched)} of ${String(tested)} sampled values found, ${String(Math.round((matched / Math.max(1, tested)) * 100))}%`;
  return `- ${relation.from}.${relation.field ?? '?'} → ${relation.to}.${relation.toField ?? '_id'} (${how}; ${found})`;
}

function describeRelations(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const database = requiredArg(session.args, 'database');
  const collection = stringArg(session.args, 'collection');
  const sample = intArg(session.args, 'sample', [100, 1, 2000]);
  const reply = recordOf(
    replyOrProblem(session.app('relation.detect', { connection: connection.id, database, sample })),
  );
  const relations = listOf(reply['relations']) as readonly DetectedRelation[];
  const collections = listOf(reply['collections']).map(String);
  if (collection !== undefined && !collections.includes(collection)) {
    throw new ToolProblem(`${database}.${collection} doesn't exist on ${connection.name}: use list_collections.`);
  }
  const lines = [
    `${database}: ${counted(collections.length, 'collection')} sampled (up to ${counted(sample, 'document')} each).`,
  ];
  if (collection === undefined) {
    lines.push(
      '',
      ...(relations.length === 0
        ? ['No field of the sampled documents refers to another collection.']
        : relations.map(relationLine)),
    );
  } else {
    const out = relations.filter((each) => each.from === collection);
    const into = relations.filter((each) => each.to === collection && each.from !== collection);
    lines.push('', `From ${collection}:`, ...(out.length === 0 ? ['- none found'] : out.map(relationLine)));
    lines.push('', `To ${collection}:`, ...(into.length === 0 ? ['- none found'] : into.map(relationLine)));
  }
  return lines.join('\n');
}

function collectionOptions(session: ToolSession): string {
  const target = collectionArgs(session);
  const namespace = `${target.database}.${target.collection}`;
  const [sharded] = session.send([
    mongoCall({ connection: target.connection.id, database: 'config', collection: 'collections' }, 'findOne', [
      { _id: namespace, dropped: { $ne: true } },
    ]),
  ]);
  return optionsText(namespace, target.entry, isFailed(sharded) ? null : sharded);
}

function listSavedQueries(session: ToolSession): string {
  const target = collectionArgs(session);
  const args = { connection: target.connection.id, database: target.database, collection: target.collection };
  const asked = queriesRequest(session.context, args);
  const reply = session.app(listAction, asked.kind === 'app' ? asked.args : args);
  const queries = parseQueries([replyOrProblem(reply)], args);
  return savedQueriesText(queries, mcpSettings(session.context.state.settings).readData);
}

/** The tools of this group. */
export const group = groupOf('mcp.data-model-tools', [
  {
    name: 'count_documents',
    title: 'Count documents',
    description: `The number of documents that match a filter (counting stops at 100,000 unless exact is true); with no filter, also the estimate from the collection's metadata.`,
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      filter: filterProp,
      exact: booleanProp(false, 'Count past 100,000 (slower on big collections).'),
    },
    required: ['connection', 'database', 'collection'],
    run: countDocuments,
  },
  {
    name: 'distinct_values',
    title: 'Distinct values of a field',
    description:
      'The distinct values of a field in mongosh syntax, with how many documents have each, most frequent first; their types when mixed; the documents with null and without the field.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      field: { type: 'string', description: 'Field path, e.g. status or address.city.' },
      filter: filterProp,
      limit: integerProp(1, 500, 50, 'Values returned (the most frequent).'),
    },
    required: ['connection', 'database', 'collection', 'field'],
    readsData: true,
    run: distinctValues,
  },
  {
    name: 'describe_relations',
    title: 'Describe the relations between collections',
    description:
      'The fields that reference other collections in a database, DBRefs and views, found by sampling every collection. With collection, only the references from and to it.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: { type: 'string', description: 'Only the references from and to this collection.' },
      sample: integerProp(1, 2000, 100, 'Documents sampled per collection.'),
    },
    required: ['connection', 'database'],
    run: describeRelations,
  },
  {
    name: 'collection_options',
    title: 'Collection options',
    description:
      "A collection's definition: kind, validator with its level and action, a view's source and pipeline, capped size, time series options, clustered index, expireAfterSeconds, collation, pre- and post-images, shard key.",
    properties: { connection: connectionProp, database: databaseProp, collection: collectionProp },
    required: ['connection', 'database', 'collection'],
    run: collectionOptions,
  },
  {
    name: 'list_saved_queries',
    title: 'List saved queries',
    description:
      'The queries the user saved for a collection, those in the queries folder with their file and those for the user, and the recent ones, newest first.',
    properties: { connection: connectionProp, database: databaseProp, collection: collectionProp },
    required: ['connection', 'database', 'collection'],
    run: listSavedQueries,
  },
  {
    name: 'redis_oplog_status',
    title: 'redis-oplog status of a MongoDB connection',
    description:
      "Whether a MongoDB connection publishes Datardo's writes to Redis for redis-oplog: the linked connection, the channel prefix, what is published, the channels of a collection, the last error, and with check whether Redis answers.",
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: collectionProp,
      check: booleanProp(false, 'Send PING to the linked Redis connection.'),
    },
    required: ['connection'],
    run: redisOplogStatus,
  },
]);

/** Feature: mcp.data-model-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.data-model-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
