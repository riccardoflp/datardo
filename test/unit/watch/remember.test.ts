import { describe, expect, it } from 'vitest';
import { memoryChange, plan as remember } from '../../../src/features/watch/page/remember';
import { reduceWatchPages } from '../../../src/features/watch/page/state';
import { readMemory } from '../../../src/features/tab/types';
import { onPage, orders, pageOf, tab } from './page';

describe('watch.visible-events', () => {
  it('remembers the types hidden and the search, keeping only what the arguments change', () => {
    expect(memoryChange({ hiddenTypes: ['delete', 'drop', 'nonsense'] })).toEqual({ hiddenTypes: ['delete', 'other'] });
    expect(memoryChange({ search: 'paid' })).toEqual({ search: 'paid' });
    expect(memoryChange({ filter: '{ "operationType": "insert" }', fullDocument: false })).toEqual({
      filter: '{ "operationType": "insert" }',
      fullDocument: false,
    });
    expect(memoryChange({ search: 3, other: true })).toEqual({});
  });

  it('changes the page with an app step, writing nothing to the deployment', () => {
    const outcome = remember(onPage('watch.visible-events:remember', pageOf()), { args: { search: 'paid' } });
    expect(outcome.kind).toBe('run');
    if (outcome.kind !== 'run') {
      return;
    }
    expect(outcome.plan.steps).toHaveLength(1);
    expect(outcome.plan.steps[0]).toMatchObject({
      kind: 'app',
      action: 'watch.remember',
      args: { tab, search: 'paid' },
    });
    const empty = remember(onPage('watch.visible-events:remember', pageOf()), { args: {} });
    expect(empty.kind === 'run' ? empty.plan.steps : undefined).toEqual([]);
  });

  it('keeps what the page remembers in the tab, across a restart', () => {
    const memory = { filter: '{}', fullDocument: false, hiddenTypes: ['update', 'bogus'], search: 'x' };
    expect(readMemory({ watch: memory })).toEqual({
      watch: { filter: '{}', fullDocument: false, hiddenTypes: ['update'], search: 'x' },
    });
    expect(readMemory({ watch: { filter: 3 } })).toBeUndefined();
  });

  it('applies what was remembered to the page', () => {
    const opened = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
    const pages = reduceWatchPages(opened, { kind: 'remembered', tab, memory: { search: 'paid' } });
    expect(pages[tab]?.search).toBe('paid');
  });
});

describe('watch.show', () => {
  it('keeps the version of the server the page was opened on', () => {
    const opened = reduceWatchPages({}, { kind: 'opened', tab, watched: orders });
    const pages = reduceWatchPages(opened, { kind: 'server-version', tab, version: '8.2.1' });
    expect(pages[tab]?.serverVersion).toBe('8.2.1');
  });
});
