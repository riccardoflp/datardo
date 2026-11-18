import { describe, expect, it } from 'vitest';
import { planFor, switcherGroups, switcherView } from '../../../src/features/nav/switch-connection';
import { tabId } from '../../../src/shared/ids';
import { cacheLocal, connection, input, local, production, staging } from './inputs';

const connections = [local, staging, production, cacheLocal];

describe('nav.switch-connection', () => {
  it('lists Local and Staging under no heading, then the heading Live with Production', () => {
    const groups = switcherGroups([local, staging, production], undefined, '');
    expect(groups.map((group) => [group.folder, group.rows.map((row) => row.connection.name)])).toEqual([
      [undefined, ['Local', 'Staging']],
      ['Live', ['Production']],
    ]);
  });

  it('shows a dot that turns for a connection that is reconnecting', () => {
    const reconnecting = connection('r', 'R', 'mongodb', { status: { kind: 'reconnecting', reason: 'lost' } });
    expect(switcherGroups([reconnecting], undefined, '')[0]?.rows[0]?.dot).toBe('turning-warning');
  });

  it('filters by name, folder or engine, whatever the case', () => {
    const names = (filter: string): string[] =>
      switcherGroups(connections, undefined, filter).flatMap((group) => group.rows.map((row) => row.connection.name));
    expect(names('red')).toEqual(['Cache local']);
    expect(names('live')).toEqual(['Production']);
    expect(switcherView(input({ connections }), 'zz').empty).toBe('No connection matches "zz".');
  });

  it('with no saved connection reads No connections yet., above Add connection', () => {
    expect(switcherView(input(), '')).toMatchObject({
      empty: 'No connections yet.',
      add: { label: 'Add connection', element: 'connection.add@connection-switcher' },
    });
  });

  it('choosing Staging, whose tab orders was active last, makes orders active and Staging current', () => {
    const tabs = [
      { id: tabId('t1'), title: 'users', connection: staging.id, lastActive: 10 },
      { id: tabId('t2'), title: 'orders', connection: staging.id, lastActive: 20 },
    ];
    const outcome = planFor(input({ connections, tabs, nav: { current: local.id } }), {
      args: { connection: 'staging' },
    });
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        steps: [
          { text: 'make Staging the current connection', action: 'nav.make-current', args: { connection: 'staging' } },
          { text: 'make the tab orders active', args: { tab: 't2' } },
        ],
      },
    });
  });

  it('choosing Cache local, with no tab and not connected, opens its Overview and connects it', () => {
    const notConnected = { ...cacheLocal, status: { kind: 'not-connected' } as const };
    const outcome = planFor(input({ connections: [local, notConnected] }), { args: { connection: 'cache-local' } });
    expect(outcome).toMatchObject({
      plan: {
        steps: [{ text: 'make Cache local the current connection' }, { text: 'open Overview of Cache local' }],
        after: [
          { kind: 'start', feature: 'connection.connect', target: { kind: 'connection', connection: 'cache-local' } },
        ],
      },
    });
  });

  it('choosing the connection already current only closes the list', () => {
    const outcome = planFor(input({ connections, nav: { current: local.id } }), { args: { connection: 'local' } });
    expect(outcome).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });

  it('asks which connection when none is given, with the current one selected', () => {
    const outcome = planFor(input({ connections, nav: { current: staging.id } }), { args: null });
    expect(outcome).toMatchObject({
      kind: 'ask',
      question: { fields: [{ kind: 'pick-one', key: 'connection', default: 'staging' }] },
    });
  });
});
