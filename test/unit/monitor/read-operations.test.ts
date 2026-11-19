import { describe, expect, it } from 'vitest';
import { operationsOf, parse, request, serverOperationOf } from '../../../src/features/monitor/read-operations';
import type { Json } from '../../../src/shared/engine-request';
import { contextOn, failed, int, local, recorded, requestsOf } from './context';

const context = contextOn('monitor.read-operations');

function operation(fields: Readonly<Record<string, Json>>): Readonly<Record<string, Json>> {
  return { opid: int(1), op: 'query', ns: 'shop.orders', active: true, client: '10.0.0.5:51234', ...fields };
}

describe('monitor.read-operations', () => {
  it('sends currentOp with $all: false, and $all: true for the idle connections', () => {
    const [sent, ...others] = requestsOf(request(context, { connection: local.id }));
    expect(others).toEqual([]);
    expect([sent?.database, sent?.method]).toEqual(['admin', 'runCommand']);
    expect(sent?.arguments as unknown).toEqual([{ currentOp: int(1), $all: false }]);
    expect(requestsOf(request(context, { connection: local.id, idle: true }))[0]?.arguments as unknown).toEqual([
      { currentOp: int(1), $all: true },
    ]);
  });

  it('leaves out the reply’s own currentOp and keeps the find that sleeps, first', () => {
    const read = parse([recorded('current-op')]);
    if (read.kind !== 'read') {
      throw new Error('Expected the operations.');
    }
    expect(read.value.some((each) => each.command.includes('currentOp'))).toBe(false);
    expect(read.value[0]).toMatchObject({ type: 'query', namespace: 'shop.orders', opid: 15364, system: false });
    expect(read.value[0]?.command.startsWith('{ find: "orders"')).toBe(true);
    expect(read.value.filter((each) => each.system).map((each) => each.description)).toEqual([
      'Checkpointer',
      'JournalFlusher',
    ]);
  });

  it('lists the idle connections when they are read', () => {
    const read = parse([recorded('current-op-idle')]);
    expect(read.kind === 'read' && read.value.filter((each) => !each.active).length).toBeGreaterThan(0);
  });

  it('writes the command without the fields that are not the query', () => {
    const shown = serverOperationOf(
      operation({ command: { find: 'orders', filter: { status: 'paid' }, lsid: { id: 1 }, $db: 'shop' } }),
    );
    expect(shown.command).toBe('{ find: "orders", filter: { status: "paid" } }');
  });

  it('turns secs_running: 3 into 3,000,000 microseconds', () => {
    expect(serverOperationOf(operation({ secs_running: int(3) })).microseconds).toBe(3_000_000);
  });

  it('puts two active operations of 2 and 9 seconds and an idle one of 60 seconds as 9, 2, idle', () => {
    const operations = operationsOf({
      inprog: [
        operation({ opid: int(1), microsecs_running: int(2_000_000) }),
        operation({ opid: int(2), active: false, microsecs_running: { $numberLong: '60000000' } }),
        operation({ opid: int(3), microsecs_running: int(9_000_000) }),
      ],
    });
    expect(operations.map((each) => each.opid)).toEqual([3, 1, 2]);
  });

  it('writes the user app@admin', () => {
    expect(serverOperationOf(operation({ effectiveUsers: [{ user: 'app', db: 'admin' }] })).users).toBe('app@admin');
  });

  it('keeps the opid of a mongos as text, and says that an operation without a client is a system one', () => {
    const { client: _client, ...withoutClient } = operation({ opid: 'shard01:4721' });
    const shown = serverOperationOf(withoutClient);
    expect(shown).toMatchObject({ opid: 'shard01:4721', system: true });
  });

  it('gives the failure of a server that refuses currentOp', () => {
    expect(parse([failed('not authorized on admin to execute command { currentOp: 1 }', 13)])).toEqual({
      kind: 'failed',
      failure: { message: 'not authorized on admin to execute command { currentOp: 1 }', code: 13 },
    });
  });
});
