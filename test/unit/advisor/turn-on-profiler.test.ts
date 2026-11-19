import { describe, expect, it } from 'vitest';
import { commands } from '../../../src/features/advisor/commands';
import { sourcesView } from '../../../src/features/advisor/parts/sources';
import { parse } from '../../../src/features/advisor/read-slow-operations';
import { failureText, plan } from '../../../src/features/advisor/turn-on-profiler';
import type { Answers, Context } from '../../../src/shared/feature';
import { cluster, contextOn, int, local, now, planOf, production } from '../monitor/context';

const shopTarget = (connection = local) => ({ kind: 'database', connection: connection.id, database: 'shop' }) as const;

function onShop(connection = local): Context {
  return { ...contextOn('advisor.turn-on-profiler', connection), target: shopTarget(connection) };
}

/** The answers once `{ profile: -1 }` gave a threshold. */
function withThreshold(slowms: number | undefined, connection = local): Answers {
  const reply = slowms === undefined ? { was: int(0), ok: int(1) } : { was: int(0), slowms: int(slowms), ok: int(1) };
  return {
    args: { connection: connection.id, database: 'shop' },
    profile: parse([reply], { databases: ['shop'], profiled: [], collections: [], log: false }),
  };
}

describe('advisor.turn-on-profiler', () => {
  it('reads { profile: -1 } of shop first, for the threshold, and nothing else', () => {
    expect(plan(onShop(), { args: { connection: local.id, database: 'shop' } })).toEqual({
      kind: 'read',
      need: {
        key: 'profile',
        read: 'advisor.read-slow-operations',
        args: { connection: local.id, databases: ['shop'], profiled: [], collections: [], log: false },
      },
    });
  });

  it('Turn on… for shop with a threshold of 250 ms asks Turn on the profiler of shop? and sends { profile: 1, slowms: 250 }', () => {
    const shown = planOf(plan(onShop(), withThreshold(250)));
    expect(shown.title).toBe('Turn on the profiler of shop');
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text: 'Turn on the profiler of shop? Operations on shop slower than 250 ms will be recorded in shop.system.profile (a small capped collection), so the advisor can see which queries need an index. Profiling adds a little work to slow operations; it can be turned off from the Monitor page.',
      button: 'Turn on',
    });
    expect(shown.steps).toHaveLength(1);
    expect(shown.steps[0]).toMatchObject({
      kind: 'engine',
      writes: true,
      request: { database: 'shop', method: 'runCommand', arguments: [{ profile: int(1), slowms: int(250) }] },
      text: 'db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 250 })',
    });
  });

  it('with no threshold from the server, 100 ms', () => {
    const shown = planOf(plan(onShop(), withThreshold(undefined)));
    expect(shown.steps[0]).toMatchObject({ text: 'db.getSiblingDB("shop").runCommand({ profile: 1, slowms: 100 })' });
  });

  it('after it ran, it notifies and the page reads and analyzes again', () => {
    expect(planOf(plan(onShop(), withThreshold(250))).after).toEqual([
      {
        kind: 'notify',
        level: 'success',
        text: 'The profiler of shop records operations slower than 250 ms. Use the application for a while, then refresh.',
      },
      { kind: 'refresh', connection: local.id },
    ]);
  });

  it('it cannot be undone from the undo history', () => {
    expect(planOf(plan(onShop(), withThreshold(250))).undo).toEqual({
      cannot:
        'It changes a setting of the server, not documents. The Slow queries section of the Monitor page turns the profiler off again.',
    });
  });

  it('only shop is changed: the plan has one step on shop', () => {
    const shown = planOf(plan(onShop(), withThreshold(250)));
    expect(shown.steps).toHaveLength(1);
    expect(shown.steps[0]).toMatchObject({ request: { database: 'shop' } });
  });

  it('on Production the command is refused with advisor.turn-on-profiler/read-only and no Turn on… is shown', () => {
    expect(plan(onShop(production), { args: { connection: production.id, database: 'shop' } })).toEqual({
      kind: 'refuse',
      code: 'advisor.turn-on-profiler/read-only',
      message: "The connection Production is read-only: the profiler can't be changed.",
    });
    const slow = parse(
      [
        { was: int(0), slowms: int(100), ok: int(1) },
        { log: [], ok: int(1) },
      ],
      {
        databases: ['shop'],
        profiled: [],
        collections: [],
      },
    );
    const indexes = { databases: ['shop'], profiled: [], collections: [], failed: [] };
    const shown = sourcesView({ connection: production.id, readOnly: true, now }, indexes, slow);
    expect(shown.notes).toEqual([
      { text: 'The profiler of shop is off: only the slow operations still in the server log are seen.', buttons: [] },
    ]);
  });

  it('through a mongos the server’s error is shown as Profiler not changed: …', () => {
    expect(planOf(plan(onShop(cluster), withThreshold(100, cluster))).steps).toHaveLength(1);
    expect(failureText('profile is not supported on mongos')).toBe(
      'Profiler not changed: profile is not supported on mongos',
    );
  });

  it('Go to has Turn on the profiler', () => {
    expect(commands.map((each) => [each.id, each.title])).toContainEqual([
      'advisor.turn-on-profiler',
      'Turn on the profiler',
    ]);
  });
});
