/**
 * What the two writes of the compare area share: how they are started, the guard of the side they write, their steps
 * on that side (`bulkWrite` of `replaceOne` with `upsert`, `deleteMany` by `_id`, 500 documents a step), what the undo
 * history keeps, and what follows from the replies of the steps.
 */
import type { Json, MongoRequest } from '../../../shared/engine-request';
import { refuse, type After, type Answers, type EngineStep, type Outcome } from '../../../shared/feature';
import type { Context } from '../../../shared/feature';
import { savedConnection } from '../../../shared/state/connections';
import type { DocumentPlace, KeptDocuments } from '../../document/types';
import { manyWriteTimeLimitMs } from '../../document/write/steps';
import { replyCount } from '../../document/write/values';
import { stepText } from '../../runner/step-text';
import { text } from '../text';
import {
  idKey,
  idOfDocument,
  idsPerQuery,
  otherSide,
  readSide,
  sideInfo,
  sideTarget,
  sideText,
  type Side,
  type SideInfo,
  type SideRef,
} from '../types';

/** How a write of the comparison page is started: the two sides, the side written, and whether a comparison runs. */
export interface WriteStart {
  readonly left: SideRef;
  readonly right: SideRef;
  /** The side made like the other. */
  readonly to: Side;
  readonly comparing: boolean;
  readonly args: Readonly<Record<string, unknown>>;
}

/** The two sides as the connections are now: the one written and the one it is made like. */
export interface WriteSides {
  readonly target: SideInfo;
  readonly source: SideInfo;
}

/** The start of a write; a start without its sides is a fault of the caller. */
export function writeStart(context: Context, answers: Answers): WriteStart {
  const args = answers['args'];
  const fields =
    typeof args === 'object' && args !== null && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const left = readSide(fields['left']);
  const right = readSide(fields['right']);
  const to = fields['to'];
  if (left === undefined || right === undefined || (to !== 'left' && to !== 'right')) {
    throw new Error(`${context.feature} is started with the two sides and the side to write.`);
  }
  return { left, right, to, comparing: fields['comparing'] === true, args: fields };
}

/** The sides of a write, by what it was started with. */
export function writeSides(context: Context, start: WriteStart): WriteSides {
  const sides = { left: start.left, right: start.right };
  return { target: sideInfo(context, sides[start.to]), source: sideInfo(context, sides[otherSide(start.to)]) };
}

/** The refusal of a write to a side whose connection is read-only or that is a view, with the codes of its card. */
export function refusedTarget(target: SideInfo, readOnlyCode: string, viewCode: string): Outcome | undefined {
  if (target.readOnlyWhy === 'read-only') {
    return refuse(readOnlyCode, text.refusals.readOnly(target.connectionName));
  }
  return target.readOnlyWhy === 'view' ? refuse(viewCode, text.refusals.view(target.collection)) : undefined;
}

/** The side written, as the rules of the undo history name a collection (`undo.note`). */
export function targetPlace(context: Context, target: SideInfo): DocumentPlace {
  const saved = savedConnection(context.state.connections, target.connection);
  return {
    connection: target.connection,
    connectionName: target.connectionName,
    saved: saved !== undefined,
    readOnly: target.readOnlyWhy === 'read-only',
    keepsUndo: saved?.keepsUndo ?? true,
    database: target.database,
    collection: target.collection,
    view: target.view,
  };
}

/** What the undo history keeps: the documents of the side written with these `_id`s, as they are before the steps. */
export function keptOf(target: SideRef, ids: readonly Json[]): KeptDocuments {
  const where = { connection: target.connection, database: target.database, collection: target.collection };
  return { kind: 'ids', ...where, ids, count: ids.length };
}

function step(target: SideRef, method: string, args: readonly Json[]): EngineStep {
  const request: MongoRequest = {
    engine: 'mongodb',
    database: target.database,
    collection: target.collection,
    method,
    arguments: args,
    timeLimitMs: manyWriteTimeLimitMs,
  };
  const sent = { kind: 'engine', connection: target.connection, request, writes: true } as const;
  return { ...sent, text: stepText(sent, sideTarget(target)) };
}

function inGroups<T>(items: readonly T[]): readonly (readonly T[])[] {
  const groups: (readonly T[])[] = [];
  for (let start = 0; start < items.length; start += idsPerQuery) {
    groups.push(items.slice(start, start + idsPerQuery));
  }
  return groups;
}

/** The steps that write the documents whole on the side, 500 `replaceOne`s with `upsert` a `bulkWrite`. */
export function copySteps(target: SideRef, documents: readonly Json[]): readonly EngineStep[] {
  return inGroups(documents).map((group) =>
    step(target, 'bulkWrite', [
      group.map((document) => ({
        replaceOne: { filter: { _id: idOfDocument(document) }, replacement: document, upsert: true },
      })),
      { ordered: false },
    ]),
  );
}

/** The steps that delete documents of the side by `_id`, 500 a `deleteMany`. */
export function deleteSteps(target: SideRef, ids: readonly Json[]): readonly EngineStep[] {
  return inGroups(ids).map((group) => step(target, 'deleteMany', [{ _id: { $in: group } }]));
}

/** The documents a read gave, in the order of `ids`; those no longer there are left out. */
export function documentsInOrder(read: unknown, ids: readonly Json[]): readonly Json[] {
  const found = new Map<string, Json>();
  for (const document of Array.isArray(read) ? (read as readonly Json[]) : []) {
    found.set(idKey(idOfDocument(document)), document);
  }
  return ids.flatMap((id) => {
    const document = found.get(idKey(id));
    return document === undefined ? [] : [document];
  });
}

/** What follows a write: the open tabs of the side written read again, and the tree is refreshed. */
export function refreshAfter(target: SideRef): After {
  return { kind: 'refresh', connection: target.connection };
}

/**
 * What a write says once its steps have run, from what it plans (the runner does not give a plan the replies of its
 * steps, Q58): *Wrote 5 documents, deleted 4 in Production › shop.orders.*, and the pages read again.
 */
export function plannedAfter(target: SideInfo, written: number, deleted: number): readonly After[] {
  return [
    { kind: 'notify', level: 'success', text: text.writes.wrote(written, deleted, sideText(target)) },
    refreshAfter(target),
  ];
}

/**
 * What a write says once its steps have run, from their replies: *Wrote 5 documents, deleted 4 in Production ›
 * shop.orders.*, and the pages read again. A document written is one the server inserted or matched.
 */
export function afterReplies(context: Context, answers: Answers, replies: readonly unknown[]): readonly After[] {
  const { target } = writeSides(context, writeStart(context, answers));
  const written = replies.reduce<number>(
    (sum, reply) => sum + replyCount(reply, 'upsertedCount') + replyCount(reply, 'matchedCount'),
    0,
  );
  const deleted = replies.reduce<number>((sum, reply) => sum + replyCount(reply, 'deletedCount'), 0);
  return [
    { kind: 'notify', level: 'success', text: text.writes.wrote(written, deleted, sideText(target)) },
    refreshAfter(target),
  ];
}
