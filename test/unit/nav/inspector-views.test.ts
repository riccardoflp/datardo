/**
 * The two views of the inspector island, the selection and the formatting rules (M41): which pages offer Formatting,
 * what the first row shows, and the plans that choose a view.
 */
import { describe, expect, it } from 'vitest';
import { commands as registered } from '../../../src/features/commands';
import { commands } from '../../../src/features/nav/commands';
import { view } from '../../../src/features/nav/inspector';
import { isViewOffered, planFor } from '../../../src/features/nav/toggle-inspector';
import type { ActiveTab } from '../../../src/features/nav/types';
import { input, local, ordersTab } from './inputs';

const keysTab: ActiveTab = {
  kind: 'keys',
  connection: local.id,
  database: 0,
  separator: ':',
  inspection: { selected: 0, emptyLine: '' },
};

const indexesTab: ActiveTab = { ...ordersTab, section: 'indexes' };

describe('nav.inspector', () => {
  it('on the Documents section of shop.orders the first row reads Selection and Formatting; on a keys tab and on the Indexes section it has no tabs', () => {
    expect(view(input({ connections: [local], activeTab: ordersTab }))).toMatchObject({
      kind: 'shown',
      views: { selection: 'Selection', formatting: 'Formatting', shown: 'selection' },
    });
    expect(view(input({ activeTab: keysTab }))).not.toHaveProperty('views');
    expect(view(input({ connections: [local], activeTab: indexesTab }))).not.toHaveProperty('views');
  });

  it('with Formatting chosen, the island shows the Formatting view whatever is selected', () => {
    const selected = { ...ordersTab, inspection: { selected: 1, title: 'orders · 1', emptyLine: '' } };
    expect(view(input({ activeTab: selected, nav: { inspectorView: 'formatting' } }))).toMatchObject({
      kind: 'shown',
      views: { shown: 'formatting' },
      body: { kind: 'formatting' },
    });
  });

  it('with Formatting chosen, a keys tab shows the selection, and shop.orders the Formatting view again', () => {
    const nav = { inspectorView: 'formatting' } as const;
    expect(view(input({ activeTab: keysTab, nav }))).toMatchObject({
      kind: 'shown',
      body: { kind: 'nothing-selected' },
    });
    expect(view(input({ activeTab: ordersTab, nav }))).toMatchObject({ body: { kind: 'formatting' } });
  });

  it('hidden by the user, it is not shown on the Formatting view either', () => {
    expect(view(input({ activeTab: ordersTab, nav: { inspectorHidden: true, inspectorView: 'formatting' } }))).toEqual({
      kind: 'not-shown',
      why: 'hidden-by-user',
    });
  });
});

describe('nav.toggle-inspector', () => {
  const shown = input({ connections: [local], activeTab: ordersTab, nav: { inspectorView: 'formatting' } });

  it('Formatting in the toolbar of shop.orders shows the Formatting view; a second click shows the Selection view', () => {
    const asked = { args: { view: 'formatting', toggle: true } };
    expect(planFor(input({ activeTab: ordersTab }), asked)).toMatchObject({
      plan: {
        steps: [
          {
            text: 'show the Formatting view of the inspector island',
            action: 'nav.set-inspector',
            args: { hidden: false, view: 'formatting' },
          },
        ],
      },
    });
    expect(planFor(shown, asked)).toMatchObject({
      plan: { steps: [{ text: 'show the selection in the inspector island', args: { view: 'selection' } }] },
    });
  });

  it('Ctrl+Shift+F on a keys tab and on Home does nothing, and Go to lists no Formatting rules there', () => {
    expect(commands.find((each) => each.id === 'nav.toggle-inspector:formatting')?.key).toBe('Ctrl+Shift+F');
    for (const activeTab of [keysTab, { kind: 'app', page: 'home' } as const]) {
      expect(isViewOffered(input({ activeTab }), 'formatting')).toBe(false);
      expect(planFor(input({ activeTab }), { args: 'formatting' })).toMatchObject({ plan: { steps: [] } });
    }
    expect(isViewOffered(input({ activeTab: ordersTab }), 'formatting')).toBe(true);
  });

  it('Inspect the selection is offered only while the Formatting view is shown', () => {
    expect(isViewOffered(input({ activeTab: ordersTab }), 'selection')).toBe(false);
    expect(isViewOffered(shown, 'selection')).toBe(true);
  });

  it('Ctrl+Shift+B with the Formatting view shown hides the island; again, it shows it on the Formatting view', () => {
    expect(planFor(shown, { args: null })).toMatchObject({
      plan: { steps: [{ text: 'hide the inspector island', args: { hidden: true } }] },
    });
    const hidden = input({ activeTab: ordersTab, nav: { inspectorView: 'formatting', inspectorHidden: true } });
    const again = planFor(hidden, { args: null });
    expect(again).toMatchObject({ plan: { steps: [{ args: { hidden: false } }] } });
    expect(view({ ...hidden, nav: { ...hidden.nav, inspectorHidden: false } })).toMatchObject({
      body: { kind: 'formatting' },
    });
  });

  it('with the island hidden, Formatting rules shows it on the Formatting view', () => {
    const hidden = input({ activeTab: ordersTab, nav: { inspectorHidden: true, inspectorView: 'formatting' } });
    expect(planFor(hidden, { args: 'formatting' })).toMatchObject({
      plan: { steps: [{ args: { hidden: false, view: 'formatting' } }] },
    });
  });
});

describe('palette.commands', () => {
  it('Ctrl+Shift+F starts nav.toggle-inspector:formatting, titled Formatting rules', () => {
    const found = registered.filter((each) => each.key === 'Ctrl+Shift+F');
    expect(found.map((each) => [each.id, each.title])).toEqual([
      ['nav.toggle-inspector:formatting', 'Formatting rules'],
    ]);
    expect(registered.find((each) => each.id === 'nav.toggle-inspector:selection')?.title).toBe(
      'Inspect the selection',
    );
  });
});
