import { describe, expect, it } from 'vitest';
import { durationText, overviewShows, plan, sizeText, view } from '../../../src/features/connection/overview';
import type { RedisServerInfo } from '../../../src/shared/connection';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

const local = mongoConnection({ ssh: { host: 'bastion', port: 22, username: 'ops', authentication: 'agent' } });
const cache = redisConnection({ readOnly: true, keepsUndo: false });

describe('connection.overview', () => {
  it('not connected, shows the header and Connection only, with Connect, and reads nothing', () => {
    const page = view({ connections: stateWith([local]).connections, connection: local.id });
    expect(page?.state).toBe('not connected');
    expect(page?.buttons.map((button) => button.label)).toEqual(['Refresh', 'Edit connection…', 'Connect']);
    expect(page?.connection.rows).toEqual([
      { label: 'Address', value: 'mongodb://ada@db1:27017/app' },
      { label: 'Folder', value: 'None' },
    ]);
    expect(page?.connection.lines).toEqual(['Through the SSH tunnel ops@bastion']);
    expect(page?.server).toBeUndefined();
    expect(page?.read).toBeUndefined();
  });

  it('connected, reads the server and shows Loading… until it has', () => {
    const connections = stateWith([local], { [local.id]: 'connected' }).connections;
    const page = view({ connections, connection: local.id, latencyMs: 4 });
    expect(page?.state).toBe('connected · 4 ms');
    expect(page?.buttons.at(-1)?.label).toBe('Disconnect');
    expect(page?.server?.section).toEqual({ kind: 'loading', text: 'Loading…' });
    expect(page?.read).toEqual({ connection: local.id, depth: 'overview', hosts: 'db1:27017' });
    const failed = view({ connections, connection: local.id, server: { kind: 'failed', error: 'NOPERM' } });
    expect(failed?.server?.section).toEqual({ kind: 'failed', error: 'NOPERM', retry: 'Retry' });
  });

  it('shows a replica set with its hosts and roles', () => {
    const connections = stateWith([local], { [local.id]: 'connected' }).connections;
    const page = view({
      connections,
      connection: local.id,
      server: {
        kind: 'loaded',
        value: {
          engine: 'mongodb',
          version: '8.2.1',
          topology: { kind: 'replica-set', name: 'rs0' },
          hosts: [
            { host: 'db1:27017', role: 'primary' },
            { host: 'db2:27017', role: 'secondary' },
          ],
        },
      },
    });
    expect(page?.server?.section).toEqual({
      kind: 'loaded',
      rows: [
        { label: 'Version', value: '8.2.1' },
        { label: 'Topology', value: 'Replica set rs0' },
      ],
      hosts: {
        title: 'Hosts',
        rows: [
          ['db1:27017', 'primary'],
          ['db2:27017', 'secondary'],
        ],
      },
    });
  });

  it('shows the role of a Redis replica, its uptime and memory', () => {
    const info: RedisServerInfo = {
      engine: 'redis',
      product: 'Redis',
      version: '7.2.4',
      redisVersion: '7.2.4',
      mode: 'standalone',
      role: { kind: 'replica', masterHost: '10.0.0.5', masterPort: '6379' },
      uptimeSeconds: 90_000,
      memory: { used: 1536, peak: 1_073_741_824, limit: 0, policy: 'noeviction' },
      clients: { connected: 1204, blocked: 0, limit: 10_000 },
    };
    const connections = stateWith([cache], { [cache.id]: 'connected' }).connections;
    const page = view({ connections, connection: cache.id, server: { kind: 'loaded', value: info } });
    expect(page?.readOnly).toBe('Read-only');
    expect(page?.connection.lines).toEqual([
      'Read-only: Datardo refuses writes through this connection',
      'Changes aren’t kept in the undo history',
    ]);
    const section = page?.server?.section;
    expect(section?.kind === 'loaded' ? section.rows : []).toEqual([
      { label: 'Version', value: 'Redis 7.2.4' },
      { label: 'Mode', value: 'standalone' },
      { label: 'Role', value: 'replica of 10.0.0.5:6379' },
      { label: 'Uptime', value: '1 d' },
      { label: 'Memory', value: 'Used 1.5 KB · Peak 1.0 GB · Limit no limit · Eviction policy noeviction' },
      { label: 'Clients', value: 'Connected 1,204 · Blocked 0 · Limit 10,000' },
    ]);
  });

  it('writes sizes and durations as the tree does', () => {
    expect(sizeText(512)).toBe('512 B');
    expect(sizeText(1536)).toBe('1.5 KB');
    expect(sizeText(1_073_741_824)).toBe('1.0 GB');
    expect(durationText(45)).toBe('45 s');
    expect(durationText(86_400)).toBe('1 d');
  });

  it('is a page tab of the connection, opened by its app step without connecting', () => {
    expect(overviewShows(local.id)).toEqual({
      kind: 'page',
      connection: local.id,
      page: 'overview',
      title: 'Overview',
    });
    const outcome = plan(contextOf('connection.overview', stateWith([local]), on(local)), {});
    expect(outcome.kind === 'run' ? outcome.plan.steps : []).toEqual([
      { kind: 'app', action: 'connection.overview', args: { connection: local.id }, text: 'open Overview of Local' },
    ]);
  });
});
