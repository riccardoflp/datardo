/**
 * A Read whose requests may fail one by one: with `failedRequests: 'are-replies'`, a request that fails is given to
 * `parse` as `{ kind: 'error', message }` and the next requests go on; without it, the first failure ends the read as
 * before.
 */
import { describe, expect, it } from 'vitest';
import { start } from '../../../src/runner/start';
import { redisCommand } from '../../../src/shared/engine-request';
import type { FailedRequests, ReadFeature } from '../../../src/shared/feature';
import { connectionId, featureId } from '../../../src/shared/ids';
import { appTarget } from '../../../src/shared/target';
import { harness } from './harness';

function readOfThree(failedRequests?: FailedRequests): ReadFeature {
  return {
    kind: 'read',
    id: featureId('test.three'),
    request: () => ({
      kind: 'engine',
      requests: ['one', 'two', 'three'].map((key) => ({
        connection: connectionId('local'),
        request: redisCommand(0, 'GET', key),
      })),
      ...(failedRequests === undefined ? {} : { failedRequests }),
    }),
    parse: (replies) => replies,
  };
}

/** A server whose second request fails with a message that holds a password. */
function failingSecond(): (request: {
  request: { engine: string; command?: readonly Uint8Array[] };
}) => Promise<unknown> {
  return (request) => {
    const key = new TextDecoder().decode(request.request.command?.[1]);
    return key === 'two'
      ? Promise.reject(new Error('NOPERM cannot reach redis://app:s3cret@cache:6379'))
      : Promise.resolve(key);
  };
}

describe('the runner gives a failed request to parse when the read asks for it', () => {
  it('gives the failure in place of its reply, and sends the requests after it', async () => {
    const test = harness({ features: [readOfThree('are-replies')], server: failingSecond() });
    const result = await start(test.ports, { feature: featureId('test.three'), target: appTarget });
    expect(test.sent).toHaveLength(3);
    expect(result).toEqual({
      kind: 'read',
      result: ['one', { kind: 'error', message: 'NOPERM cannot reach redis://app:***@cache:6379' }, 'three'],
    });
    expect(test.state().runner.notifications).toEqual([]);
  });

  it('ends the read at the first failure when the read does not ask for its failures', async () => {
    for (const failedRequests of [undefined, 'end-the-read'] as const) {
      const test = harness({ features: [readOfThree(failedRequests)], server: failingSecond() });
      const result = await start(test.ports, { feature: featureId('test.three'), target: appTarget });
      expect(test.sent).toHaveLength(2);
      expect(result).toMatchObject({ kind: 'failed' });
    }
  });

  it('still ends a read that is cancelled', async () => {
    const controller = new AbortController();
    const test = harness({
      features: [readOfThree('are-replies')],
      server: (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('The operation was aborted.'));
          });
          setTimeout(() => {
            controller.abort();
          }, 0);
        }),
    });
    const result = await start(
      test.ports,
      { feature: featureId('test.three'), target: appTarget },
      { signal: controller.signal },
    );
    expect(result).toEqual({ kind: 'cancelled' });
    expect(test.sent).toHaveLength(1);
  });
});
