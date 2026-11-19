import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/features/server/read-slow-log';
import { plan } from '../../../src/features/server/slow-log-reset';
import type { Answers } from '../../../src/shared/feature';
import { cacheLocal, cacheProduction, commandText, contextOn, planOf } from './context';

function length(count: number): Answers {
  return { args: null, length: parse([count], { part: 'length' }) };
}

describe('server.slow-log-reset', () => {
  it('reads SLOWLOG LEN first, for the number of entries the confirmation says', () => {
    expect(plan(contextOn('server.slow-log-reset'), { args: null })).toEqual({
      kind: 'read',
      need: { key: 'length', read: 'server.read-slow-log', args: { connection: cacheLocal.id, part: 'length' } },
    });
  });

  it('Clear… with 128 entries shows its title, 128 entries, the step SLOWLOG RESET and the button Clear', () => {
    const shown = planOf(plan(contextOn('server.slow-log-reset'), length(128)));
    expect(shown.title).toBe('Clear the slow log of Cache local?');
    expect(shown.touches).toBe('128 entries');
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text: 'The 128 entries are removed from the server, for every client and every tool that reads them. The server goes on logging with the same threshold.',
      button: 'Clear',
    });
    const [step] = shown.steps;
    expect(step?.kind === 'engine' && step.request.engine === 'redis' ? commandText(step.request) : '').toBe(
      'SLOWLOG RESET',
    );
    expect(step).toMatchObject({ writes: true, text: 'SLOWLOG RESET' });
  });

  it('the plan changes nothing but the slow log: no CONFIG SET of the threshold', () => {
    const shown = planOf(plan(contextOn('server.slow-log-reset'), length(128)));
    expect(shown.steps).toHaveLength(1);
  });

  it('after Clear it notifies, and reads the slow log again', () => {
    expect(planOf(plan(contextOn('server.slow-log-reset'), length(5))).after).toEqual([
      { kind: 'notify', level: 'success', text: 'Cleared the slow log of Cache local.' },
      {
        kind: 'start',
        feature: 'server.read-slow-log',
        target: { kind: 'connection', connection: cacheLocal.id },
        args: { connection: cacheLocal.id, part: 'entries' },
      },
    ]);
  });

  it('the confirmation says that it cannot be undone', () => {
    expect(planOf(plan(contextOn('server.slow-log-reset'), length(1))).undo).toEqual({
      cannot: 'The entries are kept nowhere else.',
    });
  });

  it('on Cache production nothing is sent and the refusal is server.slow-log-reset/read-only', () => {
    expect(plan(contextOn('server.slow-log-reset', cacheProduction), { args: null })).toEqual({
      kind: 'refuse',
      code: 'server.slow-log-reset/read-only',
      message: 'The connection Cache production is read-only.',
    });
  });

  it('with no entry the refusal is server.slow-log-reset/empty and no confirmation opens', () => {
    expect(plan(contextOn('server.slow-log-reset'), length(0))).toEqual({
      kind: 'refuse',
      code: 'server.slow-log-reset/empty',
      message: 'The slow log of Cache local is already empty.',
    });
  });
});
