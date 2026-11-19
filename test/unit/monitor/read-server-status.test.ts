import { describe, expect, it } from 'vitest';
import { parse, request, serverStatusOf } from '../../../src/features/monitor/read-server-status';
import { view } from '../../../src/features/monitor/stats';
import { contextOn, failed, local, long, now, recorded, requestsOf } from './context';

describe('monitor.read-server-status', () => {
  it('sends serverStatus with repl: 0, metrics: 0 and locks: 0', () => {
    const [sent] = requestsOf(request(contextOn('monitor.read-server-status'), { connection: local.id }));
    expect(sent?.database).toBe('admin');
    expect(sent?.arguments[0]).toEqual({
      serverStatus: { $numberInt: '1' },
      repl: { $numberInt: '0' },
      metrics: { $numberInt: '0' },
      locks: { $numberInt: '0' },
    });
  });

  it('keeps the host, the version, the connections and the counters of a recorded reply', () => {
    const result = parse([recorded('server-status')], { at: now });
    const status = result.kind === 'read' ? result.value : undefined;
    expect(status?.host).toBe('localhost:27017');
    expect(status?.version).toMatch(/^8\.2\./u);
    expect(status?.connections.current).toBeGreaterThan(0);
    expect(status?.counters.insert).toBeGreaterThanOrEqual(40);
    expect(status?.network).toBeDefined();
    expect(status?.at).toBe(now);
  });

  it('gives no memory without mem, and the section shows no Memory tile', () => {
    const status = serverStatusOf({ host: 'a:27017', version: '8.2.0', uptime: 5 }, now);
    expect(status.memory).toBeUndefined();
    const labels = view({ server: { kind: 'read', value: status } }).tiles.map((tile) => tile.label);
    expect(labels).not.toContain('Memory');
  });

  it('reads query: NumberLong(1200) as the number 1,200', () => {
    expect(serverStatusOf({ opcounters: { query: long(1200) } }, now).counters.query).toBe(1200);
  });

  it('shows the reply of a mongos as it is', () => {
    const status = serverStatusOf({ host: 'router:27017', version: '8.0.4', process: 'mongos', uptime: 60 }, now);
    expect(status).toMatchObject({ host: 'router:27017', version: '8.0.4', uptime: 60 });
  });

  it('gives a missing number as 0, and keeps the error of a failed read', () => {
    expect(serverStatusOf({}, now).connections.available).toBe(0);
    expect(parse([failed('not authorized on admin', 13)])).toEqual({
      kind: 'failed',
      failure: { message: 'not authorized on admin', code: 13 },
    });
  });
});
