import { describe, expect, it } from 'vitest';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { Answers, AppStep, Outcome } from '../../../src/shared/feature';
import type { AppState } from '../../../src/shared/state';
import type { Target } from '../../../src/shared/target';
import type { BeforeRead, DocumentImage } from '../../../src/features/undo/reads/keep';
import { afterRequests, beforeRequests, keepRead } from '../../../src/features/undo/reads/keep';
import { operationTitle, overLimitReason, plan, withImages } from '../../../src/features/undo/record';
import { keepsJson, megabyte, type Keeps, type KeyName } from '../../../src/features/undo/types';
import {
  appStateWith,
  at,
  cacheConnection,
  contextOf,
  defaultUndo,
  keysTarget,
  localConnection,
  ordersTarget,
  planOf,
  withArgs,
  withSettings,
} from './harness';

const now = at(2026, 11, 19, 14);
const order = 'b3JkZXJzOjQy' as KeyName;

function image(id: number, size = 100, before: Json | null = { _id: id, status: 'a' }): DocumentImage {
  return { id, before, beforeFingerprint: null, size };
}

function documents(count: number, size = 100): BeforeRead {
  return { kind: 'documents', docs: Array.from({ length: count }, (_, index) => image(index, size)) };
}

const empty: Keeps = { kind: 'filter', database: 'shop', collection: 'orders', filter: {} };
const old: Keeps = { kind: 'filter', database: 'shop', collection: 'orders', filter: { status: 'old' } };

interface Recording {
  readonly keeps: Keeps;
  readonly count?: number;
  readonly action?: string;
  readonly title?: string;
  readonly target?: Target;
  readonly connections?: readonly ConnectionView[];
  readonly stored?: Readonly<Record<string, unknown>>;
}

function record(recording: Recording, answers: Answers = {}): Outcome {
  const base = withSettings(appStateWith(undefined, recording.connections), recording.stored ?? {});
  const state = { ...base, app: { ...base.app, dataFolder: 'D:\\data' } } as AppState;
  const args = {
    title: recording.title ?? 'Update many in shop.orders',
    keeps: keepsJson(recording.keeps),
    count: recording.count ?? 1,
    ...(recording.action === undefined ? {} : { action: recording.action }),
    id: 'op-7',
  };
  return plan(contextOf('undo.record', state, now, recording.target ?? ordersTarget), withArgs(args, answers));
}

function cannot(outcome: Outcome): string | undefined {
  const result = planOf(outcome);
  expect(result.steps).toEqual([]);
  return 'cannot' in result.undo ? result.undo.cannot : undefined;
}

describe('undo.record', () => {
  it('records nothing when the history is off, the connection read-only or not keeping it, or over the limit', () => {
    expect(cannot(record({ keeps: old, stored: { 'datardo.undo.enabled': false } }))).toBeDefined();
    expect(cannot(record({ keeps: old, connections: [{ ...localConnection, readOnly: true }] }))).toBeDefined();
    expect(cannot(record({ keeps: old, connections: [{ ...localConnection, keepsUndo: false }] }))).toBe(
      "The undo history is off for this connection: this can't be undone.",
    );
    expect(cannot(record({ keeps: old, count: 10_001 }))).toBe(
      "This can't be undone: the undo history keeps operations of up to 10,000 documents.",
    );
  });

  it('keeps the image read first: a document or a key read twice keeps its value before the first step', () => {
    const first: BeforeRead = { kind: 'documents', docs: [image(1, 100, { _id: 1, v: 1 })] };
    const second: BeforeRead = { kind: 'documents', docs: [image(1, 100, { _id: 1, v: 2 }), image(2)] };
    expect(withImages(first, second)).toEqual({ kind: 'documents', docs: [image(1, 100, { _id: 1, v: 1 }), image(2)] });
    const keyFirst: BeforeRead = {
      kind: 'keys',
      keys: [{ key: order, before: { dump: 'AA==', pttl: -1, type: 'string' }, beforeFingerprint: null }],
    };
    const keyAgain: BeforeRead = { kind: 'keys', keys: [{ key: order, before: null, beforeFingerprint: null }] };
    expect(withImages(keyFirst, keyAgain)).toEqual(keyFirst);
  });

  it('keeps a document the write inserts as its _id only, without reading it', () => {
    const inserted: Keeps = { kind: 'inserted', database: 'shop', collection: 'orders', ids: [41] };
    const result = planOf(record({ keeps: inserted }));
    expect(result.undo).toEqual({
      keeps: {
        kind: 'documents',
        docs: [{ id: 41, before: null, beforeFingerprint: null, size: expect.any(Number) as number }],
      },
    });
  });

  it('records 10,000 documents, and not 10,001: more than 10,000 documents', () => {
    expect(overLimitReason(documents(10_000), defaultUndo)).toBeUndefined();
    expect(overLimitReason(documents(10_001), defaultUndo)).toBe('more than 10,000 documents');
  });

  it('records no documents of more than 20 MB, and counts the dumps and the names of keys', () => {
    expect(overLimitReason(documents(21, megabyte), defaultUndo)).toBe('more than 20 MB');
    const big: BeforeRead = {
      kind: 'keys',
      keys: [
        {
          key: order,
          before: { dump: btoa('x'.repeat(21 * megabyte)), pttl: -1, type: 'string' },
          beforeFingerprint: null,
        },
      ],
    };
    expect(overLimitReason(big, defaultUndo)).toBe('more than 20 MB');
  });

  it('asks Update without the possibility to undo? when the documents turn out to take 25 MB', () => {
    const answers = { before: documents(25, megabyte) };
    expect(record({ keeps: old, action: 'Update' }, answers)).toMatchObject({
      kind: 'ask',
      question: { title: 'Update without the possibility to undo?', button: 'Update without undo', fields: [] },
    });
    expect(cannot(record({ keeps: old, action: 'Update' }, { ...answers, withoutUndo: true }))).toBe('more than 20 MB');
  });

  it('asks Type orders to confirm for a Delete many with an empty filter that passes a limit', () => {
    const outcome = record({ keeps: empty, action: 'Delete' }, { before: documents(25, megabyte) });
    expect(outcome).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Delete without the possibility to undo?',
        button: 'Delete without undo',
        fields: [
          {
            kind: 'text',
            key: 'confirmName',
            label: 'Type orders to confirm',
            rules: [{ kind: 'equals', value: 'orders' }],
          },
        ],
      },
    });
  });

  it('asks with no field for the filter { status: "old" }, nor for { _id: { $exists: true } }', () => {
    for (const filter of [{ status: 'old' }, { _id: { $exists: true } }]) {
      const keeps: Keeps = { ...old, filter };
      expect(record({ keeps, action: 'Delete' }, { before: documents(10_001) })).toMatchObject({
        question: { fields: [] },
      });
    }
  });

  it('has the field when the filter written is {}, though the filter sent names a field', () => {
    const keeps: Keeps = {
      kind: 'filter',
      database: 'shop',
      collection: 'people',
      filter: { note: { $exists: true } },
      written: {},
    };
    expect(record({ keeps, action: 'Remove' }, { before: documents(10_001) })).toMatchObject({
      question: { title: 'Remove without the possibility to undo?', fields: [{ label: 'Type people to confirm' }] },
    });
  });

  it('never has the field when keeping documents by their _ids, or keys', () => {
    const ids: Keeps = { kind: 'ids', database: 'shop', collection: 'orders', ids: [1] };
    expect(record({ keeps: ids, action: 'Delete' }, { before: documents(10_001) })).toMatchObject({
      question: { fields: [] },
    });
    const keys: Keeps = { kind: 'keys', database: 0, keys: [order] };
    const failed = record(
      { keeps: keys, action: 'Delete', target: keysTarget },
      { before: { kind: 'failed', error: 'NOPERM' } },
    );
    expect(failed).toMatchObject({
      kind: 'ask',
      question: { text: "The keys can't be kept for the undo history: NOPERM", fields: [] },
    });
  });

  it('reads DUMP, PTTL and TYPE of a key before the write, and DUMP and PTTL after it', () => {
    const keys: Keeps = { kind: 'keys', database: 0, keys: [order] };
    expect(record({ keeps: keys, target: keysTarget })).toMatchObject({
      kind: 'read',
      need: { key: 'before', read: keepRead },
    });
    const words = (requests: ReturnType<typeof beforeRequests>): readonly string[] =>
      requests.flatMap((each) =>
        each.request.engine === 'redis' ? [new TextDecoder().decode(each.request.command[0])] : [],
      );
    expect(words(beforeRequests(cacheConnection.id, keys, 10_001))).toEqual(['DUMP', 'PTTL', 'TYPE']);
    expect(
      words(afterRequests({ phase: 'after', connection: cacheConnection.id, database: 0, keys: [order] })),
    ).toEqual(['DUMP', 'PTTL']);
  });

  it('records nothing for a write that changed nothing', () => {
    const before: BeforeRead = { kind: 'documents', docs: [{ ...image(1), beforeFingerprint: 'same' as never }] };
    const after = { kind: 'documents', docs: [{ id: 1, after: 'same' }] };
    expect(cannot(record({ keeps: old }, { before, wrote: { failedIds: [] }, after }))).toBeDefined();
  });

  it('writes the file, then lists the operation with its title cut to 300 characters and its numbers', () => {
    const before: BeforeRead = { kind: 'documents', docs: [{ ...image(1), beforeFingerprint: 'a' as never }] };
    const after = { kind: 'documents', docs: [{ id: 1, after: 'b' }] };
    const title = 'x'.repeat(301);
    const outcome = record({ keeps: old, title }, { before, wrote: { failedIds: [] }, after });
    const steps = planOf(outcome).steps as readonly AppStep[];
    expect(steps.map((step) => step.action)).toEqual(['undo.write-operation', 'undo.add-operation']);
    expect(steps[0]?.text).toBe('write D:\\data\\undo\\op-7.json.gz');
    expect(steps[1]?.args).toMatchObject({
      entry: {
        id: 'op-7',
        time: now,
        connection: 'c-local',
        title: operationTitle(title),
        inserted: 0,
        updated: 1,
        deleted: 0,
      },
    });
    expect(operationTitle(title)).toBe(`${'x'.repeat(299)}…`);
    expect(operationTitle('x'.repeat(300))).toBe('x'.repeat(300));
    expect(planOf(outcome).after).toEqual([{ kind: 'start', feature: 'undo.limits', target: { kind: 'app' } }]);
  });

  it('never keeps an insert that failed on an existing _id', () => {
    const inserted: Keeps = { kind: 'inserted', database: 'shop', collection: 'orders', ids: [1, 2] };
    const outcome = record({ keeps: inserted }, { wrote: { failedIds: [1] } });
    expect(outcome).toMatchObject({ kind: 'read', need: { key: 'after', args: { ids: [2] } } });
  });

  it('keeps also the _ids the server gave to inserted documents that had none, from the replies', () => {
    const given = { $oid: '6afe48bc6ece4e0d19cc4293' };
    const inserted: Keeps = { kind: 'inserted', database: 'shop', collection: 'orders', ids: [41] };
    const outcome = record({ keeps: inserted, count: 2 }, { wrote: { failedIds: [], insertedIds: [given] } });
    expect(outcome).toMatchObject({ kind: 'read', need: { key: 'after', args: { ids: [41, given] } } });
  });
});
