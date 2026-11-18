import { describe, expect, it } from 'vitest';
import {
  connectionToPing,
  isSlow,
  latencyText,
  parse,
  pingIntervalMs,
  pingTimeLimitMs,
  request,
} from '../../../src/features/nav/ping';
import { cacheLocal, context, input, local, staging } from './inputs';

describe('nav.ping', () => {
  it('pings the current connection while it is connected, every 10 seconds, and no other', () => {
    expect(pingIntervalMs).toBe(10_000);
    expect(connectionToPing(input({ connections: [local, cacheLocal], nav: { current: local.id } }))?.id).toBe('local');
    expect(connectionToPing(input({ connections: [local, staging], nav: { current: staging.id } }))).toBeUndefined();
    expect(connectionToPing(input({ connections: [local] }))).toBeUndefined();
  });

  it('sends nothing while no connection is connected and current', () => {
    expect(request(context({}, 'nav.ping'), null)).toEqual({ kind: 'engine', requests: [] });
  });

  it('reads a reply of ok: 1 or PONG as an answer, and nothing else', () => {
    expect(parse([{ ok: 1 }])).toBe(true);
    expect(parse(['PONG'])).toBe(true);
    expect(parse([new TextEncoder().encode('PONG')])).toBe(true);
    expect(parse([{ ok: 0 }])).toBe(false);
  });

  it('reads 0.4 ms as <1 ms, 4.4 ms as 4 ms, 1,240 ms as 1.2 s', () => {
    expect(latencyText(0.4)).toBe('<1 ms');
    expect(latencyText(4.4)).toBe('4 ms');
    expect(latencyText(1240)).toBe('1.2 s');
  });

  it('reads no answer when nothing came within 5 seconds', () => {
    expect(pingTimeLimitMs).toBe(5000);
    expect(latencyText(undefined)).toBe('no answer');
  });

  it('shows 500 ms or more in the warning color', () => {
    expect([isSlow(499), isSlow(500)]).toEqual([false, true]);
  });
});
