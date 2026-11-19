/**
 * Feature: undo.revert-plan — the steps an undo sends, and what it records of its own, from the operation's records.
 */
import type { Json } from '../../shared/engine-request';
import { redisCommand } from '../../shared/engine-request';
import type { EngineStep } from '../../shared/feature';
import { sizeText } from '../task/show';
import { stepText } from '../runner/step-text';
import type { ChangedSince, Current, DocumentNow, KeyNow, UndoChoice } from './changed-since';
import { nowByRecord, recordKey } from './changed-since';
import type { BeforeRead } from './reads/keep';
import { revertText } from './text';
import type { DocumentRecord, KeyRecord, OperationRecords, OperationTarget } from './types';
import { base64Bytes, bytesOfBase64, sameValueKey } from './types';

/** Documents are put back by `bulkWrite` in steps of 1,000. */
export const revertBatch = 1000;

/** What an undo starts from: the operation's target and records, and the same documents or keys as they are now. */
export interface RevertInput {
  readonly target: OperationTarget;
  readonly records: OperationRecords;
  readonly current: Current;
}

/** The steps of an undo, what it keeps for its own record, its title, and how many documents or keys it takes. */
export interface RevertSteps {
  readonly steps: readonly EngineStep[];
  readonly keeps: BeforeRead;
  readonly title: string;
  readonly taken: number;
}

/** `Undo: <title>`; the undo of `Undo: X` is `Redo: X`, and the undo of `Redo: X` is `Undo: X`. */
export function undoTitle(title: string): string {
  if (title.startsWith('Undo: ')) {
    return `Redo: ${title.slice('Undo: '.length)}`;
  }
  if (title.startsWith('Redo: ')) {
    return `Undo: ${title.slice('Redo: '.length)}`;
  }
  return `Undo: ${title}`;
}

function taken<T extends DocumentRecord | KeyRecord>(
  records: readonly T[],
  changed: ChangedSince,
  choice: UndoChoice | undefined,
): readonly T[] {
  if (choice !== 'unchanged') {
    return records;
  }
  const changedKeys = new Set(changed.changed);
  return records.filter((record) => !changedKeys.has(recordKey(record)));
}

function documentOperation(record: DocumentRecord): Json {
  return record.before === null
    ? { deleteOne: { filter: { _id: record.id } } }
    : { replaceOne: { filter: { _id: record.id }, replacement: record.before, upsert: true } };
}

function documentSteps(target: OperationTarget, records: readonly DocumentRecord[]): readonly EngineStep[] {
  if (target.kind !== 'collection') {
    return [];
  }
  const steps: EngineStep[] = [];
  for (let start = 0; start < records.length; start += revertBatch) {
    const operations = records.slice(start, start + revertBatch).map(documentOperation);
    const step = {
      kind: 'engine' as const,
      connection: target.connection,
      writes: true,
      request: {
        engine: 'mongodb' as const,
        database: target.database,
        collection: target.collection,
        method: 'bulkWrite',
        arguments: [operations, { ordered: false }],
      },
    };
    steps.push({ ...step, text: stepText(step, target) });
  }
  return steps;
}

/** `RESTORE <key> <ttl> <dump> REPLACE`, with `<ttl>` the `PTTL` kept or `0` when it had no expiry; `DEL` for a key created. */
function keyStep(target: OperationTarget, record: KeyRecord): EngineStep {
  const key = bytesOfBase64(record.key);
  if (record.before === null) {
    const step = {
      kind: 'engine' as const,
      connection: target.connection,
      writes: true,
      request: redisCommand(databaseOf(target), 'DEL', key),
    };
    return { ...step, text: stepText(step, target) };
  }
  const ttl = String(record.before.pttl < 0 ? 0 : record.before.pttl);
  const request = redisCommand(databaseOf(target), 'RESTORE', key, ttl, bytesOfBase64(record.before.dump), 'REPLACE');
  const shown = redisCommand(databaseOf(target), 'RESTORE', key, ttl);
  const text = `${stepText({ kind: 'engine', connection: target.connection, writes: true, request: shown }, target)} ${revertText.dump(sizeText(base64Bytes(record.before.dump)))} REPLACE`;
  return { kind: 'engine', connection: target.connection, writes: true, request, text };
}

function databaseOf(target: OperationTarget): number {
  return target.kind === 'redis-database' ? target.database : 0;
}

/** What the undo keeps for its own record: each record taken as it is now, as *did not exist* when it does not. */
function undoKeeps(records: OperationRecords, chosen: ReadonlySet<string>, current: Current): BeforeRead {
  const now = nowByRecord(current);
  if (records.kind === 'documents') {
    const docs = records.docs
      .filter((record) => chosen.has(recordKey(record)))
      .map((record) => {
        const found = now.get(recordKey(record)) as DocumentNow | undefined;
        return {
          id: record.id,
          before: found?.document ?? null,
          beforeFingerprint: found?.fingerprint ?? null,
          size: sameValueKey(found?.document ?? { _id: record.id }).length,
        };
      });
    return { kind: 'documents', docs };
  }
  const keys = records.keys
    .filter((record) => chosen.has(recordKey(record)))
    .map((record) => {
      const found = now.get(recordKey(record)) as KeyNow | undefined;
      return { key: record.key, before: found?.image ?? null, beforeFingerprint: found?.fingerprint ?? null };
    });
  return { kind: 'keys', keys };
}

/** Feature: undo.revert-plan. The steps are idempotent: running them twice leaves the same documents and keys. */
export function revertSteps(
  input: RevertInput,
  changed: ChangedSince,
  choice: UndoChoice | undefined,
  title: string,
): RevertSteps {
  const { target, records, current } = input;
  if (records.kind === 'documents') {
    const docs = taken(records.docs, changed, choice);
    return {
      steps: documentSteps(target, docs),
      keeps: undoKeeps(records, new Set(docs.map(recordKey)), current),
      title: undoTitle(title),
      taken: docs.length,
    };
  }
  const keys = taken(records.keys, changed, choice);
  return {
    steps: keys.map((record) => keyStep(target, record)),
    keeps: undoKeeps(records, new Set(keys.map(recordKey)), current),
    title: undoTitle(title),
    taken: keys.length,
  };
}
