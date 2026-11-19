/**
 * Feature: index.list
 *
 * Everything the Indexes section shows about the indexes of a collection: what the server reports about each, its
 * size, how often it was used, and how far a build in progress is. Only a failure of `getIndexes` is an error: without
 * the privilege for `$indexStats`, `$collStats` or `currentOp`, the indexes come back without usage, sizes or progress.
 *
 * The arguments are `{ connection, database, collection }`, with `building: true` once a read showed a build in
 * progress: `currentOp` is sent only then (the section reads the list again every second while a build runs), and
 * with `definitionsOnly: true` to send `getIndexes` alone (`index.edit`, when saving).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { Context, ReadFeature, ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import {
  dateOf,
  failureOf,
  isDocument,
  jsonText,
  numberOf,
  readTarget,
  relaxedDocument,
  type BuildProgress,
  type IndexInfo,
  type IndexList,
  type IndexTotals,
  type JsonDocument,
  type MemberUsage,
} from './types';

/** How long the server may take on each request of the list, in ms (R9.2; Datardo's choice). */
export const listTimeLimitMs = 20_000;

/** How many indexes, statistics and operations are read at most (R9.2; MongoDB allows 64 indexes a collection). */
export const mostEntries = 1000;

function collectionRequest(target: ReturnType<typeof readTarget>, method: string, args: readonly Json[]): MongoRequest {
  return {
    engine: 'mongodb',
    database: target.database,
    collection: target.collection,
    method,
    arguments: args,
    limit: mostEntries,
    timeLimitMs: listTimeLimitMs,
  };
}

/** What `$collStats` is asked for: the sizes and the builds, not the storage engine's statistics. */
const storageFields = Object.fromEntries(
  [
    'shard',
    'host',
    ...['count', 'size', 'totalIndexSize', 'indexSizes', 'indexBuilds'].map((field) => `storageStats.${field}`),
  ].map((field) => [field, 1]),
);

/** The requests of the list, in order: getIndexes, `$indexStats`, `$collStats`, and `currentOp` during a build. */
export function listRequests(args: Json): readonly MongoRequest[] {
  const target = readTarget(args);
  const object = isDocument(args) ? args : {};
  const indexes = collectionRequest(target, 'listIndexes', []);
  if (object['definitionsOnly'] === true) {
    return [indexes];
  }
  const progress: MongoRequest = {
    engine: 'mongodb',
    database: 'admin',
    method: 'runCommand',
    arguments: [{ currentOp: 1, 'command.createIndexes': target.collection, 'command.$db': target.database }],
    timeLimitMs: listTimeLimitMs,
  };
  return [
    indexes,
    collectionRequest(target, 'aggregate', [[{ $indexStats: {} }]]),
    collectionRequest(target, 'aggregate', [[{ $collStats: { storageStats: {} } }, { $project: storageFields }]]),
    ...(object['building'] === true ? [progress] : []),
  ];
}

/** Feature: index.list — the requests for the collection of `args`. */
export function request(_context: Context, args: Json): ReadRequest {
  const connection = connectionId(readTarget(args).connection);
  return { kind: 'engine', requests: listRequests(args).map((each) => ({ connection, request: each })) };
}

function documentsOf(reply: unknown): readonly JsonDocument[] {
  return failureOf(reply) === undefined && Array.isArray(reply) ? reply.filter(isDocument) : [];
}

function memberUsage(stat: JsonDocument): MemberUsage | undefined {
  const accesses = stat['accesses'];
  const uses = isDocument(accesses) ? numberOf(accesses['ops']) : undefined;
  if (!isDocument(accesses) || uses === undefined) {
    return undefined;
  }
  const since = dateOf(accesses['since']);
  const shard = stat['shard'];
  return {
    ...(typeof shard === 'string' ? { shard } : {}),
    host: typeof stat['host'] === 'string' ? stat['host'] : '',
    uses,
    ...(since === undefined ? {} : { since }),
  };
}

/** The phase of a build, the operation's message without the words `Index Build:` around it. */
function phaseOf(message: Json | undefined): string | undefined {
  return typeof message === 'string'
    ? message.replace(/^Index Build: /u, '').replace(/ Index Build:.*$/u, '')
    : undefined;
}

/** How far each build in progress is, by index name, from the reply of `currentOp`. */
function progressByName(reply: unknown): ReadonlyMap<string, BuildProgress> {
  const result = new Map<string, BuildProgress>();
  const operations = failureOf(reply) === undefined && isDocument(reply) ? reply['inprog'] : undefined;
  for (const operation of Array.isArray(operations) ? operations.filter(isDocument) : []) {
    const progress = isDocument(operation['progress']) ? operation['progress'] : {};
    const total = numberOf(progress['total']) ?? 0;
    const command = isDocument(operation['command']) ? operation['command'] : {};
    const indexes = Array.isArray(command['indexes']) ? command['indexes'].filter(isDocument) : [];
    if (total <= 0) {
      continue;
    }
    const phase = phaseOf(operation['msg']);
    const done = numberOf(progress['done']) ?? 0;
    indexes.forEach((index) => result.set(jsonText(index['name']), { done, total, ...(phase ? { phase } : {}) }));
  }
  return result;
}

function sum(values: readonly (number | undefined)[]): number | undefined {
  const known = values.filter((value): value is number => value !== undefined);
  return known.length === 0 ? undefined : known.reduce((total, value) => total + value, 0);
}

/** What the replies say, before the indexes are put together. */
interface Reported {
  readonly stats: readonly JsonDocument[];
  readonly storage: readonly JsonDocument[];
  readonly builds: ReadonlySet<string>;
  readonly progress: ReadonlyMap<string, BuildProgress>;
}

function indexOf(definition: JsonDocument, reported: Reported): IndexInfo {
  const { key, name: rawName, ns: _ns, ...options } = relaxedDocument(definition);
  const name = jsonText(rawName);
  const usage = reported.stats
    .filter((stat) => stat['name'] === name)
    .map(memberUsage)
    .filter((each): each is MemberUsage => each !== undefined);
  const size = sum(reported.storage.map((storage) => numberOf(fieldOf(storage['indexSizes'], name))));
  const since = usage.map((each) => each.since).filter((each): each is number => each !== undefined);
  const progress = reported.progress.get(name);
  return {
    name,
    key: isDocument(key) ? key : {},
    options,
    ...(size === undefined ? {} : { size }),
    ...(usage.length === 0 ? {} : { uses: usage.reduce((total, each) => total + each.uses, 0) }),
    ...(since.length === 0 ? {} : { since: Math.max(...since) }),
    ...(usage.length > 1 ? { members: usage } : {}),
    building: reported.builds.has(name),
    ...(progress === undefined ? {} : { progress }),
  };
}

function fieldOf(value: Json | undefined, name: string): Json | undefined {
  return isDocument(value) ? value[name] : undefined;
}

function totalsOf(storage: readonly JsonDocument[]): IndexTotals {
  const total = (field: string): number | undefined => sum(storage.map((each) => numberOf(each[field])));
  const documents = total('count');
  const dataSize = total('size');
  const indexSize = total('totalIndexSize');
  return {
    ...(documents === undefined ? {} : { documents }),
    ...(dataSize === undefined ? {} : { dataSize }),
    ...(indexSize === undefined ? {} : { indexSize }),
  };
}

/** The indexes being built that getIndexes does not list yet, with the definition `$indexStats` has, once each. */
function missingDefinitions(
  definitions: readonly JsonDocument[],
  stats: readonly JsonDocument[],
): readonly JsonDocument[] {
  const names = new Set(definitions.map((definition) => definition['name']));
  const missing: JsonDocument[] = [];
  for (const stat of stats) {
    const spec = stat['spec'];
    if (stat['building'] === true && isDocument(spec) && !names.has(stat['name'] ?? null)) {
      names.add(stat['name'] ?? null);
      missing.push(spec);
    }
  }
  return missing;
}

/**
 * Feature: index.list — the indexes with their sizes, uses and builds, and the totals of the collection. A failure of
 * `getIndexes` fails the read with the server's message.
 */
export function parse(replies: readonly unknown[]): IndexList {
  const [listed, statsReply, storageReply, progressReply] = replies;
  const failure = failureOf(listed);
  if (failure !== undefined) {
    throw new Error(failure.message);
  }
  const definitions = Array.isArray(listed) ? listed.filter(isDocument) : [];
  const stats = documentsOf(statsReply);
  const storage = documentsOf(storageReply).flatMap((each) =>
    isDocument(each['storageStats']) ? [each['storageStats']] : [],
  );
  const builds = new Set<string>([
    ...storage.flatMap((each) => (Array.isArray(each['indexBuilds']) ? each['indexBuilds'].map(String) : [])),
    ...stats.filter((stat) => stat['building'] === true).map((stat) => jsonText(stat['name'])),
  ]);
  const all = [...definitions, ...missingDefinitions(definitions, stats)];
  const reported: Reported = { stats, storage, builds, progress: progressByName(progressReply) };
  return { indexes: all.map((definition) => indexOf(definition, reported)), totals: totalsOf(storage) };
}

/** Whether a list shows a build in progress: the section reads it again every second, with `currentOp`. */
export function isBuilding(list: IndexList): boolean {
  return list.indexes.some((index) => index.building);
}

/** The feature, as the runner starts it. */
export const feature: ReadFeature = { kind: 'read', id: featureId('index.list'), request, parse };
