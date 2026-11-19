import { describe, expect, it } from 'vitest';
import { failureText, plan } from '../../../src/features/monitor/set-profiler';
import { cluster, contextOn, local, planOf, production, startedWith } from './context';

function planWith(args: Record<string, unknown>): ReturnType<typeof plan> {
  return plan(contextOn('monitor.set-profiler'), startedWith({ connection: local.id, database: 'shop', ...args }));
}

describe('monitor.set-profiler', () => {
  it('sends { profile: 1, slowms: 250 } on shop and says what the profiler records', () => {
    const shown = planOf(planWith({ level: 1, slowMs: 250 }));
    expect(shown.title).toBe('Set the profiler of shop');
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 250 })',
    ]);
    expect(shown.danger).toEqual({ kind: 'none' });
    expect(shown.after).toEqual([
      { kind: 'notify', level: 'success', text: 'The profiler of shop records operations slower than 250 ms.' },
      expect.objectContaining({
        kind: 'start',
        feature: 'monitor.read-slow-queries',
        args: { connection: local.id, source: 'profiler', database: 'shop' },
      }),
    ]);
  });

  it('sends profile: 0 for Off and profile: 2 for All operations', () => {
    const off = planOf(planWith({ level: 0, slowMs: 250 }));
    expect(off.steps[0]?.text).toBe('db.getSiblingDB("shop").runCommand({ profile: 0, slowms: 250 })');
    expect(off.after[0]).toMatchObject({ text: 'The profiler of shop is off.' });
    const every = planOf(planWith({ level: 2, slowMs: 100 }));
    expect(every.steps[0]?.text).toBe('db.getSiblingDB("shop").runCommand({ profile: 2, slowms: 100 })');
    expect(every.after[0]).toMatchObject({ text: 'The profiler of shop records every operation.' });
  });

  it('sends 12.6 as 13 and -5 as 0', () => {
    expect(planOf(planWith({ level: 1, slowMs: 12.6 })).steps[0]?.text).toContain('slowms: 13');
    expect(planOf(planWith({ level: 1, slowMs: -5 })).steps[0]?.text).toContain('slowms: 0');
  });

  it('refuses on a read-only connection and through a mongos', () => {
    expect(
      plan(contextOn('monitor.set-profiler', production), startedWith({ connection: production.id, database: 'shop' })),
    ).toEqual({
      kind: 'refuse',
      code: 'monitor.set-profiler/read-only',
      message: "The connection Production is read-only: the profiler can't be changed.",
    });
    expect(
      plan(contextOn('monitor.set-profiler', cluster), startedWith({ connection: cluster.id, database: 'shop' })),
    ).toMatchObject({ kind: 'refuse', code: 'monitor.set-profiler/unsupported' });
  });

  it('says Profiler not changed: with the server’s message', () => {
    expect(failureText('not authorized')).toBe('Profiler not changed: not authorized');
  });
});
