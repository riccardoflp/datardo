import { describe, expect, it } from 'vitest';
import { view } from '../../../src/features/nav/status-line';
import type { Work } from '../../../src/shared/state/runner';
import { featureId, type WorkId } from '../../../src/shared/ids';
import { cacheLocal, input, local, ordersTab } from './inputs';

const work = (id: string, title: string, done?: number, total?: number): Work => ({
  id: id as WorkId,
  feature: featureId('transfer.export'),
  title,
  started: 0,
  ...(done === undefined ? {} : { done }),
  ...(total === undefined ? {} : { total }),
});

describe('nav.status-line', () => {
  it('with Local current, connected and answering in 4 ms, starts with Local · connected · 4 ms', () => {
    const line = view(
      input({ connections: [local], nav: { current: local.id, latency: { connection: local.id, milliseconds: 4 } } }),
    );
    expect(line.connection).toMatchObject({
      text: 'Local · connected',
      latency: '4 ms',
      element: 'nav.switch-connection@status-line',
    });
  });

  it('follows the active tab: a tab of Cache local changes the connection part at once', () => {
    const keys = { kind: 'keys', connection: cacheLocal.id, database: 0, separator: ':' } as const;
    expect(
      view(input({ connections: [local, cacheLocal], activeTab: keys, nav: { current: local.id } })).connection.text,
    ).toBe('Cache local · connected');
  });

  it('while one export runs shows its title, its progress and Cancel', () => {
    expect(view(input({ work: [work('w1', 'Export orders', 40, 100)] })).work).toMatchObject({
      kind: 'one',
      title: 'Export orders',
      progress: '40%',
      cancel: 'Cancel',
    });
  });

  it('while a download runs shows what its step says of it in place of a percentage', () => {
    const download: Work = { ...work('w1', 'Download logo.png'), detail: '1.2 MB of 4.0 MB' };
    expect(view(input({ work: [download] })).work).toMatchObject({
      kind: 'one',
      title: 'Download logo.png',
      progress: '1.2 MB of 4.0 MB',
    });
  });

  it('while three things run shows 3 running, whatever tab is active', () => {
    const three = [work('a', 'A'), work('b', 'B'), work('c', 'C')];
    expect(view(input({ work: three, connections: [cacheLocal], nav: { current: cacheLocal.id } })).work).toMatchObject(
      {
        kind: 'several',
        text: '3 running',
      },
    );
  });

  it('ends with Read-only while a read-only connection is current, and not otherwise', () => {
    const readOnly = { ...local, readOnly: true };
    expect(view(input({ connections: [readOnly], nav: { current: local.id } })).readOnly).toMatchObject({
      text: 'Read-only',
      tooltip: 'Datardo sends no writes through Local.',
    });
    expect(view(input({ connections: [local], nav: { current: local.id } })).readOnly).toBeUndefined();
  });

  it('while reconnecting starts with Local · reconnecting… and Reconnect, with no latency', () => {
    const lost = { ...local, status: { kind: 'reconnecting', reason: 'The server stopped answering.' } as const };
    const line = view(
      input({ connections: [lost], nav: { current: local.id, latency: { connection: local.id, milliseconds: 4 } } }),
    );
    expect(line.connection.text).toBe('Local · reconnecting…');
    expect(line.connection.tooltip).toBe('The server stopped answering.');
    expect(line.reconnect?.label).toBe('Reconnect');
  });

  it('when the attempts end reads Local · failed with Reconnect; connected or not connected shows no Reconnect', () => {
    const failed = { ...local, status: { kind: 'failed', reason: 'refused' } as const };
    const line = view(input({ connections: [failed], nav: { current: local.id } }));
    expect([line.connection.text, line.reconnect?.label]).toEqual(['Local · failed', 'Reconnect']);
    expect(view(input({ connections: [local], nav: { current: local.id } })).reconnect).toBeUndefined();
  });

  it('on Home with no connection current shows No connection and no count', () => {
    const line = view(input());
    expect(line.connection.text).toBe('No connection');
    expect(line.count).toBeUndefined();
  });

  it('shows the count of the page, a button on a collection tab', () => {
    const tab = { ...ordersTab, count: '2 of 1,204 documents · 38 ms' };
    expect(view(input({ connections: [local], activeTab: tab })).count).toEqual({
      text: '2 of 1,204 documents · 38 ms',
      element: 'query.count@status-line',
    });
  });

  it('shows no percentage at 100% zoom, and 125% otherwise', () => {
    expect(view(input()).zoom).toBeUndefined();
    expect(view(input({ zoom: 125 })).zoom?.text).toBe('125%');
  });
});
