import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/empty';
import { view as connectionIsland } from '../../../src/features/nav/connection-island';
import { view as statusLine } from '../../../src/features/nav/status-line';
import { view as scopeBar } from '../../../src/features/nav/scope-bar';
import { view as inspector } from '../../../src/features/nav/inspector';
import { view as rail } from '../../../src/features/nav/rail';
import { cacheLocal, input, local, staging } from './inputs';

describe('nav.empty', () => {
  it('the first start shows No connections yet with Add connection, and what the tree will list', () => {
    expect(connectionIsland(input())).toMatchObject({
      kind: 'no-connection-saved',
      heading: 'No connections yet',
      add: { label: 'Add connection', feature: 'connection.add' },
    });
    expect(view(input())).toEqual({
      kind: 'no-connection-saved',
      line: 'Your databases and keys will be listed here.',
    });
  });

  it('starts the same feature from the connection island as Home does to add a connection', () => {
    const island = connectionIsland(input());
    expect(island.kind === 'no-connection-saved' && island.add.feature).toBe('connection.add');
  });

  it('with three saved connections and none current reads Choose a connection', () => {
    const nav = input({ connections: [local, staging, cacheLocal] });
    expect(connectionIsland(nav)).toEqual({ kind: 'none-current', heading: 'Choose a connection' });
    expect(view(nav)).toMatchObject({
      kind: 'none-current',
      line: 'Choose a connection to see what it holds.',
      choose: { label: 'Choose a connection', feature: 'nav.switch-connection' },
    });
  });

  it('with no connection current, the status line reads No connection and the scope bar Home', () => {
    expect(statusLine(input()).connection.text).toBe('No connection');
    expect(scopeBar(input()).path.label).toBe('Home');
  });

  it('shows no inspector island and disables only Search on the rail', () => {
    expect(inspector(input()).kind).toBe('not-shown');
    expect(
      rail(input())
        .entries.filter((entry) => entry.disabled)
        .map((entry) => entry.name),
    ).toEqual(['search']);
  });

  it('with a connection current, the tree island is the connection’s', () => {
    expect(view(input({ connections: [local], nav: { current: local.id } }))).toBeUndefined();
  });
});
