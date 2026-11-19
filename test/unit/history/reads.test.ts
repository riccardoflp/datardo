import { describe, expect, it } from 'vitest';
import {
  oplogReadRefusal,
  parse as parseWindow,
  request as windowRequestOf,
} from '../../../src/features/history/oplog-window';
import {
  afterWindow,
  firstWindow,
  parse as parseWrites,
  request as writesRequest,
  windowFailed,
  writesFilter,
  type WindowArgs,
} from '../../../src/features/history/read-writes';
import type { Json } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextOf } from '../connection/context';
import { local, mongoState, recorded, recordedEntries, recordedId } from './recorded';

const place = { connection: local.id, database: 'history-record', collection: 'orders' };
const window = recorded('history-oplog-window') as { readonly [key: string]: Json };

describe('history.oplog-window', () => {
  it('refuses a server known as a standalone or a mongos before sending anything', () => {
    for (const [topology, code] of [
      ['standalone', 'history.oplog-window/standalone'],
      ['sharded', 'history.oplog-window/sharded'],
    ] as const) {
      const outcome = windowRequestOf(contextOf('history.oplog-window', mongoState(topology)), place);
      expect(outcome).toMatchObject({ kind: 'refuse', code });
    }
    const standalone = windowRequestOf(contextOf('history.oplog-window', mongoState('standalone')), place);
    expect(standalone).toMatchObject({
      message:
        'A standalone server has no oplog, so there is no history of the writes: it needs a replica set. A single-node one is enough (mongod --replSet rs0, then rs.initiate()).',
    });
  });

  it('asks hello, the collection, and the first and last oplog entry', () => {
    const outcome = windowRequestOf(contextOf('history.oplog-window', mongoState()), place) as ReadRequest;
    expect(outcome.kind).toBe('engine');
    const requests = outcome.kind === 'engine' ? outcome.requests.map((each) => each.request) : [];
    expect(requests.map((each) => (each.engine === 'mongodb' ? each.method : ''))).toEqual([
      'runCommand',
      'listCollections',
      'find',
      'find',
    ]);
  });

  it('reads the first and the last oplog entry of the recorded replica set', () => {
    const parsed = parseWindow([window['hello'], window['infos'], window['first'], window['last']], place);
    expect(parsed.kind).toBe('window');
    if (parsed.kind === 'window') {
      expect(parsed.first?.t).toBeLessThanOrEqual(parsed.last?.t ?? 0);
      expect(parsed.last?.time).toBeGreaterThan(0);
    }
  });

  it('says a mongos, a standalone and a view from the replies', () => {
    const sharded = recorded('sharded-hello');
    const standalone = recorded('standalone-hello');
    expect(parseWindow([sharded, [], [], []], place)).toMatchObject({
      refusal: { code: 'history.oplog-window/sharded' },
    });
    expect(parseWindow([standalone, [], [], []], place)).toMatchObject({
      refusal: { code: 'history.oplog-window/standalone' },
    });
    expect(parseWindow([window['hello'], [{ name: 'orders', type: 'view' }], [], []], place)).toMatchObject({
      refusal: {
        code: 'history.oplog-window/view',
        message: 'orders is a view: its documents are written in its source collection. Open the history from there.',
      },
    });
  });

  it('turns an error of permission into its refusal, and leaves any other', () => {
    expect(oplogReadRefusal({ code: 13, message: 'not authorized on local' })?.code).toBe(
      'history.oplog-window/not-authorized',
    );
    expect(oplogReadRefusal({ code: 2, message: 'BadValue' })).toBeUndefined();
  });
});

describe('history.read-writes', () => {
  const first = { t: 1000, i: 1, time: 1_000_000 };
  const last = { t: 100_000, i: 3, time: 100_000_000 };
  const document = { ...place, id: recordedId };

  it('starts from one second after the newest oplog entry, an hour back', () => {
    expect(firstWindow(document, { first, last }, undefined, 5)).toMatchObject({
      from: 100_001 - 3600,
      to: { t: 100_001, i: 0 },
      span: 3600,
      needed: 100,
      first: true,
    });
    expect(firstWindow(document, {}, undefined, 5)).toBeUndefined();
    expect(firstWindow(document, { first, last }, { t: 1000, i: 1 }, 5)).toBeUndefined();
  });

  it('asks the oplog newest first for the writes of the document, inside applyOps too, and of its collection', () => {
    const args = firstWindow(document, { first, last }, undefined, 0) as WindowArgs;
    const read = writesRequest(
      contextOf('history.read-writes', mongoState(), { kind: 'app' }),
      args as unknown as Json,
    );
    const sent = read.kind === 'engine' ? read.requests[0]?.request : undefined;
    expect(sent).toMatchObject({ database: 'local', collection: 'oplog.rs', method: 'find', limit: 100 });
    const filter = writesFilter('shop', 'orders', recordedId) as { readonly $or: readonly Json[] };
    expect(filter.$or).toHaveLength(3);
  });

  it('finds the 7 writes of the recorded document and stops where enough were found', () => {
    const args = firstWindow(document, { first, last }, undefined, 0) as WindowArgs;
    expect(parseWrites([recordedEntries()], args as unknown as Json).writes).toHaveLength(7);
    const few = parseWrites([recordedEntries()], { ...args, needed: 3 } as unknown as Json);
    expect(few.writes).toHaveLength(3);
    expect(few.enough).toBe(true);
    expect(afterWindow({ ...args, needed: 3 }, few, 10)).toMatchObject({ kind: 'stop', stop: { complete: false } });
  });

  it('reads 4 times further back when a window finds too little, until the first oplog entry', () => {
    const args = firstWindow(document, { first, last }, undefined, 0) as WindowArgs;
    const next = afterWindow(args, { writes: [], enough: false }, 10);
    expect(next).toMatchObject({ kind: 'next', args: { span: 14_400, to: { t: args.from, i: 0 }, first: false } });
    const atStart = { ...args, from: 1000 };
    expect(afterWindow(atStart, { writes: [], enough: false }, 10)).toMatchObject({ stop: { complete: true } });
    expect(afterWindow(args, { writes: [], enough: false }, 8000)).toMatchObject({
      stop: { complete: false, timedOut: false },
    });
  });

  it('refuses when the oplog cannot be read, or the first window runs out of time', () => {
    const args = firstWindow(document, { first, last }, undefined, 0) as WindowArgs;
    expect(windowFailed(args, { code: 13, message: 'not authorized' })).toMatchObject({
      code: 'history.read-writes/not-authorized',
    });
    expect(windowFailed(args, { code: 50, message: 'MaxTimeMSExpired' })).toMatchObject({
      code: 'history.read-writes/too-slow',
      message:
        'Reading the oplog took more than 8 s without reaching any entry: the server may be too busy, try again.',
    });
    expect(windowFailed({ ...args, first: false }, { code: 50, message: 'x' })).toMatchObject({
      kind: 'stop',
      stop: { timedOut: true },
    });
    expect(windowFailed(args, { code: 2, message: 'other' })).toBeUndefined();
  });
});
