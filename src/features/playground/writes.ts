/**
 * Feature: playground.writes
 *
 * What holds for every write a script makes: refused on a read-only connection, confirmed first when it drops a
 * collection or a database and never otherwise (D40), not recorded in the undo history, and published for redis-oplog
 * when it is a write to documents. The check is made in the main process on each call the process of the run sends,
 * before anything is sent: no code of the script can go around it.
 *
 * The writes to publish are given to `oplog.playground-writes` as {@link PlaygroundWrite}, which is that card's input:
 * the call as the script made it, with its session and whether a transaction was open.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import type { EngineStep, Plan } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { stepText } from '../runner/step-text';
import { callRequest, commandName, pipelineOf, type PlaygroundCall } from './runtime/calls';
import { collectionWrites, databaseWrites, documentWrites, readCommands, writeStages } from './runtime/methods';
import { text } from './text';
import { jsonObject } from './types';

/** The connection of a run, as the check reads it. */
export interface WriteConnection {
  readonly id: ConnectionId;
  readonly name: string;
  readonly readOnly: boolean;
  /** Whether it has a linked connection for redis-oplog (`oplog.scope` then says which collections publish). */
  readonly publishes: boolean;
}

/**
 * A write to documents made with a method of a collection, to publish for redis-oplog: the input of
 * `oplog.playground-writes`. Those of a transaction wait for its commit (`playground.sessions`).
 */
export interface PlaygroundWrite {
  readonly database: string;
  readonly collection: string;
  /** The method as the script called it: `insertOne`, `updateMany`, `bulkWrite`… */
  readonly method: string;
  /** Its arguments as canonical Extended JSON, the options with them. */
  readonly arguments: readonly Json[];
  /** The number of the run's session it was made in, when it was. */
  readonly session?: number;
  /**
   * What the main process learned running it, as `oplog.playground-writes` takes it (its `PlaygroundWrite`): kept
   * with the write while its transaction waits for the commit.
   */
  readonly learned?: Json;
}

/** A drop the script reached, which waits for the user's answer. */
export type Drop =
  | {
      readonly kind: 'collection';
      readonly database: string;
      readonly collection: string;
      /** The step, as `runner.step-text` writes the call the script made. */
      readonly step: string;
      readonly line?: number;
    }
  | { readonly kind: 'database'; readonly database: string; readonly step: string; readonly line?: number };

/** What becomes of a call: sent (and published or not), refused with the script's error, or asked about first. */
export type WriteCheck =
  | { readonly kind: 'send'; readonly request: MongoRequest; readonly publish?: PlaygroundWrite }
  | { readonly kind: 'refuse'; readonly message: string }
  | { readonly kind: 'ask'; readonly drop: Drop; readonly request: MongoRequest };

/** What is known of what a drop deletes, read before the question as `manage.drop-collection` reads it. */
export type DropFacts =
  | { readonly kind: 'collection'; readonly documents?: number; readonly indexes?: number }
  | { readonly kind: 'view' }
  | { readonly kind: 'database'; readonly collections?: number }
  | { readonly kind: 'unknown' };

function refusalOnReadOnly(call: PlaygroundCall): string | undefined {
  if (call.on === 'collection' && collectionWrites.has(call.method)) {
    return text.writes.readOnly(call.method);
  }
  if (call.on === 'database' && databaseWrites.has(call.method)) {
    return text.writes.readOnly(call.method);
  }
  const [first] = call.arguments;
  if (call.on === 'database' && (call.method === 'runCommand' || call.method === 'adminCommand')) {
    const name = commandName(first);
    if (!readCommands.has(name)) {
      return text.writes.command(name);
    }
  }
  const stage = (pipelineOf(call) ?? []).map(stageName).find((name) => writeStages.includes(name));
  return stage === undefined ? undefined : text.writes.pipeline(stage);
}

function stageName(stage: Json): string {
  return typeof stage === 'object' && stage !== null && !Array.isArray(stage) ? (Object.keys(stage)[0] ?? '') : '';
}

function dropStep(call: PlaygroundCall): string {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: call.database,
    ...(call.collection === undefined ? {} : { collection: call.collection }),
    method: call.method,
    arguments: call.arguments,
  };
  return stepText(
    { kind: 'engine', connection: connectionId(''), request, writes: true },
    {
      kind: 'database',
      connection: connectionId(''),
      database: call.scriptDatabase,
    },
  );
}

/** The drop a call is, when it is one of the four calls of D40. */
export function dropOf(call: PlaygroundCall): Drop | undefined {
  const step = dropStep(call);
  const line = call.line === undefined ? {} : { line: call.line };
  if (call.on === 'collection' && call.method === 'drop' && call.collection !== undefined) {
    return { kind: 'collection', database: call.database, collection: call.collection, step, ...line };
  }
  if (call.on !== 'database') {
    return undefined;
  }
  if (call.method === 'dropDatabase') {
    return { kind: 'database', database: call.database, step, ...line };
  }
  if (call.method !== 'runCommand' && call.method !== 'adminCommand') {
    return undefined;
  }
  const database = call.method === 'adminCommand' ? 'admin' : call.database;
  const [first] = call.arguments;
  const name = commandName(first);
  const dropped = jsonObject(first)?.['drop'];
  if (name === 'drop' && typeof dropped === 'string') {
    return { kind: 'collection', database, collection: dropped, step, ...line };
  }
  return name === 'dropDatabase' ? { kind: 'database', database, step, ...line } : undefined;
}

/**
 * Feature: playground.writes — of a call the process of a run sends, whether it is sent, refused, or asked about first
 * (a drop, D40), and then with which name; and, for a write to documents on a connection that publishes, the write
 * `oplog.playground-writes` publishes.
 */
export function writeCheck(call: PlaygroundCall, connection: WriteConnection): WriteCheck {
  if (connection.readOnly) {
    const refusal = refusalOnReadOnly(call);
    if (refusal !== undefined) {
      return { kind: 'refuse', message: refusal };
    }
  }
  const request = callRequest(call);
  const drop = connection.readOnly ? undefined : dropOf(call);
  if (drop !== undefined) {
    return { kind: 'ask', drop, request };
  }
  if (
    !connection.publishes ||
    call.on !== 'collection' ||
    call.collection === undefined ||
    !documentWrites.has(call.method)
  ) {
    return { kind: 'send', request };
  }
  const publish: PlaygroundWrite = {
    database: call.database,
    collection: call.collection,
    method: call.method,
    arguments: call.arguments,
    ...(call.session === undefined ? {} : { session: call.session }),
  };
  return { kind: 'send', request, publish };
}

/**
 * The read made before a drop of a collection is asked about: `listCollections` with its name as the filter, in the
 * database of the call. An answer with no collection sends the call as it is, unasked; a read that fails asks.
 */
export function existsRequest(drop: Extract<Drop, { kind: 'collection' }>): MongoRequest {
  return {
    engine: 'mongodb',
    database: drop.database,
    method: 'listCollections',
    arguments: [{ name: drop.collection }],
  };
}

/** The name the user types to confirm a drop: the collection's, or the database's. */
export function dropName(drop: Drop): string {
  return drop.kind === 'collection' ? drop.collection : drop.database;
}

function dropTitle(drop: Drop, facts: DropFacts): string {
  if (drop.kind === 'database') {
    return text.writes.dropDatabase(drop.database);
  }
  const namespace = `${drop.database}.${drop.collection}`;
  return facts.kind === 'view' ? text.writes.dropView(namespace) : text.writes.dropCollection(namespace);
}

function deletes(facts: DropFacts): string {
  switch (facts.kind) {
    case 'collection':
      return facts.documents === undefined || facts.indexes === undefined
        ? text.writes.cannotUndo
        : text.writes.deletesDocuments(facts.documents, facts.indexes);
    case 'view':
      return text.writes.viewNotAffected;
    case 'database':
      return facts.collections === undefined
        ? text.writes.cannotUndo
        : text.writes.deletesCollections(facts.collections);
    case 'unknown':
      return text.writes.cannotUndo;
  }
}

/** Where a drop waits for its answer: the run's playground, its connection, and the line of the call in the script. */
export interface DropPlace {
  readonly playground: string;
  readonly connection: ConnectionId;
}

/**
 * The destructive confirmation of a drop, as `runner.confirm` shows it: a plan of the one call, which the user types
 * the name of to send. **Drop** sends it and the script goes on with its result; **Cancel** sends nothing, and the
 * call throws {@link cancelledMessage}. Nothing is recorded in the undo history.
 */
export function dropPlan(drop: Drop, facts: DropFacts, place: DropPlace, request: MongoRequest): Plan {
  const step: EngineStep = { kind: 'engine', text: drop.step, connection: place.connection, request, writes: true };
  const sentences = [
    ...(drop.line === undefined ? [] : [text.writes.dropsAt(place.playground, drop.line)]),
    deletes(facts),
  ];
  return {
    title: dropTitle(drop, facts),
    steps: [step],
    danger: { kind: 'destructive', text: sentences.join(' '), button: text.writes.drop, name: dropName(drop) },
    undo: { cannot: text.writes.cannotUndo },
    publishes: false,
    after: [],
  };
}

/** The error a cancelled drop throws in the script. */
export function cancelledMessage(drop: Drop): string {
  return drop.kind === 'collection'
    ? text.writes.cancelledCollection(`${drop.database}.${drop.collection}`)
    : text.writes.cancelledDatabase(drop.database);
}

/** The line of the Log under **Playground** for an answer: `db.orders.drop(): confirmed`. */
export function answerLine(drop: Drop, answer: 'confirmed' | 'cancelled'): string {
  return answer === 'confirmed' ? text.writes.confirmed(drop.step) : text.writes.cancelled(drop.step);
}
