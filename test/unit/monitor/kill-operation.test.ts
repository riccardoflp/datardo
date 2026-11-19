import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/monitor/kill-operation';
import { cluster, contextOn, int, local, planOf, production, startedWith } from './context';

const row = {
  opid: 4721,
  type: 'find',
  namespace: 'shop.orders',
  microseconds: 12_400_000,
  command: '{ find: "orders", filter: { status: "paid" } }',
};

describe('monitor.kill-operation', () => {
  it('shows Kill operation 4721? with the operation, the step and the button Kill', () => {
    const shown = planOf(
      plan(contextOn('monitor.kill-operation'), startedWith({ connection: local.id, operation: row })),
    );
    expect(shown.title).toBe('Kill operation 4721?');
    expect(shown.steps.map((step) => step.text)).toEqual(['db.adminCommand({ killOp: 1, op: 4721 })']);
    expect(shown.steps[0]).toMatchObject({
      kind: 'engine',
      writes: true,
      request: { database: 'admin', method: 'runCommand', arguments: [{ killOp: int(1), op: int(4721) }] },
    });
    expect(shown.danger).toEqual({
      kind: 'confirm',
      text:
        'find shop.orders — running 12.4 s\n{ find: "orders", filter: { status: "paid" } }\nThe operation is ' +
        'interrupted and its client receives an error. Writes already done are not undone.',
      button: 'Kill',
    });
    expect(shown.undo).toEqual({
      cannot: 'A killed operation cannot be started again, and what it wrote stays written.',
    });
  });

  it('says Killed operation 4721. and reads the operations again', () => {
    const shown = planOf(
      plan(contextOn('monitor.kill-operation'), startedWith({ connection: local.id, operation: row })),
    );
    expect(shown.after).toEqual([
      { kind: 'notify', level: 'success', text: 'Killed operation 4721.' },
      expect.objectContaining({ kind: 'start', feature: 'monitor.read-operations', args: { connection: local.id } }),
    ]);
  });

  it('sends the opid of a mongos as text', () => {
    const operation = { ...row, opid: 'shard01:4721' };
    const shown = planOf(
      plan(contextOn('monitor.kill-operation', cluster), startedWith({ connection: cluster.id, operation })),
    );
    expect(shown.steps.map((step) => step.text)).toEqual(['db.adminCommand({ killOp: 1, op: "shard01:4721" })']);
  });

  it('refuses on a read-only connection', () => {
    expect(
      plan(contextOn('monitor.kill-operation', production), startedWith({ connection: production.id, operation: row })),
    ).toEqual({
      kind: 'refuse',
      code: 'monitor.kill-operation/read-only',
      message: 'The connection Production is read-only.',
    });
  });
});
