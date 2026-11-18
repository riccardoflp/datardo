import { describe, expect, it } from 'vitest';
import { view, type MenuEntry } from '../../../src/features/connection/menu';
import type { ConnectionStateName } from '../../../src/shared/connection';
import { mongoConnection, stateWith } from './context';

function labels(entries: readonly MenuEntry[]): readonly string[] {
  return entries.map((entry) => (entry.kind === 'item' ? entry.label : '—'));
}

const local = mongoConnection();

function menuIn(state: ConnectionStateName, readOnly = false) {
  const connection = { ...local, readOnly };
  return view({
    connections: stateWith([connection], { [local.id]: state }).connections,
    connection,
    place: 'connection-island',
  });
}

describe('connection.menu', () => {
  it('offers Connect on a connection not connected, then the other groups', () => {
    expect(labels(menuIn('not-connected').entries)).toEqual([
      'Connect',
      'Open overview',
      '—',
      'Edit connection…',
      '—',
      'Make read-only',
      '—',
      'Remove connection',
    ]);
  });

  it('offers Disconnect on a connected connection, and Reconnect on a lost one', () => {
    expect(labels(menuIn('connected').entries).slice(0, 2)).toEqual(['Disconnect', 'Open overview']);
    expect(labels(menuIn('reconnecting').entries).slice(0, 3)).toEqual(['Disconnect', 'Reconnect', 'Open overview']);
    expect(labels(menuIn('failed').entries).slice(0, 3)).toEqual(['Connect', 'Reconnect', 'Open overview']);
  });

  it('offers Allow changes on a read-only connection', () => {
    expect(labels(menuIn('not-connected', true).entries)).toContain('Allow changes');
    expect(labels(menuIn('not-connected', true).entries)).not.toContain('Make read-only');
  });

  it('gives each entry the element of its place', () => {
    const menu = view({
      connections: stateWith([local]).connections,
      connection: local,
      place: 'connection-switcher',
    });
    expect(menu.element).toBe('connection.menu@connection-switcher');
    expect(menu.label).toBe('Menu of Local');
    expect(menu.entries[0]).toEqual({
      kind: 'item',
      label: 'Connect',
      feature: 'connection.connect',
      element: 'connection.connect@connection-switcher',
    });
  });
});
