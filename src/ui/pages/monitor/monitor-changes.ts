/**
 * What the user changes on a Monitor page tab: the section (`monitor.show` with `{ section }`, which the tab keeps),
 * the choices of the controls (kept with the tab by `monitor.show` with `{ choices }` once they settle, while the tab
 * is the active tab), what is selected in each section and the values typed before **Apply**, which the window alone
 * keeps. A choice that changes what is read (**Idle connections**, **Source**, **Database**, **Since**) reads again.
 */
import { monitorChoicesRecord, type MonitorChoices } from '../../../features/monitor/parts/choices';
import type { MonitorSection } from '../../../features/monitor/types';
import { startFeature } from '../../shell/intent';
import { readSection } from './monitor-reads';
import { changeMonitorTab, monitorTabOf, type MonitorSelection, type SlowDrafts } from './monitor-store';

/** How long the choices stay unchanged before the tab keeps them, in ms (Datardo's choice, as the Server page). */
const settleMs = 600;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const held = new Set<string>();

function keepChoices(tab: string): void {
  timers.delete(tab);
  const state = monitorTabOf(tab);
  if (state !== undefined) {
    startFeature('monitor.show', {
      place: 'toolbar',
      target: { kind: 'connection', connection: state.connection },
      args: { choices: monitorChoicesRecord(state.choices) },
    });
  }
}

/** Changes the choices of a tab; the tab keeps them once they settle. */
export function changeChoices(tab: string, change: (choices: MonitorChoices) => MonitorChoices): void {
  changeMonitorTab(tab, (state) => ({ ...state, choices: change(state.choices) }));
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
  }
  timers.set(
    tab,
    setTimeout(() => {
      keepChoices(tab);
    }, settleMs),
  );
}

/** Changes a choice that changes what a section reads, and reads it again. */
export function changeReadChoices(
  tab: string,
  section: MonitorSection,
  change: (choices: MonitorChoices) => MonitorChoices,
): void {
  changeChoices(tab, change);
  changeMonitorTab(tab, (state) => ({ ...state, selected: {}, drafts: {} }));
  void readSection(tab, section, 'refresh');
}

/** The tab stops being shown: choices not kept yet wait until it is shown again, so that no other tab is left. */
export function holdChoices(tab: string): void {
  const timer = timers.get(tab);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(tab);
    held.add(tab);
  }
}

/** The tab is shown again: the choices it held are kept now. */
export function keepHeldChoices(tab: string): void {
  if (held.delete(tab)) {
    keepChoices(tab);
  }
}

/** Shows another section: the tab keeps it, and the page reads it once the tab says so. */
export function chooseSection(tab: string, section: MonitorSection): void {
  const state = monitorTabOf(tab);
  if (state !== undefined) {
    startFeature('monitor.show', {
      place: 'section-bar',
      target: { kind: 'connection', connection: state.connection },
      args: { section },
    });
  }
}

/** Selects in a section of the tab, in place of what was selected there. */
export function select(tab: string, change: (selected: MonitorSelection) => MonitorSelection): void {
  changeMonitorTab(tab, (state) => ({ ...state, selected: change(state.selected) }));
}

/** Changes a value typed in the controls of the profiler or of the threshold. */
export function changeDrafts(tab: string, change: (drafts: SlowDrafts) => SlowDrafts): void {
  changeMonitorTab(tab, (state) => ({ ...state, drafts: change(state.drafts) }));
}
