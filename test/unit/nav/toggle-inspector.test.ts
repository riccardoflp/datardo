import { describe, expect, it } from 'vitest';
import { isOffered, planFor } from '../../../src/features/nav/toggle-inspector';
import { commands } from '../../../src/features/nav/commands';
import { input, local, ordersTab } from './inputs';

describe('nav.toggle-inspector', () => {
  it('Ctrl+Shift+B on a collection tab hides the island, and again shows it', () => {
    expect(commands.find((each) => each.id === 'nav.toggle-inspector')?.key).toBe('Ctrl+Shift+B');
    expect(planFor(input({ connections: [local], activeTab: ordersTab }), { args: null })).toMatchObject({
      plan: { steps: [{ text: 'hide the inspector island', action: 'nav.set-inspector', args: { hidden: true } }] },
    });
    expect(
      planFor(input({ connections: [local], activeTab: ordersTab, nav: { inspectorHidden: true } }), { args: null }),
    ).toMatchObject({ plan: { steps: [{ text: 'show the inspector island', args: { hidden: false } }] } });
  });

  it('Ctrl+Shift+B on Home does nothing', () => {
    expect(isOffered(input())).toBe(false);
    expect(planFor(input(), { args: null })).toMatchObject({ kind: 'run', plan: { steps: [] } });
  });

  it('with the island hidden, Show inspector is offered on a keys tab', () => {
    const keys = {
      kind: 'keys',
      connection: local.id,
      database: 0,
      separator: ':',
      inspection: { selected: 0, emptyLine: '' },
    } as const;
    expect(isOffered(input({ activeTab: keys, nav: { inspectorHidden: true } }))).toBe(true);
  });
});
