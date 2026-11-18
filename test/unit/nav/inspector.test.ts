import { describe, expect, it } from 'vitest';
import { loadingSignDelayMs, view } from '../../../src/features/nav/inspector';
import { isOffered } from '../../../src/features/nav/toggle-inspector';
import { input, local, ordersTab } from './inputs';

const connections = [local];

describe('nav.inspector', () => {
  it('on a collection tab with no row selected reads Nothing selected and Select a document to see it here.', () => {
    expect(view(input({ connections, activeTab: ordersTab }))).toMatchObject({
      kind: 'shown',
      hide: { label: 'Hide inspector' },
      body: { kind: 'nothing-selected', heading: 'Nothing selected', line: 'Select a document to see it here.' },
    });
  });

  it('shows what the active tab has selected', () => {
    const one = { ...ordersTab, inspection: { selected: 1, title: 'orders · 65f1…a2c', emptyLine: '' } };
    expect(view(input({ connections, activeTab: one }))).toMatchObject({
      title: 'orders · 65f1…a2c',
      body: { kind: 'selected' },
    });
  });

  it('selecting three rows reads 3 selected', () => {
    const three = { ...ordersTab, inspection: { selected: 3, emptyLine: 'Select a document to see it here.' } };
    expect(view(input({ connections, activeTab: three }))).toMatchObject({
      body: { kind: 'several', heading: '3 selected' },
    });
  });

  it('on Home is not shown, and neither Show inspector nor Hide inspector is offered', () => {
    expect(view(input())).toEqual({ kind: 'not-shown', why: 'nothing-to-inspect' });
    expect(isOffered(input())).toBe(false);
  });

  it('hidden by the user stays hidden on every tab with something to inspect', () => {
    const keys = {
      kind: 'keys',
      connection: local.id,
      database: 0,
      separator: ':',
      inspection: { selected: 1, emptyLine: '' },
    } as const;
    expect(view(input({ activeTab: ordersTab, nav: { inspectorHidden: true } }))).toEqual({
      kind: 'not-shown',
      why: 'hidden-by-user',
    });
    expect(view(input({ activeTab: keys, nav: { inspectorHidden: true } }))).toEqual({
      kind: 'not-shown',
      why: 'hidden-by-user',
    });
  });

  it('shows the sign that turns only after 200 ms of loading', () => {
    const loading = { ...ordersTab, inspection: { selected: 1, emptyLine: '', loadingSince: 0 } };
    expect(view(input({ activeTab: loading }))).toMatchObject({
      body: { kind: 'loading', delayMs: loadingSignDelayMs },
    });
    expect(loadingSignDelayMs).toBe(200);
  });

  it('shows the message of a read that failed, with Retry', () => {
    const failed = { ...ordersTab, inspection: { selected: 1, emptyLine: '', error: 'The server stopped answering.' } };
    expect(view(input({ activeTab: failed }))).toMatchObject({ body: { kind: 'error', retry: 'Retry' } });
  });
});
