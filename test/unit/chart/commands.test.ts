import { describe, expect, it } from 'vitest';
import { commands as chartCommands, isOffered as isChartOffered } from '../../../src/features/chart/commands';
import { commands as codeCommands, isOffered as isCodeOffered } from '../../../src/features/codegen/commands';
import { connectionId, tabId } from '../../../src/shared/ids';
import { initialState, type AppState } from '../../../src/shared/state';

function stateWith(section?: string, kind: 'collection' | 'connection' = 'collection'): AppState {
  const shows =
    kind === 'collection'
      ? { kind, connection: connectionId('c-local'), database: 'shop', collection: 'orders' }
      : { kind, connection: connectionId('c-local') };
  const tab = { id: tabId('t1'), shows, lastActive: 0, loaded: true, ...(section === undefined ? {} : { section }) };
  return { ...initialState, tabs: { ...initialState.tabs, tabs: [tab], active: tab.id } } as AppState;
}

describe('chart.show', () => {
  it('offers Chart on a collection tab, and Draw and Save chart as picture… while its Chart section is shown', () => {
    expect(chartCommands.map((each) => each.id)).toEqual(['chart.show', 'chart.draw', 'chart.save-picture']);
    expect(isChartOffered(stateWith(), 'chart.show')).toBe(true);
    expect(isChartOffered(stateWith(), 'chart.draw')).toBe(false);
    expect(isChartOffered(stateWith('chart'), 'chart.draw')).toBe(true);
    expect(isChartOffered(stateWith('chart'), 'chart.save-picture')).toBe(true);
    expect(isChartOffered(stateWith(undefined, 'connection'), 'chart.show')).toBe(false);
    expect(isChartOffered(initialState, 'chart.show')).toBe(false);
  });
});

describe('codegen.show', () => {
  it('offers Code on a collection tab, and Copy code while its Code section is shown', () => {
    expect(codeCommands.map((each) => each.id)).toEqual(['codegen.show', 'codegen.copy']);
    expect(isCodeOffered(stateWith(), 'codegen.show')).toBe(true);
    expect(isCodeOffered(stateWith(), 'codegen.copy')).toBe(false);
    expect(isCodeOffered(stateWith('code'), 'codegen.copy')).toBe(true);
    expect(isCodeOffered(stateWith(undefined, 'connection'), 'codegen.show')).toBe(false);
  });
});
