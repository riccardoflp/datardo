/**
 * Feature: watch.stream
 *
 * Opens the change stream on what is watched, with the pipeline of **Filter** (`watch.pipeline`) and the options of
 * the page, and turns each batch it gives into the change events of the list (`watch.event-summary`).
 *
 * `request` gives the stream to open: `watch` on the collection, on the database, or, with the database `admin` and
 * no collection, on the whole deployment (`db.getMongo().watch()`: a stream cannot be opened on `admin` itself). When
 * the version of the server is not known yet, it first asks `buildInfo` alone, and `parse` gives the version back: the
 * stream is then asked again with it (`serverVersion`). The main process keeps the stream open: it asks again each
 * time the server answers, hands the change events to {@link parse} at most every 150 milliseconds, and turns an
 * error into the card's refusal with {@link streamError}.
 */
import type { Json, MongoRequest } from '../../shared/engine-request';
import { refuse, type Context, type Outcome, type ReadFeature, type ReadRequest } from '../../shared/feature';
import { connectionId, featureId } from '../../shared/ids';
import { isVersionAtLeast } from '../connection/server-info';
import { errorFacts, type Refusal } from '../history/oplog-window';
import { isRecord, numberOf, objectOf, type JsonObject } from '../history/types';
import { eventSummary } from './event-summary';
import type { WatchPage } from './page/state';
import { watchPipeline } from './pipeline';
import { streamText } from './text';
import type { Watched, WatchEvent } from './types';

/** How long the server waits for a change before answering with nothing, in milliseconds. */
export const awaitMs = 1000;

/** How often, at most, the change events received are handed to the list, in milliseconds. */
export const flushMs = 150;

/** What the stream is opened with, as JSON. */
export interface StreamArgs extends Watched {
  /** The tab of the page. */
  readonly tab: string;
  readonly filter: string;
  readonly fullDocument: boolean;
  /** The version of the server, when known. */
  readonly serverVersion?: string;
  /** The resume token to go on after (`watch.resume`), or to start after an `invalidate`. */
  readonly resumeAfter?: Json;
  readonly startAfter?: Json;
  /** The number of the next change event of the page. */
  readonly nextNumber: number;
  /** For `parse`: when the batch was received, in milliseconds since 1970. */
  readonly receivedAt?: number;
}

/** What one answer gives: the version of the server, or a batch of change events. */
export type StreamBatch =
  | { readonly kind: 'version'; readonly version: string }
  | {
      readonly kind: 'events';
      readonly events: readonly WatchEvent[];
      /** The resume token after the batch, which moves also when no change event passes the filter. */
      readonly resumeToken?: Json;
      /** The batch ends with an `invalidate`: the stream is closed. */
      readonly invalidated: boolean;
    };

/** The arguments of the stream of a page, from now, or after a resume token (`watch.resume`). */
export function streamArgs(tab: string, page: WatchPage, from: 'now' | 'last' = 'now'): StreamArgs {
  const token = from === 'last' ? page.resumeToken : undefined;
  const after =
    token === undefined ? {} : page.afterInvalidate === true ? { startAfter: token } : { resumeAfter: token };
  return {
    tab,
    ...page.watched,
    filter: page.filter,
    fullDocument: page.fullDocument,
    nextNumber: page.nextNumber,
    ...after,
  };
}

/** The arguments as given to a feature; `undefined` when they are not those of a stream. */
export function streamArgsOf(args: Json): StreamArgs | undefined {
  const fields = objectOf(args);
  const valid =
    typeof fields['tab'] === 'string' &&
    typeof fields['connection'] === 'string' &&
    typeof fields['filter'] === 'string' &&
    typeof fields['fullDocument'] === 'boolean' &&
    typeof fields['nextNumber'] === 'number';
  return valid ? (fields as unknown as StreamArgs) : undefined;
}

/** Whether the server asks for the document before: from MongoDB 6.0. */
export function asksBefore(version: string): boolean {
  return isVersionAtLeast(version, [6, 0]);
}

/** The options of the stream. */
export function streamOptions(args: StreamArgs, version: string): JsonObject {
  return {
    maxAwaitTimeMS: { $numberInt: String(awaitMs) },
    ...(args.fullDocument ? { fullDocument: 'updateLookup' } : {}),
    ...(asksBefore(version) ? { fullDocumentBeforeChange: 'whenAvailable' } : {}),
    ...(args.resumeAfter === undefined ? {} : { resumeAfter: args.resumeAfter }),
    ...(args.startAfter === undefined ? {} : { startAfter: args.startAfter }),
  };
}

/** The stream to open: on the collection, the database, or the deployment. */
export function streamRequest(args: StreamArgs, stages: readonly JsonObject[], version: string): MongoRequest {
  return {
    engine: 'mongodb',
    database: args.database ?? 'admin',
    ...(args.database !== undefined && args.collection !== undefined ? { collection: args.collection } : {}),
    method: 'watch',
    arguments: [stages, streamOptions(args, version)],
  };
}

/** `db.adminCommand({ buildInfo: 1 })`. */
export const buildInfoRequest: MongoRequest = {
  engine: 'mongodb',
  database: 'admin',
  method: 'runCommand',
  arguments: [{ buildInfo: { $numberInt: '1' } }],
};

function standalone(): Refusal {
  return refuse('watch.stream/standalone', streamText.standalone) as Refusal;
}

/** Feature: watch.stream — the stream to open; `buildInfo` first when the version is not known; or a refusal. */
export function request(context: Context, args: Json): ReadRequest | Outcome {
  const stream = streamArgsOf(args);
  if (stream === undefined) {
    throw new Error('watch.stream needs the arguments of a page.');
  }
  const pipeline = watchPipeline(stream.filter);
  if (!pipeline.ok) {
    return refuse('watch.stream/invalid-filter', pipeline.message);
  }
  const server = context.state.connections.live[stream.connection]?.server;
  if (server?.engine === 'mongodb' && server.topology.kind === 'standalone') {
    return standalone();
  }
  const version = server?.engine === 'mongodb' ? server.version : stream.serverVersion;
  const connection = connectionId(stream.connection);
  const sent = version === undefined ? buildInfoRequest : streamRequest(stream, pipeline.stages, version);
  return { kind: 'engine', requests: [{ connection, request: sent }] };
}

/** Feature: watch.stream — the version of the server, or the change events of a batch, numbered from `nextNumber`. */
export function parse(replies: readonly unknown[], args: Json): StreamBatch {
  const reply = replies[0] as Json | undefined;
  const fields = objectOf(reply);
  if (typeof fields['version'] === 'string' && fields['events'] === undefined) {
    return { kind: 'version', version: fields['version'] };
  }
  const stream = objectOf(args);
  const first = numberOf(stream['nextNumber']) ?? 1;
  const receivedAt = numberOf(stream['receivedAt']) ?? 0;
  const changes = Array.isArray(fields['events']) ? (fields['events'] as readonly Json[]) : [];
  const events = changes.filter(isRecord).map((change, index) => eventSummary(change, first + index, receivedAt));
  const token = fields['resumeToken'] ?? events.at(-1)?.token;
  return {
    kind: 'events',
    events,
    ...(token === undefined ? {} : { resumeToken: token }),
    invalidated: events.some((event) => event.type === 'invalidate'),
  };
}

/** The refusal of an error of the stream when the server is a standalone (40573); `undefined` for any other. */
export function streamError(error: unknown): Refusal | undefined {
  const facts = errorFacts(error);
  return facts.code === 40573 || /only supported on replica sets/iu.test(facts.text) ? standalone() : undefined;
}

/** The action of the main process that opens the stream of a page and keeps it open (`src/main/watch-streams.ts`). */
export const openStreamAction = 'watch.open-stream';

/**
 * Feature: watch.stream — as a control of the page starts it: a filter that cannot be read is refused at once, and
 * the stream the page had stays as it was; otherwise the app action that opens the stream and keeps it open, asking
 * again each time the server answers. The main process asks {@link request} again, says its other refusals on the
 * page (a standalone server), sends what it builds, and reads each answer with {@link parse}; the read itself answers
 * once the stream has answered for the first time.
 */
export function pageRequest(context: Context, args: Json): ReadRequest | Outcome {
  const asked = request(context, args);
  return asked.kind === 'refuse' && asked.code === 'watch.stream/invalid-filter'
    ? asked
    : { kind: 'app', action: openStreamAction, args };
}

/** The feature, as the runner starts it: from a page, the stream the main process keeps open. */
export const feature: ReadFeature = {
  kind: 'read',
  id: featureId('watch.stream'),
  request: pageRequest,
  parse: (replies) => replies[0] ?? null,
};
