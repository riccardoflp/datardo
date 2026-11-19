import { describe, expect, it } from 'vitest';
import { parse } from '../../../src/features/monitor/read-replication';
import { plan } from '../../../src/features/monitor/step-down';
import { contextOn, local, planOf, production, startedWith } from './context';

const context = contextOn('monitor.step-down');
const primary = { setName: 'rs0', primary: 'db1.example.net:27017', me: 'db1.example.net:27017', ok: 1 };

function withHello(reply: unknown): Record<string, unknown> {
  return { ...startedWith({ connection: local.id }), hello: parse([reply], { step: 'hello' }) };
}

describe('monitor.step-down', () => {
  it('reads hello first', () => {
    expect(plan(context, startedWith({ connection: local.id }))).toEqual({
      kind: 'read',
      need: { key: 'hello', read: 'monitor.read-replication', args: { connection: local.id, step: 'hello' } },
    });
  });

  it('shows the confirmation with the step and the button Step down on rs0 with the primary db1.example.net:27017', () => {
    const shown = planOf(plan(context, withHello(primary)));
    expect(shown.title).toBe('Step down the primary db1.example.net:27017 of rs0');
    expect(shown.steps.map((step) => step.text)).toEqual([
      'db.adminCommand({ replSetStepDown: 60, secondaryCatchUpPeriodSecs: 10 })',
    ]);
    expect(shown.steps[0]).toMatchObject({ kind: 'engine', writes: true });
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        'Step down the primary db1.example.net:27017 of rs0?\nThe members elect a new primary: writes fail until then ' +
        '(usually a few seconds). The current primary can not be elected again for 60 seconds.',
      button: 'Step down',
    });
    expect(shown.undo).toEqual({ cannot: 'The election is the replica set’s: it cannot be undone.' });
  });

  it('says the primary stepped down and reads the replica set again', () => {
    const shown = planOf(plan(context, withHello(primary)));
    expect(shown.after[0]).toEqual({
      kind: 'notify',
      level: 'success',
      text: 'db1.example.net:27017 stepped down: a new primary is being elected.',
    });
    expect(shown.after[1]).toMatchObject({
      kind: 'start',
      feature: 'monitor.read-replication',
      args: { step: 'hello' },
    });
  });

  it('refuses without a primary, also on a standalone server and on a mongos', () => {
    for (const reply of [{ setName: 'rs0', ok: 1 }, { ok: 1 }, { msg: 'isdbgrid', ok: 1 }]) {
      expect(plan(context, withHello(reply))).toEqual({
        kind: 'refuse',
        code: 'monitor.step-down/no-primary',
        message: 'There is no primary to step down.',
      });
    }
  });

  it('sends nothing on a read-only connection: the refusal has the code monitor.step-down/read-only', () => {
    expect(plan(contextOn('monitor.step-down', production), startedWith({ connection: production.id }))).toEqual({
      kind: 'refuse',
      code: 'monitor.step-down/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
