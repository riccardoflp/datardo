import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/monitor/set-log-threshold';
import { view } from '../../../src/features/monitor/slow-queries';
import { contextOn, local, planOf, production, startedWith } from './context';

describe('monitor.set-log-threshold', () => {
  it('sends { profile: -1, slowms: 50 } and says that the operations slower than 50 ms are logged', () => {
    const shown = planOf(
      plan(contextOn('monitor.set-log-threshold'), startedWith({ connection: local.id, slowMs: 50 })),
    );
    expect(shown.title).toBe('Log operations slower than 50 ms');
    expect(shown.steps.map((step) => step.text)).toEqual(['db.adminCommand({ profile: -1, slowms: 50 })']);
    expect(shown.after[0]).toEqual({
      kind: 'notify',
      level: 'success',
      text: 'Operations slower than 50 ms are now logged.',
    });
    expect(shown.after[1]).toMatchObject({ kind: 'start', feature: 'monitor.read-slow-queries' });
  });

  it('leaves every profiler as it is: the level sent is -1', () => {
    const shown = planOf(
      plan(contextOn('monitor.set-log-threshold'), startedWith({ connection: local.id, slowMs: 50 })),
    );
    expect(shown.steps[0]).toMatchObject({ request: { arguments: [{ profile: { $numberInt: '-1' } }] } });
  });

  it('then reads The server logs the operations slower than 50 ms', () => {
    const shown = view({
      connection: { id: local.id, name: 'Local', readOnly: false, mongos: false },
      source: 'log',
      databases: ['shop'],
      since: 60,
      grouping: 'by-query',
      filter: '',
      read: {
        source: 'log',
        profiler: { kind: 'read', value: { level: 0, slowMs: 50 } },
        operations: { kind: 'read', value: { operations: [], more: false, olderLinesDropped: false } },
      },
    });
    expect(shown.recording?.startsWith('The server logs the operations slower than 50 ms · ')).toBe(true);
  });

  it('refuses on a read-only connection', () => {
    expect(
      plan(contextOn('monitor.set-log-threshold', production), startedWith({ connection: production.id, slowMs: 50 })),
    ).toMatchObject({ kind: 'refuse', code: 'monitor.set-log-threshold/read-only' });
  });
});
