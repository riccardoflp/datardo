/**
 * Feature: index.list-search
 *
 * The Atlas Search and Vector Search indexes of a collection with their states, telling a server without search from
 * an error. The arguments are `{ connection, database, collection }`, with `name` to ask for one index.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { explainedSearchError, isSearchUnsupported, searchIndexType } from './search-checks';
import {
  failureOf,
  isDocument,
  jsonText,
  readTarget,
  relaxedDocument,
  type JsonDocument,
  type SearchHost,
  type SearchIndexInfo,
  type SearchIndexList,
} from './types';

/** How long the server may take, in ms (R9.2; Datardo's choice). */
export const listSearchTimeLimitMs = 20_000;

/** How many search indexes are read at most (R9.2; Datardo's choice). */
export const mostSearchIndexes = 1000;

/** `db.movies.aggregate([{ $listSearchIndexes: {} }])`, or with `{ name }` for one index. */
export function listSearchRequest(args: Json): MongoRequest {
  const target = readTarget(args);
  const name = isDocument(args) ? args['name'] : undefined;
  return {
    engine: 'mongodb',
    database: target.database,
    collection: target.collection,
    method: 'aggregate',
    arguments: [[{ $listSearchIndexes: typeof name === 'string' ? { name } : {} }]],
    limit: mostSearchIndexes,
    timeLimitMs: listSearchTimeLimitMs,
  };
}

/** Feature: index.list-search — the request for the collection of `args`. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(readTarget(args).connection);
  // A server without search answers with an error, which `parse` tells from other errors.
  return {
    kind: 'engine',
    requests: [{ connection, request: listSearchRequest(args) }],
    failedRequests: 'are-replies',
  };
}

function textOf(value: Json | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function booleanOf(...values: readonly (Json | undefined)[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === 'boolean');
}

function hostOf(detail: JsonDocument): SearchHost {
  const main = isDocument(detail['mainIndex']) ? detail['mainIndex'] : {};
  const staged = isDocument(detail['stagedIndex']) ? detail['stagedIndex'] : undefined;
  const status = textOf(detail['status']) ?? textOf(main['status']);
  const queryable = booleanOf(detail['queryable'], main['queryable']);
  const message = textOf(detail['message']) ?? textOf(main['message']) ?? textOf(staged?.['message']);
  const stagedStatus = staged === undefined ? undefined : textOf(staged['status']);
  return {
    host: jsonText(detail['hostname'] ?? detail['host'] ?? '?'),
    ...(status === undefined ? {} : { status }),
    ...(queryable === undefined ? {} : { queryable }),
    ...(message === undefined ? {} : { message }),
    ...(stagedStatus === undefined ? {} : { staged: stagedStatus }),
  };
}

/** An index of `$listSearchIndexes` as the section shows it. */
export function searchIndexOf(reported: JsonDocument): SearchIndexInfo {
  const index = relaxedDocument(reported);
  const details = Array.isArray(index['statusDetail']) ? index['statusDetail'].filter(isDocument) : [];
  const status = textOf(index['status']);
  const message = textOf(index['message']);
  const definition = isDocument(index['latestDefinition']) ? index['latestDefinition'] : {};
  return {
    name: jsonText(index['name']),
    type: searchIndexType(index['type'], definition),
    ...(status === undefined ? {} : { status }),
    ...(typeof index['queryable'] === 'boolean' ? { queryable: index['queryable'] } : {}),
    definition,
    ...(message === undefined ? {} : { message }),
    ...(details.length === 0 ? {} : { hosts: details.map(hostOf) }),
  };
}

/**
 * Feature: index.list-search — the search indexes; *unsupported* with the server's message on a server without search;
 * any other error with its text as `index.search-checks` says it.
 */
export function parse(replies: readonly unknown[]): SearchIndexList {
  const [reply] = replies;
  const failure = failureOf(reply);
  if (failure !== undefined) {
    return isSearchUnsupported(failure)
      ? { kind: 'unsupported', message: failure.message }
      : { kind: 'error', message: explainedSearchError(failure) };
  }
  const indexes = Array.isArray(reply) ? reply.filter(isDocument) : [];
  return { kind: 'indexes', indexes: indexes.map(searchIndexOf) };
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('index.list-search'), request, parse };
