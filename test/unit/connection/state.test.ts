import { describe, expect, it } from 'vitest';
import {
  connectionStateText,
  parse,
  pingAnswerMs,
  pingEveryMs,
  pingRequest,
  request,
  stateAfterPing,
} from '../../../src/features/connection/state';
import { connectionState, initialConnectionsState, reduceConnections } from '../../../src/shared/state/connections';
import { contextOf, mongoConnection, redisConnection, stateWith } from './context';

const decoder = new TextDecoder();

describe('connection.state', () => {
  it('the states and their texts', () => {
    expect(
      (['not-connected', 'connecting', 'connected', 'reconnecting', 'failed'] as const).map(connectionStateText),
    ).toEqual(['not connected', 'connecting…', 'connected', 'reconnecting…', 'failed']);
  });

  it('a failed connection keeps its reason; a connection nothing is known of is not connected', () => {
    const local = mongoConnection();
    const failed = reduceConnections(initialConnectionsState, {
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'failed',
      reason: 'connect ECONNREFUSED 127.0.0.1:27017',
    });
    expect(failed.live[local.id]).toEqual({ state: 'failed', reason: 'connect ECONNREFUSED 127.0.0.1:27017' });
    expect(connectionState(initialConnectionsState, local.id)).toBe('not-connected');
  });

  it('one ping every 10 seconds, which has 5 seconds to answer: ping on admin, or PING', () => {
    expect(pingEveryMs).toBe(10_000);
    expect(pingAnswerMs).toBe(5000);
    expect(pingRequest('mongodb')).toMatchObject({
      engine: 'mongodb',
      database: 'admin',
      method: 'runCommand',
      arguments: [{ ping: { $numberInt: '1' } }],
      timeLimitMs: 5000,
    });
    const redis = pingRequest('redis');
    expect(redis.engine === 'redis' ? redis.command.map((word) => decoder.decode(word)) : []).toEqual(['PING']);
  });

  it('the ping of a saved connection goes to that connection', () => {
    const cache = redisConnection();
    const read = request(contextOf('connection.state', stateWith([cache])), { connection: cache.id });
    expect(read).toMatchObject({ kind: 'engine', requests: [{ connection: cache.id }] });
  });

  it('a ping with no answer puts the connection in reconnecting; a late reply changes nothing', () => {
    expect(parse([new TextEncoder().encode('PONG')])).toBe('answered');
    expect(stateAfterPing('connected', 'no-answer')).toBe('reconnecting');
    expect(stateAfterPing('connected', 'late')).toBe('connected');
    expect(stateAfterPing('connected', 'answered')).toBe('connected');
    expect(stateAfterPing('not-connected', 'no-answer')).toBe('not-connected');
  });

  it('the latency is kept only for a connected connection', () => {
    const local = mongoConnection();
    const connected = reduceConnections(initialConnectionsState, {
      slice: 'connections',
      type: 'state',
      connection: local.id,
      state: 'connected',
    });
    const latency = { slice: 'connections', type: 'latency', connection: local.id, ms: 4 } as const;
    expect(reduceConnections(connected, latency).live[local.id]?.latencyMs).toBe(4);
    expect(reduceConnections(initialConnectionsState, latency)).toBe(initialConnectionsState);
  });
});
