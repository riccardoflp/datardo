import { describe, expect, it } from 'vitest';
import { plan as connect, serverRefusal } from '../../../src/features/connection/connect';
import { plan as disconnect } from '../../../src/features/connection/disconnect';
import { nextAttempt, plan as reconnect } from '../../../src/features/connection/reconnect';
import { noSecretsSaved } from '../../../src/shared/connection';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

const local = mongoConnection();

function stepsOf(outcome: ReturnType<typeof connect>): readonly string[] {
  return outcome.kind === 'run' ? outcome.plan.steps.map((step) => step.text) : [outcome.kind];
}

describe('connection.connect', () => {
  it('plans `connect <name>` as an app step, with no danger', () => {
    const outcome = connect(contextOf('connection.connect', stateWith([local]), on(local)), {});
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [{ kind: 'app', action: 'engine.connect', args: { connection: 'c-local' }, text: 'connect Local' }],
        danger: { kind: 'none' },
        publishes: false,
      },
    });
  });

  it('does nothing for a connection that is connected already', () => {
    const outcome = connect(
      contextOf('connection.connect', stateWith([local], { [local.id]: 'connected' }), on(local)),
      {},
    );
    expect(stepsOf(outcome)).toEqual([]);
  });

  it('refuses a connection whose connection string is missing from the secret storage', () => {
    const lost = mongoConnection({ secrets: noSecretsSaved });
    expect(connect(contextOf('connection.connect', stateWith([lost]), on(lost)), {})).toEqual({
      kind: 'refuse',
      code: 'connection.connect/no-connection-string',
      message: 'Connection string not found. Remove and re-add this connection.',
    });
  });

  it('refuses a connection whose secrets were never written, with no keychain', () => {
    const lost = mongoConnection({ secrets: noSecretsSaved });
    expect(connect(contextOf('connection.connect', stateWith([lost], {}, false), on(lost)), {})).toEqual({
      kind: 'refuse',
      code: 'connection.connect/no-secrets',
      message: 'The secrets of Local were not saved: open its form and enter them again.',
    });
  });

  it('refuses a Redis Cluster, a Sentinel and a Redis older than 6.2', () => {
    const redis = { engine: 'redis', product: 'Redis', version: '7.4.1', redisVersion: '7.4.1' } as const;
    expect(serverRefusal({ ...redis, mode: 'cluster' })).toEqual({
      code: 'connection.connect/redis-cluster',
      message: 'Redis Cluster is not supported yet.',
    });
    expect(serverRefusal({ ...redis, mode: 'sentinel' })).toEqual({
      code: 'connection.connect/redis-sentinel',
      message: 'Redis Sentinel is not supported yet.',
    });
    expect(serverRefusal({ ...redis, redisVersion: '5.0.14', version: '5.0.14', mode: 'standalone' })).toEqual({
      code: 'connection.connect/unsupported',
      message: 'Redis 5.0.14 is too old: Datardo needs Redis 6.2 or later.',
    });
    expect(serverRefusal({ ...redis, mode: 'standalone' })).toBeUndefined();
    expect(serverRefusal({ ...redis, redisVersion: '6.2.0', mode: 'standalone' })).toBeUndefined();
  });
});

describe('connection.disconnect', () => {
  it('plans `disconnect <name>` while connected, connecting or reconnecting', () => {
    for (const state of ['connected', 'connecting', 'reconnecting'] as const) {
      const outcome = disconnect(
        contextOf('connection.disconnect', stateWith([local], { [local.id]: state }), on(local)),
        {},
      );
      expect(stepsOf(outcome)).toEqual(['disconnect Local']);
    }
  });

  it('does nothing for a connection that is not connected', () => {
    expect(stepsOf(disconnect(contextOf('connection.disconnect', stateWith([local]), on(local)), {}))).toEqual([]);
  });
});

describe('connection.reconnect', () => {
  it('plans `disconnect <name>`, then `connect <name>`', () => {
    const state = stateWith([local], { [local.id]: 'failed' });
    expect(stepsOf(reconnect(contextOf('connection.reconnect', state, on(local)), {}))).toEqual([
      'disconnect Local',
      'connect Local',
    ]);
  });

  it('refuses what connecting refuses', () => {
    const lost = redisConnection({ secrets: noSecretsSaved });
    expect(reconnect(contextOf('connection.reconnect', stateWith([lost]), on(lost)), {})).toMatchObject({
      kind: 'refuse',
      code: 'connection.connect/no-connection-string',
    });
  });

  it('tries after 1, 2, 5, 10 and 30 seconds, then every 30 seconds, and stops after 5 minutes', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((attempts) => nextAttempt(attempts, 0))).toEqual([
      1000, 2000, 5000, 10_000, 30_000, 30_000, 30_000,
    ]);
    expect(nextAttempt(8, 270_000)).toBe(30_000);
    expect(nextAttempt(9, 280_000)).toBe('give-up');
  });
});
