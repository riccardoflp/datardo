/**
 * What the unit tests of the Monitor page build their inputs from: the MongoDB connections Local (allows writes),
 * Production (read-only) and Cluster (through a mongos), a context on one of them, the replies recorded from MongoDB
 * 8.2 (`test/fixtures/replies/mongodb-8.2-monitor-*.json`) and the values of canonical Extended JSON.
 */
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json, MongoRequest } from '../../../src/shared/engine-request';
import type { Context, Outcome, Plan, ReadRequest } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { mongoConnection, stateWith } from '../connection/context';
import { mongoReply } from '../connection/replies';

/** Local: a MongoDB connection that allows writes. */
export const local: ConnectionView = mongoConnection();

/** Production: a read-only MongoDB connection. */
export const production: ConnectionView = mongoConnection({
  id: connectionId('c-production'),
  name: 'Production',
  readOnly: true,
});

/** Cluster: a MongoDB connection through a mongos. */
export const cluster: ConnectionView = mongoConnection({ id: connectionId('c-cluster'), name: 'Cluster' });

/** The app's state with the three connections connected, Local current; Cluster reaches a mongos. */
export function monitorState(): AppState {
  const state = stateWith([local, production, cluster], {
    [local.id]: 'connected',
    [production.id]: 'connected',
    [cluster.id]: 'connected',
  });
  const live = {
    ...state.connections.live,
    [local.id]: {
      state: 'connected' as const,
      server: { engine: 'mongodb' as const, version: '8.2.0', topology: { kind: 'standalone' as const }, hosts: [] },
    },
    [cluster.id]: {
      state: 'connected' as const,
      server: { engine: 'mongodb' as const, version: '8.2.0', topology: { kind: 'sharded' as const }, hosts: [] },
    },
  };
  return { ...state, connections: { ...state.connections, live }, nav: { ...state.nav, current: local.id } };
}

/** 14:00:00 on 17 November 2026, UTC: the time of the tests. */
export const now = Date.UTC(2026, 10, 17, 14, 0, 0);

/** A context of a feature started on a connection, at {@link now}. */
export function contextOn(feature: string, connection: ConnectionView = local, state = monitorState()): Context {
  return {
    feature: featureId(feature),
    now,
    platform: 'windows',
    startedBy: 'user',
    target: { kind: 'connection', connection: connection.id },
    state,
  };
}

/** The arguments a feature is started with, as the answers carry them. */
export function startedWith(args: Json): { readonly args: Json } {
  return { args };
}

/** The plan of an outcome, or a failure of the test. */
export function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome.plan;
}

/** The requests a Read sends, or a failure of the test. */
export function requestsOf(read: ReadRequest | Outcome): readonly MongoRequest[] {
  if (read.kind !== 'engine') {
    throw new Error(`Expected requests to the engine, got ${read.kind}.`);
  }
  return read.requests.map((each) => {
    if (each.request.engine !== 'mongodb') {
      throw new Error('Expected a request to MongoDB.');
    }
    return each.request;
  });
}

/** A reply recorded from MongoDB 8.2 by `test/integration/monitor/record-*.test.ts`: `currentOp`, … */
export function recorded(name: string): Json {
  return mongoReply(`mongodb-8.2-monitor-${name}`);
}

/** An error reply, as `parse` receives it in place of the reply of a request that failed. */
export function failed(message: string, code?: number): { kind: 'error'; message: string; code?: number } {
  return code === undefined ? { kind: 'error', message } : { kind: 'error', message, code };
}

/** An Int32 of canonical Extended JSON. */
export function int(value: number): Json {
  return { $numberInt: String(value) };
}

/** A Long of canonical Extended JSON. */
export function long(value: number): Json {
  return { $numberLong: String(value) };
}

/** A Double of canonical Extended JSON. */
export function double(value: number): Json {
  return { $numberDouble: String(value) };
}

/** A date of canonical Extended JSON. */
export function date(iso: string): Json {
  return { $date: { $numberLong: String(Date.parse(iso)) } };
}

/** A timestamp of canonical Extended JSON. */
export function timestamp(t: number, i: number): Json {
  return { $timestamp: { t, i } };
}
