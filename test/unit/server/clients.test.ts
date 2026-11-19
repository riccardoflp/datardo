import { describe, expect, it } from 'vitest';
import {
  initialClientSort,
  inspectorDisconnect,
  sortedBy,
  stateWords,
  view,
  type ClientsState,
} from '../../../src/features/server/clients';
import { clientOfLine, parse, type ServerClient } from '../../../src/features/server/read-clients';
import { at, cacheLocal, cacheProduction, failed } from './context';

function client(id: number, fields: string): ServerClient {
  return clientOfLine(`id=${String(id)} ${fields}`, '149');
}

/** 340 clients: 3 blocked on blpop, idle 2, 9 and 30 seconds; the others on get, idle 100. */
function many(): readonly ServerClient[] {
  return Array.from({ length: 340 }, (_, index) => {
    const id = index + 1;
    if (id <= 3) {
      const idle = [2, 9, 30][index] ?? 0;
      return client(
        id,
        `addr=10.0.0.${String(id)}:5000 name=worker idle=${String(idle)} flags=b cmd=blpop tot-mem=${String(1000 * id)}`,
      );
    }
    return client(id, `addr=10.0.1.${String(id % 250)}:5000 name=api idle=100 flags=N cmd=get tot-mem=${String(id)}`);
  });
}

function state(clients: readonly ServerClient[], change: Partial<ClientsState> = {}): ClientsState {
  return {
    connection: cacheLocal,
    clients: { kind: 'read', value: clients },
    readAt: at(14, 2, 11),
    filter: '',
    idleAtMost: '',
    sort: initialClientSort,
    disconnecting: [],
    ...change,
  };
}

describe('server.clients', () => {
  it('flags=xb shows in a transaction, blocked; flags=N nothing; flags=Nq q', () => {
    expect(stateWords('xb')).toBe('in a transaction, blocked');
    expect(stateWords('N')).toBe('');
    expect(stateWords('Nq')).toBe('q');
  });

  it('the filter blpop shows the clients whose last command is blpop, and the count reads 3 of 340 clients', () => {
    const shown = view(state(many(), { filter: 'BLPOP' }));
    expect(shown.table?.rows.map((row) => row.command)).toEqual(['blpop', 'blpop', 'blpop']);
    expect(shown.toolbar.count).toBe('3 of 340 clients · 14:02:11');
  });

  it('Idle ≤ 10 shows the clients idle for 10 seconds or less', () => {
    expect(view(state(many(), { idleAtMost: '10' })).table?.rows.map((row) => row.id)).toEqual(['1', '2']);
  });

  it('age=3725 is shown as 1 h 2 min', () => {
    expect(view(state([client(5, 'age=3725')])).table?.rows[0]?.age).toBe('1 h 2 min');
  });

  it('the page’s own row has the marks Datardo and this page, and its Disconnect… is disabled with its sentence', () => {
    const own = client(149, 'addr=172.17.0.1:35768 name=datardo cmd=client|list');
    const shown = view(state([own, client(150, 'name=datardo-console')]));
    expect(shown.table?.rows.map((row) => row.marks)).toEqual([['Datardo', 'this page'], ['Datardo']]);
    const [disconnect] = shown.table?.rows[0]?.menu ?? [];
    expect(disconnect).toMatchObject({
      kind: 'start',
      label: 'Disconnect…',
      element: 'server.kill-client@row-menu',
      feature: 'server.kill-client',
      enabled: false,
      disabledBecause: 'This is the connection Datardo reads this page with. Use Disconnect in the connection island.',
    });
    expect(inspectorDisconnect(state([own]), own)).toMatchObject({
      element: 'server.kill-client@inspector',
      enabled: false,
    });
    expect(shown.table?.rows[1]?.menu[0]).toMatchObject({ enabled: true });
  });

  it('Disconnect… is disabled on a read-only connection and while the disconnection of its client runs', () => {
    const other = client(7, 'addr=10.0.0.7:1');
    expect(view(state([other], { connection: cacheProduction })).table?.rows[0]?.menu[0]).toMatchObject({
      enabled: false,
      disabledBecause: 'The connection Cache production is read-only.',
    });
    expect(view(state([other], { disconnecting: ['7'] })).table?.rows[0]?.menu[0]).toMatchObject({ enabled: false });
  });

  it('sorting by Memory puts the largest first, and a second click the other way', () => {
    const sort = sortedBy(initialClientSort, 'memory');
    expect(sort).toEqual({ column: 'memory', direction: 'descending' });
    expect(
      view(state(many(), { sort }))
        .table?.rows.slice(0, 3)
        .map((row) => row.id),
    ).toEqual(['3', '2', '1']);
    expect(sortedBy(sort, 'memory')).toEqual({ column: 'memory', direction: 'ascending' });
    expect(view(state(many())).table?.rows[0]?.id).toBe('1');
  });

  it('Subscriptions add sub, psub and ssub, with 2 channels, 1 pattern as tooltip; empty when 0', () => {
    const rows = view(state([client(1, 'sub=2 psub=1 ssub=0'), client(2, 'sub=0 psub=0')])).table?.rows;
    expect(rows?.map((row) => [row.subscriptions, row.subscriptionsTooltip])).toEqual([
      ['3', '2 channels, 1 pattern'],
      ['', undefined],
    ]);
  });

  it('on Redis 6.0, with no laddr, the table is the same and the inspector island has no local address', () => {
    const without = client(42, 'addr=10.0.0.7:52144 name=orders-api age=3600 idle=3 flags=b db=0 cmd=blpop');
    const withLocal = client(
      42,
      'addr=10.0.0.7:52144 laddr=10.0.0.2:6379 name=orders-api age=3600 idle=3 flags=b db=0 cmd=blpop',
    );
    const first = view(state([without], { selected: '42' }));
    const second = view(state([withLocal], { selected: '42' }));
    expect(first.table?.rows.map(({ menu: _menu, ...row }) => row)).toEqual(
      second.table?.rows.map(({ menu: _menu, ...row }) => row),
    );
    expect(first.inspector?.fields.map(([name]) => name)).not.toContain('laddr');
  });

  it('a selected client stays selected by its id, and leaves the inspector island when it is gone', () => {
    expect(view(state(many(), { selected: '2' })).inspector?.title).toBe('2');
    expect(view(state([client(5, 'age=1')], { selected: '2' })).inspector).toBeUndefined();
  });

  it('a user whose ACL denies CLIENT sees CLIENT LIST needs a user that may run it: … and no table', () => {
    const shown = view(
      state([], { clients: parse([failed("NOPERM User app has no permissions to run the 'client|list' command")]) }),
    );
    expect(shown.error).toMatch(/^CLIENT LIST needs a user that may run it: NOPERM/u);
    expect(shown.table).toBeUndefined();
  });
});
