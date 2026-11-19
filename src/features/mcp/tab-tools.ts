/**
 * Feature: mcp.tab-tools
 *
 * When the user wants to see, browse or edit the results, the AI opens them in Datardo: for MongoDB a query, an
 * aggregation, a search, a change stream, the Monitor page or an explain; for Redis the keys of a pattern, one key or
 * the Server page; and the undo history. The tab opens in Datardo's window and becomes active; the AI gets one
 * sentence. Opening a tab writes nothing, and no tool clicks for the user, opens a console or a playground, or fills
 * in a command for the user to run.
 */
import type { Context } from '../../shared/feature';
import { connectionPageShows } from '../palette/sources';
import { setting } from '../settings/read';
import {
  boolArg,
  collectionArgs,
  databaseAndCollection,
  intArg,
  oneOfArg,
  requiredArg,
  stringArg,
  toolConnection,
} from './arguments';
import { counted } from './output-limits';
import { mongoCommand, recordOf, textIn } from './tool/mongo';
import { ToolProblem, type ToolSession } from './tool/program';
import { pipelineArg, queryArgs, type QueryArgs } from './tool/query';
import { openKey, openKeys, openServer } from './tool/redis-tabs';
import {
  booleanProp,
  collectionProp,
  connectionProp,
  databaseProp,
  endOf,
  filterProp,
  groupOf,
  keyProp,
  namesProp,
  pipelineProp,
  projectionProp,
  redisDatabaseProp,
  sortProp,
} from './tool/schemas';
import { collectionShows, openTab, pipelineMemory, queryMemory } from './tool/tabs';
import { mcpActions, type ToolCall, type ToolEnd, type ToolStep } from './types';
import { knownTypes } from '../key/types';
import { serverSections } from '../server/types';

/** The documents a search reads per collection: 0 for all. */
export const searchLimits = [0, 1000, 10_000, 100_000] as const;

/** The sections of the Monitor page `open_monitor` opens on. */
export const monitorSections = ['operations', 'slow-queries', 'stats', 'replication', 'sharding'] as const;

/** `the filter { a: 1 }, sort { b: -1 }, projection { c: 1 }`, as the texts were given. */
export function queryWords(query: QueryArgs): string {
  return [
    `the filter ${query.text.filter === '' ? '{}' : query.text.filter}`,
    ...(query.text.sort === '' ? [] : [`sort ${query.text.sort}`]),
    ...(query.text.projection === '' ? [] : [`projection ${query.text.projection}`]),
  ].join(', ');
}

function openQuery(session: ToolSession): string {
  const query = queryArgs(session);
  const target = collectionArgs(session);
  const view = target.entry['type'] === 'view';
  return openTab(
    session,
    {
      shows: collectionShows(target.connection.id, { ...target, view }),
      section: 'documents',
      memory: queryMemory(query.text),
    },
    `Opened ${target.database}.${target.collection} on ${target.connection.name} with ${queryWords(query)}.`,
  );
}

function openAggregation(session: ToolSession): string {
  const pipeline = pipelineArg(session);
  const target = collectionArgs(session);
  const view = target.entry['type'] === 'view';
  return openTab(
    session,
    {
      shows: collectionShows(target.connection.id, { ...target, view }),
      section: 'documents',
      memory: pipelineMemory(pipeline.stages),
    },
    `Opened ${target.database}.${target.collection} on ${target.connection.name} in Aggregate mode with ${counted(pipeline.names.length, 'stage')}: ${pipeline.names.join(', ')}.`,
  );
}

function openExplain(session: ToolSession): string {
  const hasQuery = ['filter', 'sort', 'projection'].some((key) => stringArg(session.args, key) !== undefined);
  const hasPipeline = stringArg(session.args, 'pipeline') !== undefined;
  if (hasQuery && hasPipeline) {
    throw new ToolProblem('Give either filter/sort/projection or pipeline, not both.');
  }
  const pipeline = hasPipeline ? pipelineArg(session) : undefined;
  const query = hasPipeline ? undefined : queryArgs(session);
  const target = collectionArgs(session);
  const shows = collectionShows(target.connection.id, { ...target, view: target.entry['type'] === 'view' });
  const where = `${target.database}.${target.collection} on ${target.connection.name}`;
  if (pipeline !== undefined) {
    return openTab(
      session,
      { shows, section: 'explain', memory: pipelineMemory(pipeline.stages) },
      `Opened ${where} in Aggregate mode with ${counted(pipeline.names.length, 'stage')} (${pipeline.names.join(', ')}) and its explain plan.`,
    );
  }
  const texts = query?.text ?? { filter: '', sort: '', projection: '' };
  return openTab(
    session,
    { shows, section: 'explain', memory: queryMemory(texts) },
    `Opened ${where} with ${query === undefined ? 'the filter {}' : queryWords(query)} and its explain plan.`,
  );
}

function checkedRegex(text: string): void {
  try {
    new RegExp(text.replace(/^\/(.*)\/[a-z]*$/su, '$1'), 'u');
  } catch (error: unknown) {
    // The pattern the AI wrote cannot be read: the sentence says why, nothing opens.
    throw new ToolProblem(`Invalid regular expression: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkCollection(session: ToolSession, where: { database?: string; collection?: string }): void {
  if (where.database !== undefined && where.collection !== undefined) {
    collectionArgs(session);
  }
}

function openSearch(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const where = databaseAndCollection(session.args);
  const text = requiredArg(session.args, 'text');
  const regex = boolArg(session.args, 'regex', false);
  if (regex) {
    checkedRegex(text);
  }
  const limit = intArg(session.args, 'limit', [0, 0, Number.MAX_SAFE_INTEGER]);
  if (!(searchLimits as readonly number[]).includes(limit)) {
    throw new ToolProblem(`limit must be one of ${searchLimits.join(', ')}.`);
  }
  checkCollection(session, where);
  const scope =
    where.collection === undefined
      ? (where.database ?? 'every database')
      : `${where.database ?? ''}.${where.collection}`;
  const start = {
    text,
    mode: regex ? 'regex' : 'text',
    matchCase: boolArg(session.args, 'matchCase', false),
    fieldNames: boolArg(session.args, 'fieldNames', false),
    views: boolArg(session.args, 'views', false),
    limit,
    ...where,
  };
  return openTab(
    session,
    { shows: connectionPageShows(connection.id, 'search'), start },
    `Opened the search for ${JSON.stringify(text)} in ${scope} on ${connection.name}. The results appear in Datardo's Search documents page.`,
  );
}

function openWatch(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const where = databaseAndCollection(session.args);
  checkCollection(session, where);
  const [hello] = session.send([mongoCommand({ connection: connection.id, database: 'admin' }, { hello: 1 })]);
  const reply = recordOf(hello);
  const standalone = textIn(reply['setName']) === undefined && textIn(reply['msg']) !== 'isdbgrid';
  const scope = where.collection === undefined ? (where.database ?? '') : `${where.database ?? ''}.${where.collection}`;
  const sentence = `Opened the Watch changes page on ${scope === '' ? connection.name : `${scope} of ${connection.name}`}.`;
  const page = connectionPageShows(connection.id, 'watch');
  const shows = page.kind === 'page' && where.database !== undefined ? { ...page, database: where.database } : page;
  return openTab(
    session,
    { shows, start: where },
    standalone
      ? `${sentence} The server is a standalone: change streams need a replica set or a sharded cluster, so the page shows an error.`
      : sentence,
  );
}

function openMonitor(session: ToolSession): string {
  const connection = toolConnection(session, 'mongodb');
  const section = oneOfArg(session.args, 'section', monitorSections);
  return openTab(
    session,
    { shows: connectionPageShows(connection.id, 'monitor'), ...(section === undefined ? {} : { section }) },
    `Opened the Monitor page of ${connection.name}${section === undefined ? '' : ` on ${section}`}.`,
  );
}

function openHistory(session: ToolSession): string {
  const reply = recordOf(session.app(mcpActions.undoHistory, { limit: 0 }));
  const total = typeof reply['total'] === 'number' ? reply['total'] : 0;
  const on = setting(session.context.state.settings, 'datardo.undo.enabled');
  const state = on ? 'the history is on' : 'the history is off, new writes are not recorded';
  return openTab(
    session,
    { shows: { kind: 'app', page: 'undo' } },
    `Opened the Undo history page (${counted(total, 'write')} recorded; ${state}).`,
  );
}

const mongoTarget = { connection: connectionProp, database: databaseProp, collection: collectionProp };

/** The tools of this group. */
export const group = groupOf('mcp.tab-tools', [
  {
    name: 'open_query',
    title: 'Open a query in Datardo',
    description:
      "Opens the collection's tab in Datardo with the filter, sort and projection filled in and run, so the user sees the documents in Datardo's table.",
    properties: { ...mongoTarget, filter: filterProp, sort: sortProp, projection: projectionProp },
    required: ['connection', 'database', 'collection'],
    run: openQuery,
  },
  {
    name: 'open_aggregation',
    title: 'Open an aggregation in Datardo',
    description:
      "Opens the collection's tab in Aggregate mode with the pipeline's stages, and runs it, so the user sees and can edit each stage.",
    properties: { ...mongoTarget, pipeline: pipelineProp },
    required: ['connection', 'database', 'collection', 'pipeline'],
    run: openAggregation,
  },
  {
    name: 'open_search',
    title: 'Search every field in Datardo',
    description:
      "Opens Datardo's Search documents page and starts searching a text in any field of the documents of a whole connection, a database or one collection. The user sees the results there.",
    properties: {
      connection: connectionProp,
      database: { type: 'string', description: 'Limit the search to this database.' },
      collection: { type: 'string', description: 'Limit the search to this collection (needs database).' },
      text: {
        type: 'string',
        description: 'Text, id, number or date to find; a regular expression when regex is true.',
      },
      regex: booleanProp(false),
      matchCase: booleanProp(false),
      fieldNames: booleanProp(false, 'Also match field names.'),
      views: booleanProp(false, 'Also search views.'),
      limit: {
        type: 'integer',
        enum: searchLimits,
        default: 0,
        description: 'Documents read per collection; 0 for all.',
      },
    },
    required: ['connection', 'text'],
    run: openSearch,
  },
  {
    name: 'open_watch',
    title: 'Open the Watch changes page',
    description:
      'Opens the Watch changes page on a collection, a database or the whole deployment, so the user sees the writes as they happen.',
    properties: { connection: connectionProp, database: databaseProp, collection: collectionProp },
    required: ['connection'],
    run: openWatch,
  },
  {
    name: 'open_monitor',
    title: 'Open the Monitor page',
    description:
      'Opens the Monitor page of a connection on a section: operations, slow queries, statistics, replication or sharding.',
    properties: { connection: connectionProp, section: namesProp(monitorSections, 'The section to show.') },
    required: ['connection'],
    run: openMonitor,
  },
  {
    name: 'open_explain',
    title: 'Open the explain plan of a query',
    description: "Opens the collection's tab with the query or the pipeline, on its Explain section.",
    properties: {
      ...mongoTarget,
      filter: filterProp,
      sort: sortProp,
      projection: projectionProp,
      pipeline: pipelineProp,
    },
    required: ['connection', 'database', 'collection'],
    run: openExplain,
  },
  {
    name: 'open_history',
    title: 'Open the undo history',
    description: "Opens Datardo's Undo history page, where the user sees and undoes the writes made from Datardo.",
    properties: {},
    required: [],
    run: openHistory,
  },
  {
    name: 'redis_open_keys',
    title: 'Open the keys of a Redis database',
    description:
      'Opens the keys tab of a Redis database with a pattern and a type filter; the tab scans and shows the keys to the user.',
    properties: {
      connection: connectionProp,
      database: redisDatabaseProp,
      pattern: { type: 'string', default: '*', description: 'A glob-style pattern, e.g. orders:*.' },
      type: namesProp(knownTypes, 'Only the keys of this type.'),
    },
    required: ['connection'],
    run: openKeys,
  },
  {
    name: 'redis_open_key',
    title: 'Open a Redis key',
    description: 'Opens the tab of one key, where the user sees and edits its value.',
    properties: { connection: connectionProp, database: redisDatabaseProp, key: keyProp },
    required: ['connection', 'key'],
    run: openKey,
  },
  {
    name: 'redis_open_server',
    title: 'Open the Server page of Redis',
    description:
      'Opens the Server page of a Redis connection on a section: overview, clients, slow-log, memory, replication, configuration.',
    properties: { connection: connectionProp, section: namesProp(serverSections, 'The section to show.') },
    required: ['connection'],
    run: openServer,
  },
]);

/** Feature: mcp.tab-tools — what the tool of a call sends next, given the replies so far, or its end. */
export function request(context: Context, call: ToolCall): ToolStep {
  return group.step(context, call);
}

/** Feature: mcp.tab-tools — the sentence once the tab opened; `undefined` before. */
export function parse(context: Context, call: ToolCall): ToolEnd | undefined {
  return endOf(request(context, call));
}
