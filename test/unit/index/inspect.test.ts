import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/index/inspect';
import type { IndexInfo } from '../../../src/features/index/types';
import { mongoshValue } from '../../../src/shared/mongosh-value';
import { recordedIndex } from './harness';

const status: IndexInfo = {
  name: 'status_1',
  key: { status: 1 },
  options: { v: 2 },
  building: false,
  uses: 800,
  members: [
    { shard: 'shard01', host: 'db1.example.com:27018', uses: 300, since: Date.parse('2026-03-01T00:00:00Z') },
    { shard: 'shard02', host: 'db2.example.com:27018', uses: 500, since: Date.parse('2026-03-05T00:00:00Z') },
  ],
};

describe('index.inspect', () => {
  it('shows email_1 as a tree and the command that creates it', () => {
    const shown = view({
      collection: 'users',
      readOnly: false,
      selected: { kind: 'index', index: recordedIndex('email_1') },
    });
    expect(shown.kind === 'index' ? mongoshValue(shown.definition) : '').toBe(
      '{ name: "email_1", key: { email: 1 }, v: 2, unique: true }',
    );
    expect(shown.kind === 'index' ? shown.command : '').toBe(
      'db.getCollection("users").createIndex({ email: 1 }, { unique: true })',
    );
  });

  it('gives Copy exactly that command', () => {
    const shown = view({
      collection: 'users',
      readOnly: false,
      selected: { kind: 'index', index: recordedIndex('email_1') },
    });
    expect(shown.kind === 'index' ? shown.command : '').toBe(
      'db.getCollection("users").createIndex({ email: 1 }, { unique: true })',
    );
  });

  it('lists the uses of two shards by member, and none for one member', () => {
    const shown = view({ collection: 'orders', readOnly: false, selected: { kind: 'index', index: status } });
    expect(shown.kind === 'index' ? shown.members : []).toEqual([
      'shard01 · db1.example.com:27018: 300 uses since 2026-03-01 00:00 UTC',
      'shard02 · db2.example.com:27018: 500 uses since 2026-03-05 00:00 UTC',
    ]);
    const single = view({
      collection: 'orders',
      readOnly: false,
      selected: { kind: 'index', index: recordedIndex('email_1') },
    });
    expect(single.kind === 'index' ? single.members : undefined).toEqual([]);
  });

  it('shows a search index on two hosts with two lines under Status by host', () => {
    const shown = view({
      collection: 'movies',
      readOnly: false,
      selected: {
        kind: 'search',
        index: {
          name: 'titles',
          type: 'search',
          status: 'READY',
          queryable: true,
          definition: { mappings: { dynamic: true } },
          hosts: [
            { host: 'mongot1:27028', status: 'READY', queryable: true, staged: 'BUILDING', message: 'catching up' },
            { host: 'mongot2:27028' },
          ],
        },
      },
    });
    expect(shown.kind === 'search' ? shown.hosts : []).toEqual([
      'mongot1:27028: READY · queryable · new definition BUILDING — catching up',
      'mongot2:27028: unknown status',
    ]);
    expect(shown.kind === 'search' ? shown.actions.map((action) => action.element) : []).toEqual([
      'index.edit-search@inspector',
      'index.drop-search@inspector',
    ]);
  });

  it('shows everything and no action on a read-only connection', () => {
    const shown = view({
      collection: 'users',
      readOnly: true,
      selected: { kind: 'index', index: recordedIndex('email_1') },
    });
    expect(shown.kind === 'index' ? shown.actions : undefined).toEqual([]);
    expect(shown.kind === 'index' ? shown.badges.map((badge) => badge.label) : []).toEqual(['unique']);
    const writable = view({
      collection: 'users',
      readOnly: false,
      selected: { kind: 'index', index: recordedIndex('email_1') },
    });
    expect(writable.kind === 'index' ? writable.actions.map((action) => action.element) : []).toEqual([
      'index.edit@inspector',
      'index.duplicate@inspector',
      'index.hide@inspector',
      'index.drop@inspector',
    ]);
    expect(view({ collection: 'users', readOnly: false })).toEqual({
      kind: 'empty',
      text: 'Select an index to see its definition.',
    });
  });
});
