import { describe, expect, it } from 'vitest';
import { layout } from '../../../src/features/nav/layout';
import * as position from '../../../src/features/query/position';
import { commands } from '../../../src/features/commands';
import { islandFields, islandsOf, queryPaneWidthOf } from '../../../src/main/nav';
import type { AppStep, Outcome } from '../../../src/shared/feature';
import { connectionId, tabId } from '../../../src/shared/ids';
import type { AppState } from '../../../src/shared/state';
import { initialNavState } from '../../../src/shared/state/nav';
import type { Tab } from '../../../src/shared/state/tabs';
import { contextOf, stateWithSettings } from './context';

function stepsOf(outcome: Outcome): readonly AppStep[] {
  if (outcome.kind !== 'run') {
    throw new Error(`Expected a plan, got ${outcome.kind}.`);
  }
  return outcome.plan.steps.filter((step): step is AppStep => step.kind === 'app');
}

function planned(args: unknown, state: AppState = stateWithSettings()): Outcome {
  return position.plan(contextOf('query.position', state), { args });
}

/** The app's state with the place stored and a collection tab of `shop.orders` active, showing `section`. */
function onCollectionTab(stored: Record<string, string>, section?: string): AppState {
  const state = stateWithSettings(stored);
  const tab: Tab = {
    id: tabId('t1'),
    shows: { kind: 'collection', connection: connectionId('c-local'), database: 'shop', collection: 'orders' },
    ...(section === undefined ? {} : { section }),
    lastActive: 0,
    loaded: true,
  };
  return { ...state, tabs: { ...state.tabs, tabs: [tab], active: tab.id } };
}

describe('query.position', () => {
  it('shows the query above with nothing stored, the toggle not pressed, with the tooltip to put it at the right', () => {
    const settings = stateWithSettings().settings;
    expect(position.queryPosition(settings)).toBe('top');
    expect(position.queryPlace('top', 1_000, 380)).toEqual({
      side: false,
      width: 380,
      pressed: false,
      tip: 'Query at the right of the results',
    });
  });

  it('puts the query at the right in one step that writes datardo.query.position, pressed, with the tooltip to put it above', () => {
    const steps = stepsOf(planned({ position: 'right' }));
    expect(steps).toEqual([
      {
        kind: 'app',
        text: 'set datardo.query.position to right',
        action: 'settings.write',
        args: { name: 'datardo.query.position', value: 'right' },
      },
    ]);
    const shown = position.queryPlace('right', 1_920 - 48 - 8 - 288 - 368, 380);
    expect([shown.side, shown.width, shown.pressed, shown.tip]).toEqual([true, 380, true, 'Query above the results']);
  });

  it('puts the query above again, which removes the setting from settings.json', () => {
    expect(stepsOf(planned({ position: 'top' }))[0]).toMatchObject({
      text: 'set datardo.query.position to top',
      args: { name: 'datardo.query.position', value: null },
    });
  });

  it('is started the same from Go to, whose commands are offered on a collection tab with the query bar', () => {
    expect(stepsOf(planned('right'))[0]?.text).toBe('set datardo.query.position to right');
    expect(commands.filter((each) => each.id.startsWith('query.position')).map((each) => each.title)).toEqual([
      'Query at the right of the results',
      'Query above the results',
    ]);
    const above = onCollectionTab({});
    expect([
      position.isOffered(above, 'query.position:right'),
      position.isOffered(above, 'query.position:top'),
    ]).toEqual([true, false]);
    const right = onCollectionTab({ 'datardo.query.position': 'right' }, 'schema');
    expect([
      position.isOffered(right, 'query.position:right'),
      position.isOffered(right, 'query.position:top'),
    ]).toEqual([false, true]);
    expect(position.isOffered(onCollectionTab({}, 'indexes'), 'query.position:right')).toBe(false);
    expect(position.isOffered(stateWithSettings(), 'query.position:right')).toBe(false);
  });

  it('gives each worked example its place and widths', () => {
    const place = (main: number, chosen: position.QueryPosition, remembered: number) => {
      const shown = position.queryPlace(chosen, main, remembered);
      return shown.side ? [shown.width, main - 8 - shown.width] : 'above';
    };
    expect(place(1_000, 'right', 380)).toEqual([380, 612]);
    expect(place(700, 'right', 380)).toEqual([332, 360]);
    expect(place(628, 'right', 380)).toEqual([260, 360]);
    expect(place(627, 'right', 380)).toBe('above');
    expect(place(1_000, 'right', 900)).toEqual([632, 360]);
    expect(place(1_000, 'top', 500)).toBe('above');
    const shown = layout(1_280, { wanted: true, width: 280 }, { wanted: true, width: 360 });
    expect(shown.main).toBe(568);
    expect(place(shown.main, 'right', 380)).toBe('above');
    const hidden = layout(1_280, { wanted: false, width: 280 }, { wanted: true, width: 360 });
    expect(hidden.main).toBe(856);
    expect(place(hidden.main, 'right', 380)).toEqual([380, 468]);
  });

  it('keeps the toggle pressed and says why while the tab is too narrow, and remembers the width', () => {
    expect(position.queryPlace('right', 568, 380)).toEqual({
      side: false,
      width: 380,
      pressed: true,
      tip: 'Query at the right of the results: the tab is too narrow, so it is above them for now',
    });
  });

  it('resizes the pane with the splitter: a drag, the keys, a double click, within the limits', () => {
    const main = 1_000;
    const dragged = position.draggedWidth(380 + 40, main);
    expect(dragged).toBe(420);
    expect(stepsOf(planned({ width: dragged }))).toEqual([
      {
        kind: 'app',
        text: 'set the width of the query pane to 420 px',
        action: 'nav.set-widths',
        args: { queryPane: 420 },
      },
    ]);
    expect(position.keyedWidth('ArrowLeft', false, 420, main)).toBe(440);
    expect(position.keyedWidth('ArrowRight', true, 440, main)).toBe(380);
    expect(position.keyedWidth('Home', false, 380, main)).toBe(260);
    expect(position.keyedWidth('Enter', false, 260, main)).toBe(380);
    expect(position.queryPaneDefault).toBe(380);
    expect(position.keyedWidth('End', false, 380, main)).toBe(632);
    expect(position.keyedWidth('a', false, 380, main)).toBeUndefined();
    expect([position.draggedWidth(100, main), position.draggedWidth(2_000, 2_000)]).toEqual([260, 900]);
  });

  it('keeps the width in window.json, read back after a restart', () => {
    const fields = islandFields({ ...initialNavState, queryPaneWidth: 420 });
    expect(fields['queryPaneWidth']).toBe(420);
    expect(islandsOf(fields, initialNavState).queryPaneWidth).toBe(420);
  });

  it('reads a stored place other than top or right as top, and a stored width that is not one as 380 px', () => {
    expect(position.queryPosition(stateWithSettings({ 'datardo.query.position': 'left' }).settings)).toBe('top');
    expect([
      queryPaneWidthOf('wide'),
      queryPaneWidthOf(undefined),
      queryPaneWidthOf(100),
      queryPaneWidthOf(2_000),
    ]).toEqual([380, 380, 260, 900]);
  });

  it('writes nothing to a deployment and records nothing, through a read-only connection too', () => {
    const outcome = planned({ position: 'right' });
    expect(outcome).toMatchObject({ kind: 'run', plan: { danger: { kind: 'none' }, publishes: false } });
    if (outcome.kind !== 'run') {
      throw new Error('Expected a plan.');
    }
    expect(outcome.plan.steps.map((step) => step.kind)).toEqual(['app']);
  });
});
