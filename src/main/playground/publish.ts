/**
 * The writes to documents of a script on a connection that publishes for redis-oplog (`playground.writes`,
 * `oplog.playground-writes`): before the write, what `readBefore` says is read (in the write's session), the write
 * runs restricted to the document found, and what was learned is published at once, or kept with its transaction
 * until the commit (`playground.sessions`). A failure to publish is a warning; the write stays done (R4.5).
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { featureId } from '../../shared/ids';
import type { Context } from '../../shared/feature';
import {
  readBefore,
  restrictedFilter,
  type PlaygroundWrite as LearnedWrite,
} from '../../features/oplog/playground-writes';
import { bulkWriteIds } from '../../features/oplog/publish';
import { publishingOf } from '../../features/oplog/types';
import { written } from '../../features/playground/sessions';
import type { PlaygroundWrite } from '../../features/playground/writes';
import { decide } from '../../runner/decide';
import { warnPublishing } from '../../runner/oplog-queue';
import { runtimeOf } from '../../runner/runtime';
import { callError, send, type RunContext } from './run-context';
import { newObjectId } from './values';

const playgroundWrites = featureId('oplog.playground-writes');

/** As many documents as a read before a write may give: all those the write may change. */
const everyDocument = Number.MAX_SAFE_INTEGER;

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(value: Json | undefined): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

function idOf(document: Json | undefined): Json | undefined {
  const id = fieldsOf(document)['_id'];
  return id === undefined || id === null ? undefined : id;
}

/** The documents of an insert, each with an `_id`, as the driver would give them, so that the `_id`s are known. */
function withIds(request: MongoRequest): MongoRequest {
  const now = Date.now();
  const identified = (document: Json): Json =>
    idOf(document) === undefined ? { _id: { $oid: newObjectId(now) }, ...fieldsOf(document) } : document;
  const [first, ...rest] = request.arguments;
  if (request.method === 'insertOne' && first !== undefined) {
    return { ...request, arguments: [identified(first), ...rest] };
  }
  if (request.method === 'insertMany' && Array.isArray(first)) {
    return { ...request, arguments: [(first as readonly Json[]).map(identified), ...rest] };
  }
  return request;
}

function readRequest(request: MongoRequest, method: string, args: readonly Json[], limit?: number): MongoRequest {
  return {
    engine: 'mongodb',
    database: request.database,
    ...(request.collection === undefined ? {} : { collection: request.collection }),
    ...(request.session === undefined ? {} : { session: request.session }),
    method,
    arguments: args,
    ...(limit === undefined ? {} : { limit }),
  };
}

async function documentsById(context: RunContext, request: MongoRequest, ids: readonly Json[]): Promise<Json[]> {
  if (ids.length === 0) {
    return [];
  }
  const reply = await send(context, readRequest(request, 'find', [{ _id: { $in: ids } }], everyDocument));
  return Array.isArray(reply) ? [...(reply as readonly Json[])] : [];
}

/** The `_id`s a bulk write's reply says it inserted or upserted. */
function bulkReplyIds(reply: Json): readonly Json[] {
  const fields = fieldsOf(reply);
  return [...Object.values(fieldsOf(fields['insertedIds'])), ...Object.values(fieldsOf(fields['upsertedIds']))];
}

function failedOf(error: unknown): readonly number[] | undefined {
  const failed =
    typeof error === 'object' && error !== null && 'failedOperations' in error ? error.failedOperations : undefined;
  return Array.isArray(failed) ? failed.filter((each): each is number => typeof each === 'number') : undefined;
}

/** What was learned of a write, and the error it ended with, if any. */
interface Ran {
  readonly learned: LearnedWrite;
  readonly error?: unknown;
}

async function sent(context: RunContext, request: MongoRequest): Promise<{ reply?: Json; error?: unknown }> {
  try {
    return {
      reply: (await context.ports.engines.send(
        { connection: context.run.connection, request },
        context.signal,
      )) as Json,
    };
  } catch (error: unknown) {
    return { error };
  }
}

async function ranOne(
  context: RunContext,
  request: MongoRequest,
  before: { readonly filter: Json; readonly sort?: Json; readonly whole: boolean },
): Promise<Ran> {
  const options = {
    ...(before.sort === undefined ? {} : { sort: before.sort }),
    ...(before.whole ? {} : { projection: { _id: 1 } }),
  };
  const found = await send(context, readRequest(request, 'findOne', [before.filter, options]));
  const id = idOf(found);
  const [, ...rest] = request.arguments;
  const restricted =
    id === undefined ? request : { ...request, arguments: [restrictedFilter(before.filter, id), ...rest] };
  const { reply, error } = await sent(context, restricted);
  const upsert = fieldsOf(request.method === 'findOneAndDelete' ? request.arguments[1] : request.arguments[2])[
    'upsert'
  ];
  const after =
    error === undefined && id === undefined && upsert === true
      ? [await send(context, readRequest(request, 'findOne', [before.filter]))]
      : undefined;
  const learned: LearnedWrite = {
    method: request.method,
    arguments: request.arguments,
    ...(id === undefined ? {} : { found }),
    ...(reply === undefined ? {} : { result: reply }),
    ...(after === undefined ? {} : { after }),
  };
  return { learned, ...(error === undefined ? {} : { error }) };
}

async function ranMany(context: RunContext, request: MongoRequest, filter: Json): Promise<Ran> {
  const matched = await send(
    context,
    readRequest(request, 'find', [filter, { projection: { _id: 1 } }], everyDocument),
  );
  const ids = (Array.isArray(matched) ? (matched as readonly Json[]) : []).flatMap((each) => {
    const id = idOf(each);
    return id === undefined ? [] : [id];
  });
  const { reply, error } = await sent(context, request);
  const learned: LearnedWrite = {
    method: request.method,
    arguments: request.arguments,
    matched: ids,
    ...(reply === undefined ? {} : { result: reply }),
  };
  return { learned, ...(error === undefined ? {} : { error }) };
}

async function ranBulk(context: RunContext, request: MongoRequest): Promise<Ran> {
  const named = bulkWriteIds(request);
  const before = await documentsById(context, request, named);
  const { reply, error } = await sent(context, request);
  const ids = [...before.map(idOf), ...named, ...(reply === undefined ? [] : bulkReplyIds(reply))].filter(
    (id): id is Json => id !== undefined,
  );
  const unique = [...new Map(ids.map((id) => [JSON.stringify(id), id])).values()];
  const after = await documentsById(context, request, unique);
  const learned: LearnedWrite = {
    method: request.method,
    arguments: request.arguments,
    before,
    after,
    ...(reply === undefined ? {} : { result: reply }),
  };
  return { learned, ...(error === undefined ? {} : { error }) };
}

async function ranInsert(context: RunContext, request: MongoRequest): Promise<Ran> {
  const { reply, error } = await sent(context, request);
  const failed = failedOf(error);
  const learned: LearnedWrite = {
    method: request.method,
    arguments: request.arguments,
    ...(reply === undefined ? {} : { result: reply }),
    ...(failed === undefined ? {} : { failed }),
  };
  // An insert that failed without saying which documents did not go in published nothing.
  return error !== undefined && failed === undefined
    ? { learned: { method: request.method, arguments: [] }, error }
    : { learned, ...(error === undefined ? {} : { error }) };
}

function contextOf(context: RunContext, database: string, collection: string): Context {
  const { ports, run } = context;
  return {
    feature: playgroundWrites,
    now: ports.now(),
    platform: ports.platform,
    startedBy: 'user',
    target: { kind: 'collection', connection: run.connection, database, collection },
    state: ports.state.get(),
  };
}

async function publishOne(context: RunContext, write: PlaygroundWrite): Promise<void> {
  const { ports, run } = context;
  const publishing = publishingOf(ports.state.get(), run.connection);
  if (publishing.kind !== 'publishes' || write.learned === undefined) {
    return;
  }
  const decided = await decide(
    { ports, context: contextOf(context, write.database, write.collection), signal: AbortSignal.timeout(30_000) },
    playgroundWrites,
    {
      args: {
        connection: run.connection,
        database: write.database,
        collection: write.collection,
        write: write.learned,
      },
    },
  );
  if (decided.kind !== 'plan') {
    return;
  }
  const requests = decided.plan.steps.flatMap((step) =>
    step.kind === 'engine' && step.request.engine === 'redis' ? [step.request] : [],
  );
  runtimeOf(ports).publishing.enqueue(run.connection, publishing.linked.id, requests);
}

/** Publishes writes of the run, after those before them. */
export function publishWrites(context: RunContext, writes: readonly PlaygroundWrite[]): void {
  for (const write of writes) {
    context.publishing = context.publishing.then(async () => {
      try {
        await publishOne(context, write);
      } catch (error: unknown) {
        warnPublishing(context.ports, context.run.connection, error instanceof Error ? error.message : String(error));
      }
    });
  }
}

function ran(context: RunContext, request: MongoRequest): Promise<Ran> {
  const before = readBefore(request.method, request.arguments);
  switch (before.kind) {
    case 'one':
      return ranOne(context, request, before);
    case 'many':
      return ranMany(context, request, before.filter);
    case 'bulk':
      return ranBulk(context, request);
    case 'none':
      return ranInsert(context, request);
  }
}

/**
 * Runs a write to documents on a connection that publishes: the reads before it, the write, then its publishing now,
 * or at the commit of its transaction. The script gets the server's reply, or its error.
 */
export async function publishedWrite(
  context: RunContext,
  request: MongoRequest,
  write: PlaygroundWrite,
): Promise<Json> {
  const identified = withIds(request);
  const { learned, error } = await ran(context, identified);
  const kept = written(context.book, {
    ...write,
    arguments: identified.arguments,
    learned: learned as unknown as Json,
  });
  context.book = kept.book;
  if (kept.publishNow !== undefined) {
    publishWrites(context, [kept.publishNow]);
  }
  if (error !== undefined) {
    throw callError(error);
  }
  return learned.result ?? null;
}
