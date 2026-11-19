import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/monitor/clear-profiler';
import { parse } from '../../../src/features/monitor/read-slow-queries';
import { cluster, contextOn, failed, int, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.clear-profiler');
const on = { connection: local.id, database: 'shop' };
const only = { ...on, source: 'profiler', only: 'profiler' };

function withReads(level: number, slowMs: number, collections: readonly string[]): Record<string, unknown> {
  return {
    ...startedWith(on),
    profiler: parse([{ was: int(level), slowms: int(slowMs), ok: 1 }], only),
    collections: { entries: collections.map((name) => ({ name, type: 'collection' })) },
  };
}

describe('monitor.clear-profiler', () => {
  it('reads the profiler’s state, then the collections of the database', () => {
    expect(plan(context, startedWith(on))).toEqual({
      kind: 'read',
      need: { key: 'profiler', read: 'monitor.read-slow-queries', args: only },
    });
    const { collections: _collections, ...profilerOnly } = withReads(1, 100, []);
    expect(plan(context, profilerOnly)).toEqual({
      kind: 'read',
      need: { key: 'collections', read: 'tree.list-collections', args: on },
    });
  });

  it('turns the profiler off, drops system.profile and sets it back, after a confirmation', () => {
    const shown = planOf(plan(context, withReads(1, 100, ['orders', 'system.profile'])));
    expect(shown.title).toBe('Clear the profiler of shop');
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.getSiblingDB("shop").runCommand({ profile: 0 })',
      'db.getSiblingDB("shop").system.profile.drop()',
      'db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })',
    ]);
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        'Clear the operations recorded by the profiler of shop?\nThe system.profile collection is emptied; the ' +
        'profiler keeps recording with the same settings.',
      button: 'Clear',
    });
    expect(shown.undo).toEqual({ cannot: 'The recorded operations are not kept anywhere else.' });
    expect(shown.after[0]).toEqual({ kind: 'notify', level: 'success', text: 'Cleared the profiler of shop.' });
  });

  it('only drops system.profile when the profiler is off', () => {
    const shown = planOf(plan(context, withReads(0, 100, ['system.profile'])));
    expect(shown.steps.map((step) => step.text)).toEqual(['db.getSiblingDB("shop").system.profile.drop()']);
  });

  it('turns the profiler off and back to level 2 when there is no system.profile yet', () => {
    const shown = planOf(plan(context, withReads(2, 100, ['orders'])));
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.getSiblingDB("shop").runCommand({ profile: 0 })',
      'db.getSiblingDB("shop").runCommand({ profile: 2, slowms: 100 })',
    ]);
  });

  it('refuses when the profiler could not be read', () => {
    const answers = { ...startedWith(on), profiler: parse([failed('not authorized', 13)], only) };
    expect(plan(context, answers)).toEqual({
      kind: 'refuse',
      code: 'monitor.clear-profiler/not-read',
      message: 'The profiler of shop could not be read: nothing was cleared.',
    });
  });

  it('refuses on a read-only connection and through a mongos', () => {
    expect(
      plan(contextOn('monitor.clear-profiler', production), startedWith({ ...on, connection: production.id })),
    ).toEqual({
      kind: 'refuse',
      code: 'monitor.clear-profiler/read-only',
      message: 'The connection Production is read-only.',
    });
    expect(
      plan(contextOn('monitor.clear-profiler', cluster), startedWith({ ...on, connection: cluster.id })),
    ).toMatchObject({ kind: 'refuse', code: 'monitor.clear-profiler/unsupported' });
  });
});
