/**
 * Feature: oplog.publish — after a write to documents, sends one event per document changed to the channels
 * redis-oplog listens on, so that a Meteor app reads those documents again.
 *
 * The runner calls {@link plan} after the steps of every plan whose `publishes` is true, with `answers.args` as
 * {@link PublishArgs}: the MongoDB connection, the collection and what the write did ({@link effectOf} turns a step and
 * its reply into it). The plan is the `PUBLISH` commands to the linked connection, which the runner sends in the
 * background, in pipelines of {@link publishPipeline}, in the order of the writes of each MongoDB connection.
 */
import type { ConnectionRequest, Json, MongoRequest } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { Answers, Context, EngineStep, Outcome } from '../../shared/feature';
import { needRead, noDanger, run } from '../../shared/feature';
import type { ConnectionId } from '../../shared/ids';
import { connectionId } from '../../shared/ids';
import { stepText } from '../runner/step-text';
import { changeEvents } from './changes';
import { oplogMessage } from './message';
import { documentsRead, type DocumentsArgs } from './reads/documents';
import { inScope } from './scope';
import { oplogText } from './text';
import type { OplogEvent, OplogSettings } from './types';
import { numberOf, publishingOf, sameValueKey } from './types';
import { documentFields, updatedFields } from './updated-fields';

/** The `PUBLISH` commands are sent in pipelines of at most 1,000. */
export const publishPipeline = 1000;

/** What a write did to the documents of one collection, as far as redis-oplog needs to know. */
export type WriteEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'inserted'; readonly ids: readonly Json[] }
  /** The documents matched before the write, and the update; at least one was modified. */
  | { readonly kind: 'updated'; readonly ids: readonly Json[]; readonly update: Json }
  /** The documents replaced, with the fields of the document before and after, added or removed. */
  | { readonly kind: 'replaced'; readonly ids: readonly Json[]; readonly fields: readonly string[] }
  /** The documents matched before the write, and how many were deleted. */
  | { readonly kind: 'removed'; readonly ids: readonly Json[]; readonly deleted: number }
  /** The documents it may have touched, read by `_id` before and after. */
  | { readonly kind: 'changes'; readonly before: readonly Json[]; readonly after: readonly Json[] };

/** What the runner gives as `answers.args`. */
export interface PublishArgs {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
  readonly effect: WriteEffect;
}

type Fields = Readonly<Record<string, Json>>;

function fieldsOf(value: unknown): Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : {};
}

function present(id: Json | undefined): id is Json {
  return id !== undefined && id !== null;
}

/** The `_id` the server upserted, when it did. */
function upserted(reply: Fields): Json | undefined {
  const id = reply['upsertedId'];
  return present(id) ? id : undefined;
}

/**
 * What a step did, from its request and the server's reply: an insert's `_id`s, an update or a delete of the documents
 * `matched` before it. A method whose effect isn't known this way (`bulkWrite`) is read before and after instead.
 */
export function effectOf(request: MongoRequest, reply: Json, matched: readonly Json[] = []): WriteEffect {
  const fields = fieldsOf(reply);
  const [first, second] = request.arguments;
  switch (request.method) {
    case 'insertOne': {
      const id = fields['insertedId'] ?? fieldsOf(first)['_id'];
      return present(id) ? { kind: 'inserted', ids: [id] } : { kind: 'none' };
    }
    case 'insertMany':
      return { kind: 'inserted', ids: Object.values(fieldsOf(fields['insertedIds'])).filter(present) };
    case 'updateOne':
    case 'updateMany':
    case 'replaceOne': {
      const id = upserted(fields);
      if (id !== undefined) {
        return { kind: 'inserted', ids: [id] };
      }
      return (numberOf(fields['modifiedCount']) ?? 0) > 0
        ? { kind: 'updated', ids: matched, update: second ?? null }
        : { kind: 'none' };
    }
    case 'deleteOne':
    case 'deleteMany':
      return { kind: 'removed', ids: matched, deleted: numberOf(fields['deletedCount']) ?? 0 };
    default:
      return { kind: 'none' };
  }
}

/**
 * Before an update or a delete by filter, the read of the `_id`s it matches: `db.orders.find(<filter>, { _id: 1 })`
 * (at most one for a method of one document). None for a method that needs none.
 */
export function matchedIdsRequest(connection: ConnectionId, request: MongoRequest): ConnectionRequest | undefined {
  const one = ['updateOne', 'replaceOne', 'deleteOne'].includes(request.method);
  const many = ['updateMany', 'deleteMany'].includes(request.method);
  if (!one && !many) {
    return undefined;
  }
  return {
    connection,
    request: {
      engine: 'mongodb',
      database: request.database,
      ...(request.collection === undefined ? {} : { collection: request.collection }),
      method: 'find',
      arguments: [request.arguments[0] ?? {}, { projection: { _id: 1 } }],
      ...(one ? { limit: 1 } : {}),
    },
  };
}

/** The `_id`s a `bulkWrite` names: the documents it inserts and the filters on `_id` of its other operations. */
export function bulkWriteIds(request: MongoRequest): readonly Json[] {
  const operations = request.arguments[0];
  if (!Array.isArray(operations)) {
    return [];
  }
  return (operations as readonly Json[]).flatMap((operation) => {
    const [kind, body] = Object.entries(fieldsOf(operation))[0] ?? [];
    const fields = fieldsOf(body);
    const id = kind === 'insertOne' ? fieldsOf(fields['document'])['_id'] : fieldsOf(fields['filter'])['_id'];
    return present(id) ? [id] : [];
  });
}

/** What the events still need to be known: the documents after an update, or the `_id`s left after a delete. */
type Missing = { readonly kind: 'documents' | 'remaining'; readonly ids: readonly Json[] };

/** The events of a write, or what must be read before they are known. */
export function eventsOf(effect: WriteEffect, answers: Answers): readonly OplogEvent[] | Missing {
  switch (effect.kind) {
    case 'none':
      return [];
    case 'inserted':
      return effect.ids.filter(present).map((id) => ({ e: 'i', id }));
    case 'updated':
      return updateEvents(effect, answers['documents']);
    case 'replaced':
      return effect.ids.map((id) => ({ e: 'u', id, fields: effect.fields }));
    case 'removed':
      return removeEvents(effect, answers['remaining']);
    case 'changes':
      return changeEvents(effect.before, effect.after);
  }
}

function updateEvents(
  effect: Extract<WriteEffect, { kind: 'updated' }>,
  documents: unknown,
): readonly OplogEvent[] | Missing {
  const fields = updatedFields(effect.update);
  if (fields !== undefined) {
    return effect.ids.map((id) => ({ e: 'u', id, fields }));
  }
  if (!Array.isArray(documents)) {
    return { kind: 'documents', ids: effect.ids };
  }
  return (documents as readonly Json[]).map((document) => ({
    e: 'u',
    id: fieldsOf(document)['_id'] ?? null,
    fields: documentFields(document),
  }));
}

function removeEvents(
  effect: Extract<WriteEffect, { kind: 'removed' }>,
  remaining: unknown,
): readonly OplogEvent[] | Missing {
  if (effect.deleted <= 0) {
    return [];
  }
  if (effect.deleted >= effect.ids.length) {
    return effect.ids.map((id) => ({ e: 'r', id }));
  }
  if (!Array.isArray(remaining)) {
    return { kind: 'remaining', ids: effect.ids };
  }
  const left = new Set((remaining as readonly Json[]).map((document) => sameValueKey(fieldsOf(document)['_id'])));
  return effect.ids.filter((id) => !left.has(sameValueKey(id))).map((id) => ({ e: 'r', id }));
}

/** `PUBLISH <channel> <message>` for each channel of each event, to the linked connection, in order. */
export function publishSteps(
  linked: ConnectionId,
  settings: OplogSettings,
  collection: string,
  events: readonly OplogEvent[],
): readonly EngineStep[] {
  return events.flatMap((event) => {
    const message = oplogMessage(settings, collection, event);
    return (message?.channels ?? []).map((channel): EngineStep => {
      // PUBLISH changes no key: a linked connection that is read-only still receives the events.
      const step = {
        kind: 'engine' as const,
        connection: linked,
        writes: false,
        request: redisCommand(0, 'PUBLISH', channel, message?.message ?? ''),
      };
      return { ...step, text: stepText(step) };
    });
  });
}

/** The arguments the runner gave; none when they are missing. */
export function publishArgsOf(answers: Answers): PublishArgs | undefined {
  const fields = fieldsOf(answers['args']);
  const { connection, database, collection, effect } = fields;
  if (typeof connection !== 'string' || typeof database !== 'string' || typeof collection !== 'string') {
    return undefined;
  }
  const kind = fieldsOf(effect)['kind'];
  return typeof kind === 'string'
    ? { connection: connectionId(connection), database, collection, effect: effect as unknown as WriteEffect }
    : undefined;
}

function publishPlan(args: PublishArgs | undefined, steps: readonly EngineStep[]): Outcome {
  return run({
    title: oplogText.publishTitle(args?.database ?? '', args?.collection ?? ''),
    steps,
    danger: noDanger,
    undo: { cannot: oplogText.cannotUndo },
    publishes: false,
    after: [],
  });
}

/**
 * Feature: oplog.publish. Nothing when the connection has no linked connection or the collection is not among its
 * databases and collections; a linked connection that was removed is the runner's to report (`oplog.publish-error`).
 */
export function plan(context: Context, answers: Answers): Outcome {
  const args = publishArgsOf(answers);
  const publishing = args === undefined ? undefined : publishingOf(context.state, args.connection);
  if (args === undefined || publishing?.kind !== 'publishes') {
    return publishPlan(args, []);
  }
  if (!inScope(publishing.settings.scope, args.database, args.collection)) {
    return publishPlan(args, []);
  }
  const events = eventsOf(args.effect, answers);
  if ('kind' in events) {
    const read: DocumentsArgs = { ...args, ids: events.ids, onlyIds: events.kind === 'remaining' };
    return needRead(events.kind, documentsRead, read as unknown as Json);
  }
  return publishPlan(args, publishSteps(publishing.linked.id, publishing.settings, args.collection, events));
}
