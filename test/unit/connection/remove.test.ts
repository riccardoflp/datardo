import { describe, expect, it } from 'vitest';
import { plan } from '../../../src/features/connection/remove';
import { connectionId, tabId } from '../../../src/shared/ids';
import type { UndoEntry } from '../../../src/shared/state/undo';
import { contextOf, mongoConnection, on, redisConnection, stateWith } from './context';

const local = mongoConnection();

/** An operation of the undo history on Local. */
function operationOn(id: string): UndoEntry {
  return {
    id: id as UndoEntry['id'],
    time: 0,
    connection: local.id,
    connectionName: 'Local',
    title: 'Update 1 document',
    inserted: 0,
    updated: 1,
    deleted: 0,
    size: 10,
    engine: 'mongodb',
    database: 'shop',
    collection: 'orders',
  };
}

describe('connection.remove', () => {
  it('confirms, then disconnects, deletes the secrets and removes the connection', () => {
    const outcome = plan(
      contextOf('connection.remove', stateWith([local], { [local.id]: 'connected' }), on(local)),
      {},
    );
    expect(outcome).toMatchObject({
      kind: 'run',
      plan: {
        title: 'Remove connection "Local"?',
        danger: {
          kind: 'confirm',
          button: 'Remove',
          text: [
            'Deleted with it:',
            'its connection string and passwords',
            'This cannot be undone. The files of its queries folder, its backups, its exports and its scheduled tasks are kept.',
          ].join('\n'),
        },
        undo: { cannot: 'The secrets and Datardo’s data of the connection are deleted.' },
      },
    });
    if (outcome.kind === 'run') {
      expect(outcome.plan.steps.map((step) => step.text)).toEqual([
        'disconnect Local',
        'delete the secrets of Local',
        'remove the connection Local',
      ]);
    }
  });

  it('lists what the other areas keep of it, only when there is some', () => {
    const state = stateWith([local]);
    const kept = { ...state, undo: { ...state.undo, entries: ['a', 'b', 'c'].map(operationOn) } };
    const outcome = plan(contextOf('connection.remove', kept, on(local)), {
      counts: { savedQueries: 12, pins: 0, remembers: true },
    });
    expect(outcome.kind === 'run' && outcome.plan.danger.kind === 'confirm' ? outcome.plan.danger.text : '').toBe(
      [
        'Deleted with it:',
        'its connection string and passwords',
        '12 queries saved for me',
        '3 operations of the undo history',
        'what Datardo remembers of it (recent queries, the layout of the columns, the history of the console)',
        'This cannot be undone. The files of its queries folder, its backups, its exports and its scheduled tasks are kept.',
      ].join('\n'),
    );
    expect(outcome.kind === 'run' ? outcome.plan.steps.map((step) => step.text) : []).toEqual([
      'delete the secrets of Local',
      'delete the 3 operations of Local from the undo history',
      'delete the 12 queries saved for me on Local',
      'delete what Datardo remembers of Local',
      'remove the connection Local',
    ]);
  });

  it('unlinks the MongoDB connections that publish through a Redis connection it removes', () => {
    const cache = redisConnection();
    const staging = mongoConnection({ id: connectionId('c-staging'), name: 'Staging', publishesTo: cache.id });
    const linked = mongoConnection({ publishesTo: cache.id });
    const outcome = plan(contextOf('connection.remove', stateWith([linked, staging, cache]), on(cache)), {});
    if (outcome.kind !== 'run' || outcome.plan.danger.kind !== 'confirm') {
      throw new Error('no confirmation');
    }
    expect(outcome.plan.danger.text.split('\n').at(-1)).toBe(
      'Local, Staging will no longer publish their writes for redis-oplog.',
    );
    expect(outcome.plan.steps.map((step) => step.text)).toEqual([
      'delete the secrets of Cache local',
      'unlink Local from Cache local',
      'unlink Staging from Cache local',
      'remove the connection Cache local',
    ]);
  });

  it('keeps the linked Redis connection of a MongoDB connection it removes', () => {
    const cache = redisConnection();
    const linked = mongoConnection({ publishesTo: cache.id });
    const outcome = plan(contextOf('connection.remove', stateWith([linked, cache]), on(linked)), {});
    expect(outcome.kind === 'run' ? outcome.plan.steps.map((step) => step.text) : []).toEqual([
      'delete the secrets of Local',
      'remove the connection Local',
    ]);
  });

  it('counts the pins of the connection and forgets them', () => {
    const state = stateWith([local]);
    const pinned = {
      ...state,
      nav: {
        ...state.nav,
        pins: { [local.id]: [{ kind: 'collection' as const, database: 'shop', collection: 'orders' }] },
      },
    };
    const outcome = plan(contextOf('connection.remove', pinned, on(local)), {});
    expect(outcome.kind === 'run' && outcome.plan.danger.kind === 'confirm' ? outcome.plan.danger.text : '').toContain(
      '1 pins',
    );
    expect(
      outcome.kind === 'run' ? outcome.plan.steps.map((step) => step.kind === 'app' && step.action) : [],
    ).toContain('nav.forget-pins');
  });

  it('asks about each tab with unsaved changes in the confirmation, then saves those it was told to', () => {
    const state = stateWith([local]);
    const tab = {
      id: tabId('t7'),
      shows: { kind: 'collection' as const, connection: local.id, database: 'shop', collection: 'orders' },
      lastActive: 0,
      loaded: true,
      unsaved: true,
    };
    const withTab = { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } };
    const asked = plan(contextOf('connection.remove', withTab, on(local)), {});
    expect(asked).toMatchObject({
      kind: 'ask',
      question: {
        title: 'Remove connection "Local"?',
        button: 'Remove',
        fields: [{ kind: 'pick-one', key: `changes:${tab.id}`, default: 'save' }],
      },
    });
    const removed = plan(contextOf('connection.remove', withTab, on(local)), { [`changes:${tab.id}`]: 'save' });
    expect(removed.kind === 'run' ? removed.plan.danger : undefined).toEqual({ kind: 'none' });
    expect(removed.kind === 'run' ? removed.plan.steps.map((step) => step.kind === 'app' && step.action) : []).toEqual([
      'tab.save',
      'secrets.delete',
      'connection.delete',
    ]);
  });
});
