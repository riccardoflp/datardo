/**
 * Feature: document.restore-version
 *
 * Puts a document back as it was in one of its versions in the document history: `db.orders.replaceOne({ _id: 7 },
 * { … })`, the version in full; or inserts it again, `db.orders.insertOne({ … })`, when the document was deleted. The
 * document is read as it is now (`document.read`) to count the fields that differ from the version.
 *
 * Started from the document history page with `{ id, version, at, exact }`: the `_id` and the version as canonical
 * Extended JSON, the date and time of the version as the page writes it, and whether every field of the version is
 * known.
 */
import type { Json } from '../../shared/engine-request';
import {
  needRead,
  refuse,
  run,
  type Answers,
  type Context,
  type OperationFeature,
  type Outcome,
} from '../../shared/feature';
import { featureId } from '../../shared/ids';
import { readArgs, readDocument } from './read';
import { text } from './text';
import {
  isRecord,
  keptCollection,
  namespaceText,
  refreshAfter,
  requiredArg,
  requiredPlace,
  startArgs,
  textArg,
  type DocumentPlace,
  type JsonRecord,
  type KeptDocuments,
  type ReplyOutcome,
} from './types';
import { differingFields } from './write/differing-fields';
import { collectionRequest, idFilter, oneWriteTimeLimitMs, writeStep } from './write/steps';
import { undoNoteOf, undoOf } from './write/undo-note';
import { oneLineText, replyCount, withoutId } from './write/values';

/** The version a restore was started on: the `_id`, the version in full, and its date and time as the page writes it. */
export interface RestoredVersion {
  readonly id: Json;
  readonly version: JsonRecord;
  readonly at: string;
  readonly exact: boolean;
}

/** The version of the arguments. */
export function restoredVersion(context: Context, answers: Answers): RestoredVersion {
  const version = requiredArg(context, answers, 'version');
  const args = startArgs(answers);
  return {
    id: requiredArg(context, answers, 'id'),
    version: isRecord(version) ? version : {},
    at: textArg(args, 'at') ?? '',
    exact: args['exact'] !== false,
  };
}

function refusal(place: DocumentPlace, restored: RestoredVersion): Outcome | undefined {
  if (!place.saved) {
    return refuse('document.restore-version/not-connected', text.restore.notConnected);
  }
  if (place.readOnly) {
    return refuse('document.restore-version/read-only', text.restore.readOnly(place.connectionName));
  }
  return restored.exact ? undefined : refuse('document.restore-version/partial', text.restore.partial);
}

function insertAgain(context: Context, place: DocumentPlace, restored: RestoredVersion): Outcome {
  const shown = oneLineText(restored.id);
  const kept: KeptDocuments = { kind: 'inserted', ...keptCollection(place), ids: [restored.id], count: 1 };
  const document = { _id: restored.id, ...withoutId(restored.version) };
  const question = text.restore.insertQuestion(shown, restored.at);
  return run({
    title: text.restore.title(shown, restored.at),
    steps: [writeStep(place, collectionRequest(place, 'insertOne', [document], oneWriteTimeLimitMs))],
    danger: {
      kind: 'confirm',
      text: `${question}\n${text.restore.insertDetail(namespaceText(place))}`,
      button: text.restore.insertButton,
    },
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** Reads the document as it is now, then replaces it with the version, or inserts the version again. */
export function plan(context: Context, answers: Answers): Outcome {
  const place = requiredPlace(context, answers);
  const restored = restoredVersion(context, answers);
  const refused = refusal(place, restored);
  if (refused !== undefined) {
    return refused;
  }
  if (!('current' in answers)) {
    return needRead('current', 'document.read', readArgs(place, restored.id));
  }
  const current = readDocument(answers, 'current');
  if (current === null) {
    return insertAgain(context, place, restored);
  }
  const differing = differingFields(current, restored.version);
  if (differing === 0) {
    return refuse('document.restore-version/same', text.restore.same);
  }
  const shown = oneLineText(restored.id);
  const kept: KeptDocuments = { kind: 'ids', ...keptCollection(place), ids: [restored.id], count: 1 };
  const request = collectionRequest(
    place,
    'replaceOne',
    [idFilter(restored.id), restored.version],
    oneWriteTimeLimitMs,
  );
  const question = text.restore.question(shown, restored.at);
  return run({
    title: text.restore.title(shown, restored.at),
    steps: [writeStep(place, request)],
    danger: {
      kind: 'confirm',
      text: `${question}\n${text.restore.replaces(namespaceText(place), differing)}`,
      button: text.restore.button,
    },
    undo: undoOf(undoNoteOf(place, context.state.settings, kept), kept),
    publishes: true,
    after: [refreshAfter(place)],
  });
}

/** What follows, from the reply: restored, inserted again, or deleted between the confirmation and the step. */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): ReplyOutcome {
  const place = requiredPlace(context, answers);
  const restored = restoredVersion(context, answers);
  const shown = oneLineText(restored.id);
  const [reply] = replies;
  if (isRecord(reply) && 'insertedId' in reply) {
    const notice = text.restore.inserted(shown, restored.at);
    return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
  }
  if (replyCount(reply, 'matchedCount') === 0) {
    return {
      kind: 'after',
      after: [{ kind: 'notify', level: 'error', text: text.restore.deletedMeanwhile }, refreshAfter(place)],
    };
  }
  const notice = text.restore.restored(shown, restored.at);
  return { kind: 'after', after: [{ kind: 'notify', level: 'success', text: notice }, refreshAfter(place)] };
}

/** The feature, as the runner starts it. */
export const feature: OperationFeature = { kind: 'operation', id: featureId('document.restore-version'), plan };
