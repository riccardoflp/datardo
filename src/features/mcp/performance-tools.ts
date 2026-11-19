/**
 * Feature: mcp.performance-tools
 *
 * Find what makes a database slow: how a query runs (`explain_query`), the slow operations by query shape
 * (`slow_queries`), what the server runs now (`current_operations`), the indexes to create or drop (`index_advice`),
 * and the size of a collection and of its indexes (`collection_stats`). They only read: the profiler is read with
 * `profile: -1`, which never changes its level; no operation is killed; the `createIndex` commands are only text.
 */
import type { Json } from '../../shared/engine-request';
import type { Context } from '../../shared/feature';
import { boolArg, collectionArgs, intArg, oneOfArg, requiredArg, stringArg, toolConnection } from './arguments';
import { counted, MAX_TIME_MS } from './output-limits';
import { mcpSettings } from './read-data';
import { adviceText, type AdvisorReply } from './tool/advice';
import { notAuthorized } from './tool/deployment';
import { explainText, suggestIndex, summarizeExplain } from './tool/explain';
import { listOf, mongoCall, recordOf, textIn, shellText, type MongoPlace } from './tool/mongo';
import { microsOf, operationText, statsText } from './tool/operations';
import { replyOrProblem, ToolProblem, type ToolSession } from './tool/program';
import { pipelineArg, queryArgs } from './tool/query';
import {
  booleanProp,
  collectionProp,
  connectionProp,
  databaseProp,
  endOf,
  filterProp,
  groupOf,
  integerProp,
  namesProp,
  pipelineProp,
  projectionProp,
  sortProp,
} from './tool/schemas';
import { refusedSentence, readSlowOps } from './tool/slow-read';
import { groupOps, groupText, inNamespace } from './tool/slow-ops';
import { isFailed, type ToolCall, type ToolEnd, type ToolStep } from './types';

/** The app action the advisor answers (`advisor.analyze`, not on this branch). */
export const advisorAction = 'advisor.analyze';

function indexableOf(pipeline: readonly Json[]): { filter: Record<string, Json>; sort?: Record<string, Json> } {
  const [first, second] = pipeline.map(recordOf);
  const match = first?.['$match'];
  const sort = (match === undefined ? first : second)?.['$sort'];
  return {
    filter: recordOf(match) as Record<string, Json>,
    ...(sort === undefined ? {} : { sort: recordOf(sort) as Record<string, Json> }),
  };
}

function explainQuery(session: ToolSession): string {
  const { args } = session;
  const isPipeline = stringArg(args, 'pipeline') !== undefined;
  const limit = intArg(args, 'limit', [0, 0, Number.MAX_SAFE_INTEGER]);
  const findParts = ['filter', 'sort', 'projection'].some((key) => stringArg(args, key) !== undefined);
  if (isPipeline && (findParts || limit > 0)) {
    throw new ToolProblem(
      'Give either a pipeline or filter/sort/projection/limit, not both: put a $match, $sort, $project or $limit stage in the pipeline instead.',
    );
  }
  const pipeline = isPipeline ? pipelineArg(session) : undefined;
  const query = isPipeline ? undefined : queryArgs(session);
  const target = collectionArgs(session);
  const { database, collection } = target;
  const inner: Json =
    pipeline === undefined
      ? {
          find: collection,
          filter: query?.filter ?? {},
          ...(query?.sort === undefined ? {} : { sort: query.sort }),
          ...(query?.projection === undefined ? {} : { projection: query.projection }),
          ...(limit > 0 ? { limit } : {}),
          maxTimeMS: MAX_TIME_MS,
        }
      : {
          aggregate: collection,
          pipeline: [...pipeline.pipeline],
          cursor: {},
          allowDiskUse: true,
          maxTimeMS: MAX_TIME_MS,
        };
  const [reply] = session.send([
    mongoCall({ connection: target.connection.id, database }, 'runCommand', [
      { explain: inner, verbosity: 'executionStats' },
    ]),
  ]);
  const summary = summarizeExplain(replyOrProblem(reply, 'Explain failed: '));
  const indexable =
    pipeline === undefined ? { filter: query?.filter ?? {}, sort: query?.sort } : indexableOf(pipeline.pipeline);
  const suggestion =
    summary.collscan || summary.inMemorySort ? suggestIndex(indexable.filter, indexable.sort) : undefined;
  const what =
    pipeline === undefined
      ? `find ${query?.text.filter || '{}'}${query?.text.sort ? ` sort ${query.text.sort}` : ''}${limit > 0 ? ` limit ${String(limit)}` : ''}`
      : `aggregate (${counted(pipeline.names.length, 'stage')}: ${pipeline.names.join(', ')})`;
  return explainText(`${database}.${collection} ${what}, explain("executionStats"):`, collection, summary, suggestion);
}

function slowQueries(session: ToolSession): string {
  const { args, context } = session;
  const source = oneOfArg(args, 'source', ['auto', 'profiler', 'log'] as const) ?? 'auto';
  const namespace = stringArg(args, 'namespace');
  const database = stringArg(args, 'database') ?? namespace?.split('.')[0];
  if (source === 'profiler' && database === undefined) {
    throw new ToolProblem('database is required with source "profiler": each database has its own profiler.');
  }
  const sinceMinutes = intArg(args, 'sinceMinutes', [60, 0, 10_000_000]);
  const limit = intArg(args, 'limit', [20, 1, 200]);
  const connection = toolConnection(session, 'mongodb');
  const since = sinceMinutes === 0 ? undefined : context.now - sinceMinutes * 60_000;
  const read = readSlowOps(session, connection, {
    source,
    ...(database === undefined ? {} : { database }),
    ...(since === undefined ? {} : { since }),
  });
  const ops = read.ops.filter((op) => inNamespace(op.ns, namespace));
  const groups = groupOps(ops);
  const from =
    read.used === 'profiler'
      ? `the profiler of ${database ?? '?'} (level ${read.level === undefined ? '?' : String(read.level)}${read.slowms === undefined ? '' : `, slowms ${String(read.slowms)}`})`
      : `the server log (operations slower than ${String(read.slowms ?? 100)} ms${database === undefined ? '' : `, database ${database}`})`;
  const lines = [
    `Slow operations ${sinceMinutes === 0 ? 'recorded' : `of the last ${counted(sinceMinutes, 'minute')}`} from ${from}${namespace === undefined ? '' : ` in ${namespace}`}: ${counted(ops.length, 'operation')} in ${counted(groups.length, 'query shape')}${groups.length === 0 ? '' : ', slowest in total first'}.`,
    ...read.notes,
  ];
  if (groups.length > 0) {
    lines.push('', ...groups.slice(0, limit).map((group, index) => groupText(group, index + 1)));
  }
  if (groups.length > limit) {
    lines.push('', `… ${counted(groups.length - limit, 'more query shape')}: raise limit or narrow with namespace.`);
  }
  return lines.join('\n');
}

function minSecondsArg(value: unknown): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new ToolProblem('minSeconds must be a number of seconds, 0 or more.');
  }
  return seconds;
}

function currentOps(
  session: ToolSession,
  place: MongoPlace,
  all: boolean,
): { inprog: readonly unknown[]; own: boolean } {
  const [reply] = session.send([mongoCall(place, 'runCommand', [{ currentOp: 1, $all: all }])]);
  if (!isFailed(reply)) {
    return { inprog: listOf(recordOf(reply)['inprog']), own: false };
  }
  if (!notAuthorized(reply)) {
    throw new ToolProblem(`currentOp failed: ${reply.message}`);
  }
  const [own] = session.send([mongoCall(place, 'runCommand', [{ currentOp: 1, $all: all, $ownOps: true }])]);
  if (isFailed(own)) {
    throw new ToolProblem(refusedSentence(reply, 'list the operations (currentOp)', 'clusterMonitor'));
  }
  return { inprog: listOf(recordOf(own)['inprog']), own: true };
}

function currentOperations(session: ToolSession): string {
  const { args, context } = session;
  const minSeconds = minSecondsArg(args['minSeconds']);
  const namespace = stringArg(args, 'namespace');
  const waiting = boolArg(args, 'waitingForLock', false);
  const includeIdle = boolArg(args, 'includeIdle', false);
  const limit = intArg(args, 'limit', [50, 1, 500]);
  const connection = toolConnection(session, 'mongodb');
  const read = currentOps(session, { connection: connection.id, database: 'admin' }, includeIdle);
  const all = read.inprog.map(recordOf).filter((op) => !('currentOp' in recordOf(op['command'])));
  const ops = all
    .filter((op) => microsOf(op) >= minSeconds * 1e6)
    .filter((op) => {
      const ns = textIn(op['ns']) ?? '';
      return inNamespace(ns, namespace) || inNamespace(ns.replace(/\.\$cmd$/u, ''), namespace);
    })
    .filter((op) => !waiting || op['waitingForLock'] === true)
    .sort(
      (one, other) =>
        Number(other['active'] === true) - Number(one['active'] === true) || microsOf(other) - microsOf(one),
    );
  const filters = [
    ...(minSeconds > 0 ? [`running ${String(minSeconds)} s or more`] : []),
    ...(namespace === undefined ? [] : [`in ${namespace}`]),
    ...(waiting ? ['waiting for a lock'] : []),
  ];
  const readData = mcpSettings(context.state.settings).readData;
  return [
    `${counted(ops.length, 'operation')}${filters.length === 0 ? '' : ` ${filters.join(', ')}`} (of ${all.length.toLocaleString('en-US')} ${includeIdle ? 'including idle ones' : 'active'})${ops.length > limit ? `, the first ${String(limit)}` : ''}.`,
    ...(read.own ? ["Only the user's own operations: seeing all of them needs the clusterMonitor role (inprog)."] : []),
    ...(ops.length === 0 ? [] : ['', ...ops.slice(0, limit).map((op) => operationText(op, readData))]),
  ].join('\n');
}

function indexAdvice(session: ToolSession): string {
  const database = requiredArg(session.args, 'database');
  const only = stringArg(session.args, 'collection');
  const connection = toolConnection(session, 'mongodb');
  if (only !== undefined) {
    const [reply] = session.send([
      mongoCall({ connection: connection.id, database }, 'listCollections', [{ name: only }, {}]),
    ]);
    const entry = recordOf(listOf(replyOrProblem(reply))[0]);
    if (Object.keys(entry).length === 0) {
      throw new ToolProblem(`${database}.${only} doesn't exist on ${connection.name}: use list_collections.`);
    }
    if (entry['type'] === 'view') {
      const source = textIn(recordOf(entry['options'])['viewOn']) ?? '?';
      return `${database}.${only} is a view: it has no indexes of its own (the indexes of ${source} serve it).`;
    }
  }
  const reply = session.app(advisorAction, {
    connection: connection.id,
    database,
    ...(only === undefined ? {} : { collection: only }),
  });
  const advice = recordOf(replyOrProblem(reply, 'The advisor failed: ')) as unknown as AdvisorReply;
  return adviceText(only === undefined ? database : `${database}.${only}`, advice);
}

function collectionStats(session: ToolSession): string {
  const target = collectionArgs(session);
  const name = `${target.database}.${target.collection}`;
  const options = recordOf(target.entry['options']);
  if (target.entry['type'] === 'view') {
    const source = textIn(options['viewOn']) ?? '?';
    return `${name} is a view on ${source} with the pipeline ${shellText(options['pipeline'] ?? [])}: it stores no documents and has no indexes of its own; use collection_stats on ${source}.`;
  }
  const place: MongoPlace = {
    connection: target.connection.id,
    database: target.database,
    collection: target.collection,
  };
  const [storage, indexes, stats] = session.send([
    mongoCall(place, 'aggregate', [[{ $collStats: { storageStats: {} } }], {}]),
    mongoCall(place, 'listIndexes', [{}]),
    mongoCall(place, 'aggregate', [[{ $indexStats: {} }], {}]),
  ]);
  if (isFailed(storage)) {
    throw new ToolProblem(
      refusedSentence(
        storage,
        `read the statistics of ${name} ($collStats)`,
        'read (collStats action) or clusterMonitor',
      ),
    );
  }
  const shards = listOf(storage)
    .map(recordOf)
    .filter((each) => each['storageStats'] !== undefined)
    .map((each) => recordOf(each['storageStats']));
  const listed = listOf(replyOrProblem(indexes, 'listIndexes failed: ')).map(recordOf);
  const uses = isFailed(stats) ? [] : (listOf(stats) as readonly Json[]);
  const building = uses
    .map(recordOf)
    .filter((each) => each['building'] === true && !listed.some((index) => index['name'] === each['name']))
    .map((each) => recordOf(each['spec']));
  const text = statsText(name, target.entry['type'] === 'timeseries', {
    storage: shards,
    indexes: [...listed, ...building],
    stats: uses,
  });
  const note = isFailed(stats)
    ? notAuthorized(stats)
      ? 'Index uses were not read: $indexStats needs the clusterMonitor role.'
      : `Index uses were not read: ${stats.message}`
    : undefined;
  return note === undefined ? text : `${text}\n\n${note}`;
}

const collectionTarget = { connection: connectionProp, database: databaseProp, collection: collectionProp };

/** The tools of this group. */
export const group = groupOf('mcp.performance-tools', [
  {
    name: 'explain_query',
    title: 'Explain a query',
    description:
      'How MongoDB runs a find (filter, sort, projection, limit) or an aggregation pipeline: explain("executionStats") as text, with the plan (COLLSCAN or the index, in-memory sort, rejected plans), keys and documents examined against returned, time, the stages after the query layer, and the index to create by the ESR rule. executionStats runs the query to measure it (reads only; $out and $merge are refused).',
    properties: {
      ...collectionTarget,
      filter: filterProp,
      sort: sortProp,
      projection: projectionProp,
      limit: { type: 'integer', minimum: 0, description: 'Limit of the find; 0 or absent for none.' },
      pipeline: {
        ...pipelineProp,
        description: `${pipelineProp.description ?? ''} Give either a pipeline or filter/sort/projection/limit.`,
      },
    },
    required: ['connection', 'database', 'collection'],
    run: explainQuery,
  },
  {
    name: 'slow_queries',
    title: 'Slow queries',
    description:
      "The slow operations grouped by query shape (values replaced by ?), slowest in total first: count, total, average and maximum time, documents and keys examined against returned, plan, in-memory sort, an index that could help, last time, apps. Read from the profiler (system.profile) or the server log's Slow query lines; the profiler's level is never changed.",
    properties: {
      connection: connectionProp,
      database: { type: 'string', description: 'Database whose profiler is read; with the log, only its operations.' },
      source: namesProp(
        ['auto', 'profiler', 'log'],
        'auto: the profiler of database when it is on or has entries, otherwise the server log (its last 1,024 lines). profiler needs database.',
      ),
      sinceMinutes: {
        type: 'integer',
        minimum: 0,
        default: 60,
        description: 'Operations of the last minutes; 0 for all.',
      },
      namespace: { type: 'string', description: 'Only this database ("shop") or collection ("shop.orders").' },
      limit: integerProp(1, 200, 20, 'Query shapes returned.'),
    },
    required: ['connection'],
    run: slowQueries,
  },
  {
    name: 'current_operations',
    title: 'Current operations',
    description:
      'The operations running on the server now (currentOp), active and longest first: opid, time, type, namespace, the command on one line, index used, client, app, user, locks, transaction. Never kills anything.',
    properties: {
      connection: connectionProp,
      minSeconds: {
        type: 'number',
        minimum: 0,
        default: 0,
        description: 'Only operations running at least this long.',
      },
      namespace: { type: 'string', description: 'Only this database ("shop") or collection ("shop.orders").' },
      waitingForLock: booleanProp(false, 'Only the operations waiting for a lock.'),
      includeIdle: booleanProp(false, 'Also idle connections, cursors and sessions.'),
      limit: integerProp(1, 500, 50, 'Operations returned.'),
    },
    required: ['connection'],
    run: currentOperations,
  },
  {
    name: 'index_advice',
    title: 'Index advice',
    description:
      'The index advisor for a database or one collection: the indexes to create for the slow operations with their createIndex command and the shapes they serve, the redundant indexes and the one that serves them, the unused and hidden ones, with sizes. Only reads.',
    properties: {
      connection: connectionProp,
      database: databaseProp,
      collection: { type: 'string', description: 'Only this collection.' },
    },
    required: ['connection', 'database'],
    run: indexAdvice,
  },
  {
    name: 'collection_stats',
    title: 'Collection statistics',
    description:
      'Documents, data size, storage size and compression, free space, average document, capped, and each index with its size, uses since when, unique, sparse, TTL, partial, hidden, building.',
    properties: collectionTarget,
    required: ['connection', 'database', 'collection'],
    run: collectionStats,
  },
]);

/** Feature: mcp.performance-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.performance-tools — the text of the answer once every round's replies are in; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
