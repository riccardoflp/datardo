/**
 * Feature: watch.enable-pre-images
 *
 * Turns on, for the watched collection, the option that makes MongoDB keep the document before each change:
 * `db.getSiblingDB("shop").runCommand({ collMod: "orders", changeStreamPreAndPostImages: { enabled: true } })`, after
 * a confirmation. It is refused on a read-only connection. The stream stays open: it already asks for the document
 * before when there is one. An error of the server is shown as *Pre-images not enabled: `<message>`*
 * ({@link preImagesFailed}).
 */
import type { MongoRequest } from '../../shared/engine-request';
import { refuse, run, type Answers, type Context, type EngineStep, type Outcome } from '../../shared/feature';
import { connectionId, type ConnectionId } from '../../shared/ids';
import { savedConnection } from '../../shared/state/connections';
import { errorFacts } from '../history/oplog-window';
import { stepText } from '../runner/step-text';
import { contextPage } from './page/state';
import { preImagesText } from './text';

/** The collection to record pre-images of: that of the page, or the collection the feature was started on. */
interface PreImagesPlace {
  readonly connection: ConnectionId;
  readonly database: string;
  readonly collection: string;
}

function placeOf(context: Context): PreImagesPlace | undefined {
  const { target } = context;
  if (target.kind === 'collection') {
    return { connection: target.connection, database: target.database, collection: target.collection };
  }
  const watched = contextPage(context)?.page.watched;
  return watched?.database === undefined || watched.collection === undefined
    ? undefined
    : { connection: connectionId(watched.connection), database: watched.database, collection: watched.collection };
}

/** The command that turns pre-images on. */
export function collModRequest(database: string, collection: string): MongoRequest {
  return {
    engine: 'mongodb',
    database,
    method: 'runCommand',
    arguments: [{ collMod: collection, changeStreamPreAndPostImages: { enabled: true } }],
  };
}

/** What the page says when the server refused: *Pre-images not enabled: `<the server's message>`*. */
export function preImagesFailed(error: unknown): string {
  return preImagesText.failed(errorFacts(error).text);
}

/** Feature: watch.enable-pre-images — `collMod` after a confirmation; refused on a read-only connection. */
export function plan(context: Context, _answers: Answers): Outcome {
  const place = placeOf(context);
  if (place === undefined) {
    throw new Error('watch.enable-pre-images needs one collection.');
  }
  const saved = savedConnection(context.state.connections, place.connection);
  if (saved?.readOnly === true) {
    return refuse('watch.enable-pre-images/read-only', preImagesText.readOnly(saved.name));
  }
  const request = collModRequest(place.database, place.collection);
  const written = { kind: 'engine' as const, connection: place.connection, request, writes: true };
  const step: EngineStep = { ...written, text: stepText(written, context.target) };
  return run({
    title: preImagesText.title(`${place.database}.${place.collection}`),
    steps: [step],
    danger: { kind: 'confirm', text: preImagesText.line, button: preImagesText.button },
    undo: { cannot: preImagesText.cannotUndo },
    publishes: false,
    after: [{ kind: 'refresh', connection: place.connection }],
  });
}
