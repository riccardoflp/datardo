import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/connection-island';
import { cacheLocal, input, local } from './inputs';
import type { ConnectionStatus, SavedConnection } from '../../../src/features/nav/types';

function island(connection: SavedConnection, latency?: number): ReturnType<typeof view> {
  return view(
    input({
      connections: [connection],
      nav: {
        current: connection.id,
        ...(latency === undefined ? {} : { latency: { connection: connection.id, milliseconds: latency } }),
      },
    }),
  );
}

const withStatus = (status: ConnectionStatus): SavedConnection => ({ ...local, status });

describe('nav.connection-island', () => {
  it('reads Local and MongoDB 8.0 · rs0 · 4 ms when connected to rs0 answering in 4 ms', () => {
    expect(island(local, 4)).toMatchObject({
      kind: 'current',
      name: 'Local',
      line: 'MongoDB 8.0 · rs0 · 4 ms',
      dot: 'filled',
    });
  });

  it('reads Redis 7.2 · standalone and the latency for Cache local', () => {
    expect(island(cacheLocal, 0.3)).toMatchObject({ line: 'Redis 7.2 · standalone · <1 ms' });
  });

  it('not connected, reads MongoDB · Not connected with Connect', () => {
    expect(island(withStatus({ kind: 'not-connected' }))).toMatchObject({
      line: 'MongoDB · Not connected',
      dot: 'ring',
      buttons: [{ label: 'Connect', feature: 'connection.connect', element: 'connection.connect@connection-island' }],
    });
  });

  it('connecting, reads Connecting… with Cancel', () => {
    expect(island(withStatus({ kind: 'connecting' }))).toMatchObject({
      line: 'Connecting…',
      dot: 'turning',
      buttons: [{ label: 'Cancel' }],
    });
  });

  it('failed, shows Failed, the first line of the reason, Retry, Reconnect and Edit, and the whole reason on hover', () => {
    const reason = 'Authentication failed.\nThe server said: bad auth';
    expect(island(withStatus({ kind: 'failed', reason }))).toMatchObject({
      line: 'Failed · Authentication failed.',
      lineTooltip: reason,
      dot: 'error',
      buttons: [{ label: 'Retry' }, { label: 'Reconnect', feature: 'connection.reconnect' }, { label: 'Edit' }],
    });
  });

  it('reconnecting, reads MongoDB · Reconnecting… with Reconnect and no latency', () => {
    const result = island(withStatus({ kind: 'reconnecting', reason: 'The server stopped answering.' }), 4);
    expect(result).toMatchObject({
      line: 'MongoDB · Reconnecting…',
      dot: 'turning-warning',
      buttons: [{ label: 'Reconnect' }],
    });
  });

  it('has the … button of the connection’s menu', () => {
    expect(island(local)).toMatchObject({ menu: { element: 'connection.menu@connection-island' } });
  });

  it('shows Read-only beside the name of a read-only connection in every state', () => {
    const statuses: ConnectionStatus[] = [
      { kind: 'not-connected' },
      { kind: 'connecting' },
      { kind: 'connected', server: { version: '8.0', topology: 'rs0' } },
      { kind: 'reconnecting', reason: 'lost' },
      { kind: 'failed', reason: 'refused' },
    ];
    for (const status of statuses) {
      expect(island({ ...local, readOnly: true, status })).toMatchObject({ readOnly: 'Read-only' });
    }
  });

  it('with no connection current reads Choose a connection', () => {
    expect(view(input({ connections: [local] }))).toEqual({ kind: 'none-current', heading: 'Choose a connection' });
  });
});
