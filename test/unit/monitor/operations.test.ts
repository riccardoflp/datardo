import { describe, expect, it } from 'vitest';
import { view, type OperationsState } from '../../../src/features/monitor/operations';
import { parse, request, type ServerOperation } from '../../../src/features/monitor/read-operations';
import { contextOn, int, local, now, recorded, requestsOf } from './context';

function operation(fields: Partial<ServerOperation> = {}): ServerOperation {
  return {
    opid: 4721,
    type: 'find',
    namespace: 'shop.orders',
    microseconds: 1_000_000,
    active: true,
    client: '10.0.0.5:51234',
    waitingForLock: false,
    command: '{ find: "orders" }',
    system: false,
    record: {},
    ...fields,
  };
}

function stateWith(operations: readonly ServerOperation[], fields: Partial<OperationsState> = {}): OperationsState {
  return {
    connection: { id: local.id, name: 'Local', readOnly: false },
    read: { kind: 'read', value: operations },
    readAt: now,
    filter: '',
    runningAtLeast: 0,
    idle: false,
    system: false,
    killing: [],
    ...fields,
  };
}

describe('monitor.operations', () => {
  it('shows 6.2 s in the warning color and 31.0 s in the danger color', () => {
    const shown = view(
      stateWith([
        operation({ opid: 1, microseconds: 31_000_000 }),
        operation({ opid: 2, microseconds: 6_200_000 }),
        operation({ opid: 3, microseconds: 850_000 }),
      ]),
    );
    expect(shown.rows.map((row) => row.running)).toEqual([
      { text: '31.0 s', tone: 'danger' },
      { text: '6.2 s', tone: 'warning' },
      { text: '850 ms', tone: 'ordinary' },
    ]);
  });

  it('hides an operation of 4.9 seconds with Running ≥ 5 and counts 0 of 1 operation', () => {
    const shown = view(stateWith([operation({ microseconds: 4_900_000 })], { runningAtLeast: 5 }));
    expect(shown.rows).toEqual([]);
    expect(shown.toolbar.count?.startsWith('0 of 1 operation · ')).toBe(true);
    expect(shown.empty).toBe('No operation matches the filters.');
  });

  it('keeps with orders the operations whose namespace or command holds it, whatever the case', () => {
    const shown = view(
      stateWith(
        [
          operation({ opid: 1, namespace: 'shop.Orders' }),
          operation({ opid: 2, namespace: 'shop.customers', command: '{ aggregate: "ORDERS" }' }),
          operation({ opid: 3, namespace: 'shop.customers', command: '{ find: "customers" }' }),
        ],
        { filter: 'orders' },
      ),
    );
    expect(shown.rows.map((row) => row.opid)).toEqual(['1', '2']);
  });

  it('hides an operation without a client until System operations is on', () => {
    const { client: _client, ...system } = operation({ system: true, type: 'none', namespace: '' });
    expect(view(stateWith([system])).rows).toEqual([]);
    expect(view(stateWith([system], { system: true })).rows).toHaveLength(1);
  });

  it('sends $all: true with Idle connections and lists them as idle', () => {
    const read = request(contextOn('monitor.read-operations'), { connection: local.id, idle: true });
    expect(requestsOf(read)[0]?.arguments).toEqual([{ currentOp: int(1), $all: true }]);
    const shown = view({ ...stateWith([]), read: parse([recorded('current-op-idle')]), idle: true, system: true });
    expect(shown.rows.some((row) => row.running.text === 'idle')).toBe(true);
  });

  it('cuts a command of more than 300 characters in the row and keeps it whole in the inspector island', () => {
    const read = parse([
      {
        inprog: [
          {
            opid: int(9),
            op: 'query',
            ns: 'shop.orders',
            active: true,
            client: '10.0.0.5:1',
            command: { find: 'orders', filter: { note: 'x'.repeat(400) } },
          },
        ],
      },
    ]);
    const shown = view({ ...stateWith([]), read, selected: 9 });
    expect(Array.from(shown.rows[0]?.command ?? '')).toHaveLength(301);
    expect(shown.rows[0]?.command.endsWith('…')).toBe(true);
    expect(JSON.stringify(shown.inspector?.record)).toContain('x'.repeat(400));
  });

  it('says No operations running. when nothing was read', () => {
    expect(view(stateWith([])).empty).toBe('No operations running.');
  });

  it('has no Kill on the rows of a read-only connection, and Kill… otherwise', () => {
    const readOnly = view(
      stateWith([operation()], { connection: { id: local.id, name: 'Production', readOnly: true }, selected: 4721 }),
    );
    expect(readOnly.rows[0]?.kill).toBeUndefined();
    expect(readOnly.inspector?.kill).toBeUndefined();
    const shown = view(stateWith([operation()], { selected: 4721 }));
    expect(shown.rows[0]?.kill).toMatchObject({
      label: 'Kill…',
      element: 'monitor.kill-operation@row-menu',
      feature: 'monitor.kill-operation',
    });
    expect(shown.inspector?.kill?.element).toBe('monitor.kill-operation@inspector');
  });

  it('marks a lock, highlights a COLLSCAN plan and joins the application and the client', () => {
    const shown = view(
      stateWith([operation({ waitingForLock: true, plan: 'COLLSCAN', application: 'checkout', users: 'app@admin' })]),
    );
    expect(shown.rows[0]).toMatchObject({
      lock: 'Waiting for a lock',
      plan: { text: 'COLLSCAN', highlighted: true },
      client: { text: 'checkout · 10.0.0.5:51234', tooltip: 'app@admin' },
    });
  });

  it('shows the error line of a server that refuses currentOp, and no rows', () => {
    const shown = view({
      ...stateWith([]),
      read: { kind: 'failed', failure: { message: 'not authorized', code: 13 } },
    });
    expect(shown.rows).toEqual([]);
    expect(shown.error).toBe('not authorized');
  });
});
