import { describe, expect, it } from 'vitest';
import { heading, menu, view } from '../../../src/features/tree/pages';
import { inputOf, mongoConnection, redisConnection } from './context';

describe('tree.pages', () => {
  it('the heading reads Pages of Local, and follows a rename at once', () => {
    expect(heading(mongoConnection())).toBe('Pages of Local');
    expect(heading(mongoConnection({ name: 'Production' }))).toBe('Pages of Production');
  });

  it('a MongoDB connection lists eight pages in order; a Redis connection four', () => {
    expect(view(inputOf()).map((node) => node.name)).toEqual([
      'Overview',
      'Monitor',
      'Users and roles',
      'Index advisor',
      'Search documents',
      'Watch changes',
      'Playground',
      'Scheduled tasks',
    ]);
    expect(view(inputOf({ connections: [redisConnection()] })).map((node) => node.name)).toEqual([
      'Overview',
      'Server',
      'Console',
      'Pub/Sub',
    ]);
  });

  it('Monitor opens its page tab on the whole connection, or makes it active; Playground a new playground tab', () => {
    const nodes = view(inputOf());
    expect(nodes[1]?.click).toMatchObject({
      element: 'monitor.show@tree',
      feature: 'tab.open',
      args: { shows: { kind: 'page', connection: 'c-local', page: 'monitor', title: 'Monitor' } },
    });
    expect(nodes[6]?.click).toMatchObject({
      element: 'playground.open@tree',
      args: { shows: { kind: 'playground', title: '' } },
    });
    expect(JSON.stringify(nodes[1]?.click)).not.toContain('database');
  });

  it('the context menu of a page has Open, and Pin or Unpin', () => {
    const labels = (pinned: boolean) =>
      menu(inputOf(pinned ? { pins: [{ kind: 'page', page: 'monitor', title: 'Monitor' }] } : {}), 'monitor').map(
        (entry) => (entry.kind === 'item' ? entry.control.label : '-'),
      );
    expect(labels(false)).toEqual(['Open', 'Pin']);
    expect(labels(true)).toEqual(['Open', 'Unpin']);
  });
});
