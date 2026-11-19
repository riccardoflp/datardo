/**
 * `watch_changes` (`mcp.debugging-tools`): a change stream on a collection, a database or the deployment, read
 * through the engine method `watch` and closed before the answer, with the resume token to continue from.
 */
import type { ConnectionRequest, Json } from '../../../shared/engine-request';
import {
  boolArg,
  databaseAndCollection,
  intArg,
  listArg,
  resumeToken,
  stringArg,
  timeArg,
  toolConnection,
} from '../arguments';
import { counted, fittedItems } from '../output-limits';
import { isFailed } from '../types';
import { changeEvents, eventText, expandedEvents, timeOf, watchProblem } from './changes';
import { deploymentOf } from './deployment';
import { listOf, mongoCall, recordOf, textIn, type MongoPlace } from './mongo';
import { ToolProblem, type ToolSession } from './program';
import { mongoshObject } from './query';

/**
 * The reply of the engine method `watch` `[pipeline, options]` on a collection, a database, or with
 * `allChangesForCluster: true` the whole deployment: it opens the change stream with the options (the driver's
 * `ChangeStreamOptions`), takes events until `limit` arrived, one is `invalidate`, or `timeLimitMs` passed, closes the
 * stream, and replies with the events and the stream's resume token. A failure is a `FailedReply` with the server's
 * code.
 */
export interface WatchReply {
  readonly events: readonly Json[];
  readonly resumeToken: Json | null;
}

/** `shop.orders`, `the database shop`, or `every database of Local`. */
export function scopeText(name: string, database?: string, collection?: string): string {
  if (collection !== undefined) {
    return `${database ?? ''}.${collection}`;
  }
  return database === undefined ? `every database of ${name}` : `the database ${database}`;
}

interface WatchArgs {
  readonly database?: string;
  readonly collection?: string;
  readonly waitSeconds: number;
  readonly maxEvents: number;
  readonly resumeAfter?: { readonly _data: string };
  readonly since?: number;
  readonly operationTypes: readonly string[];
  readonly filter?: Json;
  readonly full: boolean;
}

function watchArgs(session: ToolSession): WatchArgs {
  const { args, context } = session;
  const resumeAfter = resumeToken(args['resumeAfter']);
  const since = stringArg(args, 'since');
  if (resumeAfter !== undefined && since !== undefined) {
    throw new ToolProblem('Use resumeAfter or since, not both.');
  }
  const filter = mongoshObject(args, 'filter', context.now);
  return {
    ...databaseAndCollection(args),
    waitSeconds: intArg(args, 'waitSeconds', [10, 0, 25]),
    maxEvents: intArg(args, 'maxEvents', [50, 1, 200]),
    ...(resumeAfter === undefined ? {} : { resumeAfter }),
    ...(since === undefined ? {} : { since: timeArg(since, 'since', context.now) }),
    operationTypes: listArg(args, 'operationTypes', changeEvents),
    ...(filter === undefined || Object.keys(filter).length === 0 ? {} : { filter }),
    full: boolArg(args, 'fullDocument', true),
  };
}

/** The request of the change stream: its `$match` and its options. */
export function watchRequest(place: MongoPlace, asked: WatchArgs, major: number): ConnectionRequest {
  const match: Json[] = [
    ...(asked.operationTypes.length === 0 ? [] : [{ operationType: { $in: [...asked.operationTypes] } }]),
    ...(asked.filter === undefined ? [] : [asked.filter]),
  ];
  const pipeline: Json[] =
    match.length === 0 ? [] : [{ $match: match.length === 1 ? (match[0] ?? {}) : { $and: match } }];
  const options: Record<string, Json> = {
    ...(asked.full ? { fullDocument: 'updateLookup' } : {}),
    ...(asked.full && major >= 6 ? { fullDocumentBeforeChange: 'whenAvailable' } : {}),
    ...(asked.operationTypes.some((each) => expandedEvents.includes(each)) ? { showExpandedEvents: true } : {}),
    ...(asked.resumeAfter === undefined ? {} : { resumeAfter: asked.resumeAfter }),
    ...(asked.since === undefined
      ? {}
      : { startAtOperationTime: { $timestamp: { t: Math.floor(asked.since / 1000), i: 0 } } }),
    ...(asked.database === undefined ? { allChangesForCluster: true } : {}),
  };
  const call = mongoCall(place, 'watch', [pipeline, options], asked.maxEvents);
  return { ...call, request: { ...call.request, timeLimitMs: asked.waitSeconds * 1000 } };
}

function collectionNotes(session: ToolSession, place: MongoPlace, asked: WatchArgs): readonly string[] {
  if (asked.collection === undefined) {
    return [];
  }
  const [reply] = session.send([
    mongoCall({ connection: place.connection, database: place.database }, 'listCollections', [
      { name: asked.collection },
      {},
    ]),
  ]);
  if (isFailed(reply)) {
    return [];
  }
  const entry = listOf(reply)[0];
  if (entry === undefined) {
    return [`${place.database}.${asked.collection} doesn't exist (yet): the stream sees it once created.`];
  }
  const images = recordOf(recordOf(recordOf(entry)['options'])['changeStreamPreAndPostImages']);
  return asked.full && images['enabled'] !== true
    ? [
        'The collection does not record pre-images (changeStreamPreAndPostImages), so updates and deletes have no before-image.',
      ]
    : [];
}

function whyStopped(stop: 'max' | 'wait' | 'invalidate', cut: number, asked: WatchArgs): string {
  if (stop === 'invalidate') {
    return 'the stream was invalidated (the collection or database was dropped or renamed): start a new watch without resumeAfter';
  }
  if (cut > 0) {
    return `${counted(cut, 'more event')} didn't fit in the output: call again with resumeAfter to get them`;
  }
  return stop === 'max'
    ? `stopped at maxEvents (${String(asked.maxEvents)}): more changes may be waiting, call again with resumeAfter`
    : `waited ${String(asked.waitSeconds)} s`;
}

/** `watch_changes`. */
export function watchChanges(session: ToolSession): string {
  const asked = watchArgs(session);
  const connection = toolConnection(session, 'mongodb');
  const deployment = deploymentOf(session, connection);
  if (deployment.kind === 'standalone') {
    throw new ToolProblem(
      watchProblem({ kind: 'error', message: '', code: 40573 }, connection.name, { resumed: false, since: false }),
    );
  }
  const expanded = asked.operationTypes.filter((each) => expandedEvents.includes(each));
  if (expanded.length > 0 && deployment.major > 0 && deployment.major < 6) {
    throw new ToolProblem(`${expanded.join(', ')} events need MongoDB 6.0 or later.`);
  }
  const place: MongoPlace = {
    connection: connection.id,
    database: asked.database ?? 'admin',
    ...(asked.collection === undefined ? {} : { collection: asked.collection }),
  };
  const notes = collectionNotes(session, place, asked);
  const [reply] = session.send([watchRequest(place, asked, deployment.major)]);
  if (isFailed(reply)) {
    const how = { resumed: asked.resumeAfter !== undefined, since: asked.since !== undefined };
    throw new ToolProblem(watchProblem(reply, connection.name, how));
  }
  const events = listOf(recordOf(reply)['events']).map(recordOf);
  const last = events[events.length - 1];
  const stop =
    last?.['operationType'] === 'invalidate' ? 'invalidate' : events.length >= asked.maxEvents ? 'max' : 'wait';
  const fitted = fittedItems(events.map(eventText));
  const token = fitted.left > 0 ? events[fitted.shown.length - 1]?.['_id'] : recordOf(reply)['resumeToken'];
  const data = textIn(recordOf(token)['_data']);
  const from =
    asked.since === undefined
      ? asked.resumeAfter === undefined
        ? ''
        : ' after the resume token'
      : ` since ${timeOf({ $date: { $numberLong: String(asked.since) } }, undefined)}`;
  const head = `Changes of ${scopeText(connection.name, asked.database, asked.collection)}${from}: ${counted(fitted.shown.length, 'event')}, ${whyStopped(stop, fitted.left, asked)}.`;
  const foot =
    stop === 'invalidate' || data === undefined
      ? []
      : ['', `Resume token: ${data}`, '(pass it as resumeAfter to get the changes after these)'];
  return [head, ...notes, ...(fitted.shown.length === 0 ? [] : ['', fitted.shown.join('\n\n')]), ...foot].join('\n');
}
