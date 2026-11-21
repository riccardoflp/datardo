import { describe, expect, it } from 'vitest';
import { commands } from '../../../src/features/server/commands';
import { plan as slowLogPlan } from '../../../src/features/server/slow-log';
import {
  choicesOf,
  choicesRecord,
  clientIdRead,
  defaultAuto,
  initialChoices,
  firstSection,
  isAutoRefreshDue,
  isLatestReply,
  isWaiting,
  noRequests,
  plan,
  readsOf,
  replyArrived,
  sendRequest,
  view,
} from '../../../src/features/server/show';
import { partOf } from '../../../src/features/server/unavailable';
import type { Context } from '../../../src/shared/feature';
import { tabId } from '../../../src/shared/ids';
import { mongoConnection, stateWith } from '../connection/context';
import { at, cacheLocal, cacheProduction, commandsOf, contextOn, failed, planOf, serverState } from './context';
import type { ReadRequest } from '../../../src/shared/feature';

const serverShows = { kind: 'page', connection: cacheLocal.id, page: 'server', title: 'Server' } as const;

function withServerTab(): Context {
  const state = serverState();
  const tab = { id: tabId('t-server'), shows: serverShows, lastActive: 0, loaded: true };
  return contextOn('server.show', cacheLocal, { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } });
}

describe('server.show', () => {
  it('opening Server on Cache local opens one tab titled Server; opening it again makes that tab active', () => {
    const opened = planOf(plan(contextOn('server.show'), { args: null }));
    expect(opened.steps).toEqual([
      expect.objectContaining({ kind: 'app', action: 'tab.open', args: { shows: serverShows, background: false } }),
    ]);
    const again = planOf(plan(withServerTab(), { args: null }));
    expect(again.steps).toEqual([
      expect.objectContaining({ kind: 'app', action: 'tab.activate', args: { tab: 't-server' } }),
    ]);
  });

  it('Go to, Server: Slow log, opens the page on Slow log, also when the tab is open on another section', () => {
    expect(planOf(plan(contextOn('server.show'), { args: 'slow-log' })).steps[0]).toMatchObject({
      action: 'tab.open',
      args: { shows: serverShows, section: 'slow-log' },
    });
    expect(planOf(plan(withServerTab(), { args: 'slow-log' })).steps[0]).toMatchObject({
      action: 'tab.activate',
      args: { tab: 't-server', section: 'slow-log' },
    });
    expect(planOf(slowLogPlan(withServerTab(), { args: null })).steps[0]).toMatchObject({
      args: { tab: 't-server', section: 'slow-log' },
    });
  });

  it('Go to has Server and a command per section', () => {
    expect(commands.map((command) => [command.id, command.title])).toEqual(
      expect.arrayContaining([
        ['server.show', 'Server'],
        ['server.show:overview', 'Server: Overview'],
        ['server.show:slow-log', 'Server: Slow log'],
        ['server.show:configuration', 'Server: Configuration'],
      ]),
    );
  });

  it('with a MongoDB connection current, Server opens nothing', () => {
    const local = mongoConnection();
    const context = contextOn('server.show', local, stateWith([cacheLocal, local], { [local.id]: 'connected' }));
    expect(planOf(plan(context, { args: null })).steps).toEqual([]);
  });

  it('with Auto at 5 s, INFO is due every 5 seconds while the tab is active, and not while another tab is or the window is minimized', () => {
    const clock = { auto: defaultAuto, lastReadAt: at(14, 0, 0), tabActive: true, windowVisible: true };
    expect(isAutoRefreshDue(clock, at(14, 0, 4))).toBe(false);
    expect(isAutoRefreshDue(clock, at(14, 0, 5))).toBe(true);
    expect(isAutoRefreshDue({ ...clock, tabActive: false }, at(14, 0, 30))).toBe(false);
    expect(isAutoRefreshDue({ ...clock, windowVisible: false }, at(14, 0, 30))).toBe(false);
    expect(readsOf('overview', 'auto', { connection: cacheLocal.id, last: {} }).map((each) => each.read)).toEqual([
      'server.read-info',
    ]);
  });

  it('with Auto at Off, nothing is read until Refresh or a change of section', () => {
    expect(isAutoRefreshDue({ auto: 0, tabActive: true, windowVisible: true }, at(15, 0, 0))).toBe(false);
  });

  it('in Memory an automatic refresh reads MEMORY STATS alone; Refresh adds MEMORY DOCTOR; choosing it, the databases too', () => {
    const input = { connection: cacheLocal.id, last: {} };
    expect(readsOf('memory', 'auto', input)).toEqual([
      { key: 'memory', read: 'server.read-memory', args: { connection: cacheLocal.id, doctor: false } },
    ]);
    expect(readsOf('memory', 'refresh', input)).toEqual([
      { key: 'memory', read: 'server.read-memory', args: { connection: cacheLocal.id, doctor: true } },
    ]);
    expect(readsOf('memory', 'chosen', input).map((each) => [each.key, each.read])).toEqual([
      ['memory', 'server.read-memory'],
      ['keyspace', 'server.read-info'],
    ]);
    expect(JSON.stringify(readsOf('memory', 'auto', input))).not.toContain('largest-keys');
  });

  it('the slow log reads its threshold only when chosen and with Refresh; the clients carry the page’s own id', () => {
    const input = { connection: cacheLocal.id, own: '149', last: {} };
    expect(readsOf('slow-log', 'auto', input)[0]?.args).toEqual({ connection: cacheLocal.id, part: 'entries' });
    expect(readsOf('slow-log', 'refresh', input)[0]?.args).toEqual({
      connection: cacheLocal.id,
      part: 'entries-and-threshold',
    });
    expect(readsOf('clients', 'auto', input)[0]?.args).toEqual({ connection: cacheLocal.id, own: '149' });
    expect(readsOf('replication', 'auto', input)[0]?.args).toEqual({ connection: cacheLocal.id, part: 'replication' });
  });

  it('in Configuration an automatic refresh sends nothing', () => {
    expect(readsOf('configuration', 'auto', { connection: cacheLocal.id, last: {} })).toEqual([]);
  });

  it('a reply to a request older than the last one sent for the same part does not change what is shown', () => {
    const first = sendRequest(noRequests, 'info');
    expect(isWaiting(first.requests, 'info')).toBe(true);
    const second = sendRequest(first.requests, 'info');
    expect(isLatestReply(second.requests, 'info', first.number)).toBe(false);
    expect(isLatestReply(second.requests, 'info', second.number)).toBe(true);
    const stale = replyArrived(second.requests, 'info', first.number);
    expect(isWaiting(stale, 'info')).toBe(true);
    expect(isWaiting(replyArrived(stale, 'info', second.number), 'info')).toBe(false);
  });

  it('a server that refuses CONFIG is not asked again by the automatic refresh; the other parts are', () => {
    const last = {
      'slow-log': partOf('SLOWLOG GET', [], () => null),
      config: partOf('CONFIG GET', failed('ERR unknown command'), () => null),
    };
    expect(readsOf('slow-log', 'auto', { connection: cacheLocal.id, last }).map((each) => each.key)).toEqual([
      'slow-log',
    ]);
  });

  it('shows the section bar, Auto at 5 s with Off, 2 s, 5 s and 15 s, Refresh and the time of the last read', () => {
    const shown = view({ connection: cacheLocal, section: firstSection, auto: defaultAuto, lastReadAt: at(14, 2, 11) });
    expect(shown.title).toBe('Server');
    expect(shown.sectionBar.map((each) => [each.label, each.chosen, each.element])).toEqual([
      ['Overview', true, 'server.overview@section-bar'],
      ['Clients', false, 'server.clients@section-bar'],
      ['Slow log', false, 'server.slow-log@section-bar'],
      ['Memory', false, 'server.memory@section-bar'],
      ['Replication', false, 'server.replication@section-bar'],
      ['Configuration', false, 'server.config@section-bar'],
    ]);
    expect(shown.toolbar.auto).toEqual({
      label: 'Auto',
      value: 5,
      choices: [
        { value: 0, label: 'Off' },
        { value: 2, label: '2 s' },
        { value: 5, label: '5 s' },
        { value: 15, label: '15 s' },
      ],
    });
    expect(shown.toolbar.refresh).toBe('Refresh');
    expect(shown.toolbar.lastRead).toBe('14:02:11');
    expect(shown.readOnly).toBeUndefined();
  });

  it('on Cache production the page says The connection Cache production is read-only.', () => {
    expect(view({ connection: cacheProduction, section: 'clients', auto: 5 }).readOnly).toBe(
      'The connection Cache production is read-only.',
    );
  });

  it('after a restart the restored tab shows the section, Auto and the filters it had: they travel with tab.activate', () => {
    const choices = choicesRecord({
      ...initialChoices,
      auto: 2,
      clientsFilter: 'blpop',
      slowerThan: '100',
      clientsSort: { column: 'memory', direction: 'descending' },
    });
    const kept = planOf(plan(withServerTab(), { args: { choices } }));
    expect(kept.steps).toEqual([
      expect.objectContaining({ action: 'tab.activate', args: { tab: 't-server', memory: { choices } } }),
    ]);
    const restored = choicesOf(choices);
    expect(restored).toMatchObject({ auto: 2, clientsFilter: 'blpop', slowerThan: '100' });
    expect(restored.clientsSort).toEqual({ column: 'memory', direction: 'descending' });
    const section = planOf(plan(withServerTab(), { args: { section: 'memory' } }));
    expect(section.steps).toEqual([
      expect.objectContaining({ action: 'tab.activate', args: { tab: 't-server', section: 'memory' } }),
    ]);
  });

  it('choices kept that are missing or not valid start as a page never shown: Auto at 5 s, the clients by ID', () => {
    expect(choicesOf(undefined)).toEqual(initialChoices);
    expect(choicesOf({ auto: '7', clientsSort: 'nothing up', slowLogOrder: 'other', configFilter: 3 })).toEqual(
      initialChoices,
    );
  });

  it('CLIENT ID is read once on the ordinary client and gives the id of the page’s own client', () => {
    const request = clientIdRead.request(contextOn('server.show'), { connection: cacheLocal.id });
    expect(commandsOf(request as ReadRequest)).toEqual(['CLIENT ID']);
    expect(clientIdRead.parse([42], null)).toBe('42');
    expect(clientIdRead.parse([failed('NOPERM no CLIENT')], null)).toBeNull();
  });
});
