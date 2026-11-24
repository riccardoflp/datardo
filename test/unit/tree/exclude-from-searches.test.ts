import { describe, expect, it } from 'vitest';
import { exclusionTitle, isOffered } from '../../../src/features/tree/commands';
import { plan } from '../../../src/features/tree/exclude-from-searches';
import { view as menuView } from '../../../src/features/tree/menu-mongodb';
import { view as redisMenu } from '../../../src/features/tree/menu-redis';
import type { NodeRef } from '../../../src/features/tree/types';
import type { ConnectionView } from '../../../src/shared/connection';
import type { Json } from '../../../src/shared/engine-request';
import type { AppStep, Outcome, Plan } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import type { TabShows } from '../../../src/shared/state/tabs';
import { contextOf, inputOf, mongoConnection, redisConnection, stateOf } from './context';

function planOf(outcome: Outcome): Plan {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}`);
  }
  return outcome.plan;
}

function stepsOf(connection: ConnectionView, args: Json, state: AppState = stateOf({ connections: [connection] })) {
  return planOf(plan(contextOf('tree.exclude-from-searches', state), { args })).steps as readonly AppStep[];
}

function labels(connection: ConnectionView, node: NodeRef): readonly string[] {
  return menuView(inputOf({ connections: [connection] }), node).flatMap((entry) =>
    entry.kind === 'item' ? [entry.control.label] : [],
  );
}

function argsOf(connection: ConnectionView, node: NodeRef, label: string): Json | undefined {
  const found = menuView(inputOf({ connections: [connection] }), node).find(
    (entry) => entry.kind === 'item' && entry.control.label === label,
  );
  return found?.kind === 'item' && found.control.kind === 'start' ? found.control.args : undefined;
}

const local = mongoConnection();
const logs: NodeRef = {
  kind: 'collection',
  database: 'shop',
  name: 'logs',
  collectionKind: 'collection',
  system: false,
};
const old: NodeRef = {
  kind: 'collection',
  database: 'archive',
  name: 'old',
  collectionKind: 'collection',
  system: false,
};
const archive: NodeRef = { kind: 'database', database: 'archive' };

function withTab(connection: ConnectionView, shows: TabShows): AppState {
  const state = stateOf({ connections: [connection] });
  const id = tabId('t-1');
  return { ...state, tabs: { ...state.tabs, tabs: [{ id, shows, loaded: true, lastActive: 0 }], active: id } };
}

describe('tree.exclude-from-searches', () => {
  it('Exclude from searches on shop.logs writes exclusions ["shop.logs"]; once excluded it offers Include in searches alone', () => {
    const args = argsOf(local, logs, 'Exclude from searches');
    expect(args).toEqual({
      connection: local.id,
      action: 'exclude',
      nodes: [{ database: 'shop', collection: 'logs' }],
    });
    const [step] = stepsOf(local, args ?? null);
    expect(step).toEqual({
      kind: 'app',
      action: 'tree.exclude-from-searches',
      args: { connection: local.id, keys: ['shop.logs'], excluded: true },
      text: 'exclude from searches on Local: the collection shop.logs',
    });
    const excluded = mongoConnection({ exclusions: ['shop.logs'] });
    expect(labels(excluded, logs)).toContain('Include in searches');
    expect(labels(excluded, logs)).not.toContain('Exclude from searches');
  });

  it('with shop.logs and archive selected, writes ["archive", "shop.logs"] in one step, databases first', () => {
    const steps = stepsOf(local, {
      connection: local.id,
      action: 'exclude',
      nodes: [{ database: 'shop', collection: 'logs' }, { database: 'archive' }, { database: 'media', bucket: 'fs' }],
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.args).toEqual({
      connection: local.id,
      keys: ['archive', 'shop.logs', 'media.fs.files'],
      excluded: true,
    });
    expect(steps[0]?.text).toBe(
      'exclude from searches on Local: the database archive, the collection shop.logs, the GridFS bucket media.fs',
    );
  });

  it('offers Exclude from searches on a collection of an excluded database, and including archive leaves archive.old', () => {
    const excluded = mongoConnection({ exclusions: ['archive'] });
    expect(labels(excluded, old)).toContain('Exclude from searches');
    const [step] = stepsOf(excluded, argsOf(excluded, old, 'Exclude from searches') ?? null);
    expect(step?.args).toEqual({ connection: local.id, keys: ['archive.old'], excluded: true });
    const both = mongoConnection({ exclusions: ['archive', 'archive.old'] });
    const [include] = stepsOf(both, argsOf(both, archive, 'Include in searches') ?? null);
    expect(include?.args).toEqual({ connection: local.id, keys: ['archive'], excluded: false });
  });

  it('writes media.fs.files for the bucket fs of media', () => {
    const bucket: NodeRef = { kind: 'bucket', database: 'media', name: 'fs' };
    const [step] = stepsOf(local, argsOf(local, bucket, 'Exclude from searches') ?? null);
    expect(step?.args).toEqual({ connection: local.id, keys: ['media.fs.files'], excluded: true });
  });

  it('with archive excluded and crm not, both selected, offers both entries, each on the node it changes', () => {
    const excluded = mongoConnection({ exclusions: ['archive'] });
    const nodes = [{ database: 'archive' }, { database: 'crm' }];
    const [exclude] = stepsOf(excluded, { connection: local.id, action: 'exclude', nodes });
    expect(exclude?.args).toEqual({ connection: local.id, keys: ['crm'], excluded: true });
    const [include] = stepsOf(excluded, { connection: local.id, action: 'include', nodes });
    expect(include?.args).toEqual({ connection: local.id, keys: ['archive'], excluded: false });
    expect(include?.text).toBe('include in searches on Local: the database archive');
  });

  it('removes the last key with Include in searches, and does nothing when nothing changes', () => {
    const excluded = mongoConnection({ exclusions: ['shop.logs'] });
    const [step] = stepsOf(excluded, argsOf(excluded, logs, 'Include in searches') ?? null);
    expect(step?.args).toEqual({ connection: local.id, keys: ['shop.logs'], excluded: false });
    expect(
      stepsOf(local, { connection: local.id, action: 'include', nodes: [{ database: 'shop', collection: 'logs' }] }),
    ).toEqual([]);
  });

  it('writes excluded: true on Cache local from the menu of the connection, and removes it', () => {
    const cache = redisConnection();
    const [step] = stepsOf(cache, { connection: cache.id, action: 'exclude', scope: 'connection' });
    expect(step).toEqual({
      kind: 'app',
      action: 'tree.exclude-from-searches',
      args: { connection: cache.id, excluded: true },
      text: 'exclude the connection Cache local from searches',
    });
    const excluded = redisConnection({ excluded: true });
    const [include] = stepsOf(excluded, { connection: cache.id, action: 'include', scope: 'connection' });
    expect(include?.text).toBe('include the connection Cache local in searches');
  });

  it('names a view the view, and has no danger and an undo that says how to put it back', () => {
    const view: NodeRef = {
      kind: 'collection',
      database: 'shop',
      name: 'recent',
      collectionKind: 'view',
      system: false,
    };
    const args = argsOf(local, view, 'Exclude from searches') ?? null;
    const outcome = planOf(plan(contextOf('tree.exclude-from-searches', stateOf({ connections: [local] })), { args }));
    expect((outcome.steps[0] as AppStep).text).toBe('exclude from searches on Local: the view shop.recent');
    expect(outcome.title).toBe('Exclude from searches');
    expect(outcome.undo).toEqual({ cannot: 'Include in searches puts it back.' });
  });

  it('gives a Redis database and a namespace neither entry', () => {
    const cache = redisConnection();
    const input = inputOf({ connections: [cache] });
    const entries = [
      ...redisMenu(input, { kind: 'redis-database', database: 0 }),
      ...redisMenu(input, {
        kind: 'namespace',
        database: 0,
        prefix: 'orders:',
        prefixHex: '6f72646572733a',
        pattern: 'orders:*',
      }),
    ].flatMap((entry) => (entry.kind === 'item' ? [entry.control.label] : []));
    expect(entries).not.toContain('Exclude from searches');
    expect(entries).not.toContain('Include in searches');
  });

  it('offers the entries on a read-only connection, and its step writes nothing to the server', () => {
    const readOnly = mongoConnection({ readOnly: true });
    expect(labels(readOnly, logs)).toContain('Exclude from searches');
    const steps = stepsOf(readOnly, argsOf(readOnly, logs, 'Exclude from searches') ?? null);
    expect(steps.map((step) => step.kind)).toEqual(['app']);
  });

  it('from Go to, excludes the collection of the active tab, or includes it when it is excluded', () => {
    const shows = { kind: 'collection', connection: local.id, database: 'shop', collection: 'logs' } as const;
    const state = withTab(local, shows);
    expect(isOffered(state, 'tree.exclude-from-searches')).toBe(true);
    expect(exclusionTitle(state)).toBe('Exclude from searches');
    expect(stepsOf(local, null, state)[0]?.args).toEqual({ connection: local.id, keys: ['shop.logs'], excluded: true });
    const excluded = mongoConnection({ exclusions: ['shop.logs'] });
    const excludedState = withTab(excluded, shows);
    expect(exclusionTitle(excludedState)).toBe('Include in searches');
    expect(stepsOf(excluded, null, excludedState)[0]?.args).toMatchObject({ excluded: false });
    expect(isOffered(stateOf({ connections: [local] }), 'tree.exclude-from-searches')).toBe(false);
  });
});

describe('tree.menu-mongodb', () => {
  it('offers Include in searches on a node with an entry of its own, Exclude from searches on a collection of an excluded database, also read-only', () => {
    const excluded = mongoConnection({ exclusions: ['archive'], readOnly: true });
    expect(labels(excluded, archive)).toContain('Include in searches');
    expect(labels(excluded, archive)).not.toContain('Exclude from searches');
    expect(labels(excluded, old)).toContain('Exclude from searches');
    expect(labels(excluded, old)).not.toContain('Include in searches');
  });
});
