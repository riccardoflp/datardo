import { describe, expect, it } from 'vitest';
import { isOffered } from '../../../src/features/monitor/commands';
import { openedQueryText } from '../../../src/features/monitor/open-slow-query';
import {
  initialMonitorChoices,
  monitorChoicesAsked,
  monitorChoicesOf,
  monitorChoicesRecord,
} from '../../../src/features/monitor/parts/choices';
import { builtSections, plan, readsOf } from '../../../src/features/monitor/show';
import { allTools } from '../../../src/features/mcp';
import { contextOn, local, monitorState, planOf } from './context';

const monitorShows = { kind: 'page', connection: local.id, page: 'monitor', title: 'Monitor' } as const;

describe('monitor.show', () => {
  it('keeps Auto, the filters, the choices of the toolbars and the sort with the tab, and restores them', () => {
    const choices = {
      ...initialMonitorChoices(),
      auto: 15 as const,
      operationsFilter: 'orders',
      runningAtLeast: 5,
      idle: true,
      source: 'log' as const,
      since: 1440 as const,
      grouping: 'all' as const,
      slowFilter: '{ status: ? }',
      sort: { column: 'average' as const, descending: false },
    };
    const kept = monitorChoicesRecord(choices);
    expect(kept).toMatchObject({ auto: '15', idle: 'true', sort: 'average ascending', database: '' });
    expect(monitorChoicesOf(kept)).toEqual(choices);
    expect(planOf(plan(contextOn('monitor.show'), { args: { choices: kept } })).steps).toEqual([
      expect.objectContaining({
        action: 'tab.open',
        args: { shows: monitorShows, background: false, memory: { choices: kept } },
      }),
    ]);
  });

  it('keeps the database, the sorts, the oplog filter and the events filter of Stats, Replication and Sharding', () => {
    const choices = {
      ...initialMonitorChoices(),
      statsDatabase: 'shop',
      databaseSort: { column: 'storage' as const, descending: true },
      collectionSort: { column: 'name' as const, descending: false },
      oplogText: 'shop.orders',
      oplogOperation: 'update' as const,
      oplogLast: 200 as const,
      shardedFilter: 'customerId',
      shardedSort: { column: 'chunks' as const, descending: true },
      eventsText: 'moveChunk',
      eventsScope: 'every' as const,
    };
    const kept = monitorChoicesRecord(choices);
    expect(kept).toMatchObject({ databaseSort: 'storage descending', oplogLast: '200', eventsScope: 'every' });
    expect(monitorChoicesOf(kept)).toEqual(choices);
    expect(monitorChoicesOf({ ...kept, oplogLast: '7', eventsScope: 'some', shardedSort: 'nothing up' })).toEqual({
      ...choices,
      oplogLast: 50,
      eventsScope: 'balancer',
      shardedSort: undefined,
    });
  });

  it('starts a tab that kept nothing, or something not valid, with Auto at 5 s, the profiler, the last hour, by query', () => {
    expect(monitorChoicesOf(undefined)).toEqual(initialMonitorChoices());
    expect(monitorChoicesOf({ auto: '7', since: 'soon', runningAtLeast: '-3', sort: 'nothing up' })).toEqual(
      initialMonitorChoices(),
    );
    expect(monitorChoicesAsked({ section: 'operations' })).toBeUndefined();
  });

  it('reads currentOp with $all when Idle connections is on', () => {
    expect(readsOf('operations', 'refresh', { connection: local.id, operations: { idle: true } })).toEqual([
      expect.objectContaining({ key: 'operations', args: { idle: true, connection: local.id } }),
    ]);
  });

  it('offers Monitor and its five sections on a connection, and nothing without one', () => {
    const state = monitorState();
    expect(builtSections).toEqual(['operations', 'slow-queries', 'stats', 'replication', 'sharding']);
    expect(
      [
        'monitor.show',
        'monitor.show:operations',
        'monitor.show:slow-queries',
        'monitor.show:stats',
        'monitor.show:replication',
        'monitor.show:sharding',
      ].map((id) => isOffered(state, id)),
    ).toEqual([true, true, true, true, true, true]);
    expect(isOffered({ ...state, nav: { ...state.nav, current: undefined } }, 'monitor.show')).toBe(false);
  });
});

describe('monitor.open-slow-query', () => {
  it('gives the collection tab the filter, the sort and the projection as one-line texts in mongosh syntax', () => {
    const opened = openedQueryText({
      filter: { status: 'paid' },
      sort: { createdAt: { $numberInt: '-1' } },
      projection: { total: 1 },
    });
    expect(opened).toEqual({
      kind: 'find',
      filter: '{ status: "paid" }',
      sort: '{ createdAt: -1 }',
      projection: '{ total: 1 }',
    });
  });

  it('gives the pipeline editor one enabled stage per stage of the pipeline', () => {
    const opened = openedQueryText({
      pipeline: [{ $match: { status: 'paid' } }, { $limit: 5 }],
    }) as { kind: string; stages: { name: string; enabled: boolean }[] };
    expect(opened.kind).toBe('pipeline');
    expect(opened.stages.map((stage) => [stage.name, stage.enabled])).toEqual([
      ['$match', true],
      ['$limit', true],
    ]);
  });
});

describe('monitor.set-profiler', () => {
  it('the MCP server has no tool that changes the profiler', () => {
    const names = allTools.map((tool) => tool.name);
    expect(names.filter((name) => /profil|slowms|threshold/u.test(name))).toEqual([]);
  });
});
