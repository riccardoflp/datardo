import { describe, expect, it } from 'vitest';
import { endPause, reduceWatchPages, type WatchPages } from '../../../src/features/watch/page/state';
import { parse, request, streamArgs, streamError, type StreamArgs } from '../../../src/features/watch/stream';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { ReadRequest } from '../../../src/shared/feature';
import { contextOf } from '../connection/context';
import { mongoState, recorded } from '../history/recorded';
import { changeEvent, orders, pageOf, tab } from './page';

const standaloneMessage =
  'Change streams need a replica set or a sharded cluster: this server is a standalone. (A single-node replica set is enough, e.g. mongod --replSet rs0 and rs.initiate().)';

function sent(
  args: StreamArgs,
  version = '8.2.5',
  topology: 'replica-set' | 'unknown' = 'replica-set',
): MongoRequest | undefined {
  const state = topology === 'unknown' ? mongoState('unknown') : mongoState(topology, version);
  const outcome = request(contextOf('watch.stream', state, { kind: 'tab', tab }), args as unknown as Json);
  const read = outcome as ReadRequest;
  const each = read.kind === 'engine' ? read.requests[0]?.request : undefined;
  return each?.engine === 'mongodb' ? each : undefined;
}

describe('watch.stream', () => {
  const args = streamArgs(tab, pageOf());

  it('opens the stream on the collection with the options of the page', () => {
    expect(sent(args)).toEqual({
      engine: 'mongodb',
      database: 'shop',
      collection: 'orders',
      method: 'watch',
      arguments: [
        [],
        {
          maxAwaitTimeMS: { $numberInt: '1000' },
          fullDocument: 'updateLookup',
          fullDocumentBeforeChange: 'whenAvailable',
        },
      ],
    });
  });

  it('asks only the changed fields with Current document on update off, and no document before on MongoDB 5.0', () => {
    const off = streamArgs(tab, pageOf({ fullDocument: false }));
    expect(sent(off, '5.0.24')?.arguments[1]).toEqual({ maxAwaitTimeMS: { $numberInt: '1000' } });
  });

  it('watches a database, or the whole deployment', () => {
    const database = streamArgs(tab, pageOf({}, { connection: orders.connection, database: 'shop' }));
    expect(sent(database)).toMatchObject({ database: 'shop', method: 'watch' });
    expect(sent(database)).not.toHaveProperty('collection');
    const deployment = streamArgs(tab, pageOf({}, { connection: orders.connection }));
    expect(sent(deployment)).toMatchObject({ database: 'admin', method: 'watch' });
  });

  it('asks the version of the server first when it is not known', () => {
    expect(sent(args, '8.2.5', 'unknown')).toMatchObject({
      method: 'runCommand',
      arguments: [{ buildInfo: { $numberInt: '1' } }],
    });
    expect(parse([recorded('buildInfo')], args as unknown as Json)).toMatchObject({ kind: 'version' });
    const known = { ...args, serverVersion: '8.2.5' };
    expect(sent(known, '8.2.5', 'unknown')).toMatchObject({ method: 'watch' });
  });

  it('refuses on a standalone server, and a filter that cannot be read', () => {
    const outcome = request(
      contextOf('watch.stream', mongoState('standalone'), { kind: 'tab', tab }),
      args as unknown as Json,
    );
    expect(outcome).toEqual({ kind: 'refuse', code: 'watch.stream/standalone', message: standaloneMessage });
    expect(
      streamError({ code: 40573, message: 'The $changeStream stage is only supported on replica sets' })?.code,
    ).toBe('watch.stream/standalone');
    expect(streamError({ code: 13, message: 'not authorized on shop to execute command' })).toBeUndefined();
    const bad = request(contextOf('watch.stream', mongoState()), { ...args, filter: '{ status: ' });
    expect(bad).toMatchObject({ kind: 'refuse', code: 'watch.stream/invalid-filter' });
  });

  it('sends the pipeline of Filter', () => {
    const deletes = streamArgs(tab, pageOf({ filter: '{ operationType: "delete" }' }));
    expect(sent(deletes)?.arguments[0]).toEqual([{ $match: { operationType: 'delete' } }]);
  });

  it('numbers the change events of a batch, and keeps every type as received', () => {
    const changes = recorded('watch-change-events') as readonly Json[];
    const batch = parse([{ events: changes, resumeToken: { _data: 'after' } }], {
      ...args,
      nextNumber: 41,
    });
    expect(batch.kind).toBe('events');
    if (batch.kind !== 'events') {
      return;
    }
    expect(batch.events.map((event) => event.number)).toEqual([41, 42, 43, 44, 45, 46]);
    expect(batch.events[0]?.after?.['when']).toEqual({ $date: { $numberLong: '1794960000000' } });
    expect(batch.events[1]?.updated?.['total']).toEqual({ $numberLong: '5' });
    expect(batch.resumeToken).toEqual({ _data: 'after' });
    expect(batch.invalidated).toBe(true);
  });

  it('goes on after the last resume token: resumeAfter after Stop, startAfter after an invalidate', () => {
    const stopped = pageOf({ resumeToken: { _data: 'last' } });
    expect(sent(streamArgs(tab, stopped, 'last'))?.arguments[1]).toMatchObject({ resumeAfter: { _data: 'last' } });
    const invalidated = pageOf({ resumeToken: { _data: 'inv' }, afterInvalidate: true });
    const options = sent(streamArgs(tab, invalidated, 'last'))?.arguments[1];
    expect(options).toMatchObject({ startAfter: { _data: 'inv' } });
    expect(options).not.toHaveProperty('resumeAfter');
  });

  it('says Starting… until the first answer, then Watching; an invalidate stops it with its message', () => {
    let pages: WatchPages = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
    pages = reduceWatchPages(pages, { kind: 'starting', tab });
    expect(pages[tab]?.status).toBe('starting');
    pages = reduceWatchPages(pages, {
      kind: 'received',
      tab,
      events: [],
      resumeToken: { _data: 'a' },
      invalidated: false,
    });
    expect(pages[tab]).toMatchObject({ status: 'watching', resumeToken: { _data: 'a' } });
    pages = reduceWatchPages(pages, {
      kind: 'received',
      tab,
      events: [changeEvent(1), changeEvent(2, 'invalidate')],
      invalidated: true,
    });
    expect(pages[tab]).toMatchObject({
      status: 'stopped',
      message: { kind: 'invalidated' },
      nextNumber: 3,
      afterInvalidate: true,
    });
    expect(pages[tab]?.events).toHaveLength(2);
  });

  it('keeps the change events received before an error', () => {
    let pages: WatchPages = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
    pages = reduceWatchPages(pages, { kind: 'received', tab, events: [changeEvent(1)], invalidated: false });
    pages = reduceWatchPages(pages, { kind: 'failed', tab, message: { kind: 'error', text: 'not authorized' } });
    expect(pages[tab]).toMatchObject({ status: 'error', message: { kind: 'error', text: 'not authorized' } });
    expect(pages[tab]?.events).toHaveLength(1);
    expect(endPause(pages[tab] ?? pageOf())).toBe(pages[tab]);
  });
});
