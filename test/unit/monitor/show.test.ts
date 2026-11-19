import { describe, expect, it } from 'vitest';
import { commands } from '../../../src/features/monitor/commands';
import {
  defaultAuto,
  errorLineOf,
  firstSection,
  isAutoRefreshDue,
  isCommandRefused,
  isLatestReply,
  plan,
  readsOf,
  sendRequest,
  view,
} from '../../../src/features/monitor/show';
import type { Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { contextOn, local, monitorState, planOf } from './context';

const monitorShows = { kind: 'page', connection: local.id, page: 'monitor', title: 'Monitor' } as const;

function withMonitorTab(): Context {
  const state = monitorState();
  const tab = { id: tabId('t-monitor'), shows: monitorShows, lastActive: 0, loaded: true };
  return contextOn('monitor.show', local, { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } });
}

function readNames(reads: ReturnType<typeof readsOf>): readonly string[] {
  return reads.map((each) => `${each.key} ${each.read}`);
}

describe('monitor.show', () => {
  it('opening Monitor on Local opens one tab titled Monitor; opening it again makes that tab active', () => {
    expect(planOf(plan(contextOn('monitor.show'), { args: null })).steps).toEqual([
      expect.objectContaining({ kind: 'app', action: 'tab.open', args: { shows: monitorShows, background: false } }),
    ]);
    expect(planOf(plan(withMonitorTab(), { args: null })).steps).toEqual([
      expect.objectContaining({ kind: 'app', action: 'tab.activate', args: { tab: 't-monitor' } }),
    ]);
  });

  it('opens the page on Replication when asked, also when the tab is open', () => {
    expect(planOf(plan(contextOn('monitor.show'), { args: { section: 'replication' } })).steps[0]).toMatchObject({
      action: 'tab.open',
      args: { section: 'replication' },
    });
    expect(planOf(plan(withMonitorTab(), { args: 'replication' })).steps[0]).toMatchObject({
      action: 'tab.activate',
      args: { tab: 't-monitor', section: 'replication' },
    });
  });

  it('has Monitor and a command per section in Go to', () => {
    expect(commands.map((command) => [command.id, command.title])).toEqual([
      ['monitor.show', 'Monitor'],
      ['monitor.show:operations', 'Monitor: Operations'],
      ['monitor.show:slow-queries', 'Monitor: Slow queries'],
      ['monitor.show:stats', 'Monitor: Stats'],
      ['monitor.show:replication', 'Monitor: Replication'],
      ['monitor.show:sharding', 'Monitor: Sharding'],
    ]);
  });

  it('starts on Operations with Auto at 5 s, and reads the databases once when it opens', () => {
    expect(firstSection).toBe('operations');
    expect(defaultAuto).toBe(5);
    expect(readNames(readsOf('operations', 'opened', { connection: local.id }))).toEqual([
      'databases monitor.read-database-stats',
      'operations monitor.read-operations',
    ]);
    expect(readNames(readsOf('operations', 'auto', { connection: local.id }))).toEqual([
      'operations monitor.read-operations',
    ]);
  });

  it('reads every 5 seconds while the tab is active and the window visible, and never with Auto Off', () => {
    const clock = { auto: 5, lastReadAt: 1000, tabActive: true, windowVisible: true } as const;
    expect(isAutoRefreshDue(clock, 5999)).toBe(false);
    expect(isAutoRefreshDue(clock, 6000)).toBe(true);
    expect(isAutoRefreshDue({ ...clock, tabActive: false }, 60_000)).toBe(false);
    expect(isAutoRefreshDue({ ...clock, windowVisible: false }, 60_000)).toBe(false);
    expect(isAutoRefreshDue({ ...clock, auto: 0 }, 60_000)).toBe(false);
  });

  it('sends serverStatus alone at an automatic refresh of Stats, and the statistics too with Refresh', () => {
    const input = { connection: local.id, statsDatabase: 'shop' };
    expect(readNames(readsOf('stats', 'auto', input))).toEqual(['server-status monitor.read-server-status']);
    expect(readNames(readsOf('stats', 'refresh', input))).toEqual([
      'server-status monitor.read-server-status',
      'database-stats monitor.read-database-stats',
      'collection-stats monitor.read-collection-stats',
    ]);
  });

  it('reads the sharded cluster without the commands per collection at an automatic refresh', () => {
    const [auto] = readsOf('sharding', 'auto', { connection: local.id });
    const [chosen] = readsOf('sharding', 'chosen', { connection: local.id });
    expect(auto?.args).toMatchObject({ full: false });
    expect(chosen?.args).toMatchObject({ full: true });
  });

  it('drops a reply to a request older than the last one sent for the same part', () => {
    const first = sendRequest({}, 'operations');
    const second = sendRequest(first.requests, 'operations');
    expect(isLatestReply(second.requests, 'operations', first.number)).toBe(false);
    expect(isLatestReply(second.requests, 'operations', second.number)).toBe(true);
    expect(isLatestReply(second.requests, 'slow-queries', first.number)).toBe(false);
  });

  it('says This server does not allow getLog: … for the code 8000, and that a role is needed for 13', () => {
    const atlas = { message: 'CMD_NOT_ALLOWED: getLog', code: 8000 };
    expect(errorLineOf('getLog', atlas)).toBe('This server does not allow getLog: CMD_NOT_ALLOWED: getLog');
    expect(errorLineOf('getLog', { message: 'not authorized', code: 13 })).toBe(
      'getLog needs a role that allows it (clusterMonitor has it): not authorized',
    );
    expect(errorLineOf('getLog', { message: 'timed out', code: 50 })).toBe('timed out');
    expect(isCommandRefused(atlas)).toBe(true);
    expect(isCommandRefused({ message: 'timed out', code: 50 })).toBe(false);
  });

  it('shows Read-only in the status line and the sentence of the writing controls on Production', () => {
    const shown = view({
      connection: { name: 'Production', readOnly: true },
      section: 'operations',
      auto: 5,
      loading: false,
    });
    expect(shown.status).toBe('Read-only');
    expect(shown.readOnly).toBe('The connection Production is read-only.');
  });

  it('shows the section bar, Auto with Off, 2 s, 5 s and 15 s, and Refresh', () => {
    const shown = view({ connection: { name: 'Local', readOnly: false }, section: 'stats', auto: 5, loading: true });
    expect(shown.sectionBar.map((each) => [each.label, each.chosen, each.element])).toEqual([
      ['Operations', false, 'monitor.operations@section-bar'],
      ['Slow queries', false, 'monitor.slow-queries@section-bar'],
      ['Stats', true, 'monitor.stats@section-bar'],
      ['Replication', false, 'monitor.replication@section-bar'],
      ['Sharding', false, 'monitor.sharding@section-bar'],
    ]);
    expect(shown.toolbar.auto.choices.map((choice) => choice.label)).toEqual(['Off', '2 s', '5 s', '15 s']);
    expect(shown.toolbar.refresh).toBe('Refresh');
    expect(shown.status).toBeUndefined();
    expect(shown.loading).toBe(true);
  });
});
